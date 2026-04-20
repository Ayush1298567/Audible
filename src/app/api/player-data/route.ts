import { withProgramContext } from '@/lib/db/client';
import { plays, games, opponents, gamePlans, players } from '@/lib/db/schema';
import { gamePlanPlays, gamePlanAssignments } from '@/lib/db/schema-gameplan';
import { beginSpan } from '@/lib/observability/log';
import { eq, and, desc, inArray, sql } from 'drizzle-orm';
import {
  filmGrades,
  playerSessionResults,
  sessions,
  sessionPlays,
} from '@/lib/db/schema-sessions';
import { verifyPlayerSessionToken } from '@/lib/auth/player-token';
import { resolvePlayClipReadUrl } from '@/lib/blob/play-clip-url';

export async function GET(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/player-data' }, req);

  try {
    const url = new URL(req.url);
    const programId = url.searchParams.get('programId');
    const playerId = url.searchParams.get('playerId');
    const type = url.searchParams.get('type') ?? 'film';

    if (!programId) {
      return Response.json({ error: 'programId required' }, { status: 400 });
    }
    if (!playerId) {
      return Response.json({ error: 'playerId required' }, { status: 400 });
    }
    const token = req.headers.get('x-player-token');
    if (!token) {
      return Response.json({ error: 'Missing player session token' }, { status: 401 });
    }
    const claims = verifyPlayerSessionToken(token);
    if (!claims) {
      return Response.json({ error: 'Invalid or expired player token' }, { status: 401 });
    }
    if (claims.playerId !== playerId || claims.programId !== programId) {
      return Response.json({ error: 'Forbidden: token scope mismatch' }, { status: 403 });
    }

    const [player] = await withProgramContext(programId, async (tx) =>
      tx
        .select({
          id: players.id,
          positions: players.positions,
          status: players.status,
          updatedAt: players.updatedAt,
          joinCodeExpiresAt: players.joinCodeExpiresAt,
        })
        .from(players)
        .where(and(eq(players.id, playerId), eq(players.programId, programId)))
        .limit(1),
    );

    if (!player) {
      return Response.json({ error: 'Player not found in this program' }, { status: 404 });
    }
    if (player.status !== 'available') {
      return Response.json({ error: 'Player access revoked' }, { status: 403 });
    }
    if (player.updatedAt.toISOString() !== claims.playerUpdatedAt) {
      return Response.json({ error: 'Session invalidated; please rejoin' }, { status: 401 });
    }
    const currentJoinCodeExpiry = player.joinCodeExpiresAt
      ? player.joinCodeExpiresAt.toISOString()
      : null;
    if (currentJoinCodeExpiry !== claims.joinCodeExpiresAt) {
      return Response.json({ error: 'Session invalidated; please rejoin' }, { status: 401 });
    }

    switch (type) {
      case 'film': {
        const positionGroups = player.positions ?? [];
        if (positionGroups.length === 0) {
          span.done({ type, count: 0, reason: 'no_positions' });
          return Response.json({ plays: [] });
        }

        const pushedPlayIds = await withProgramContext(programId, async (tx) =>
          tx
            .select({ playId: sessionPlays.playId })
            .from(sessionPlays)
            .innerJoin(sessions, eq(sessionPlays.sessionId, sessions.id))
            .where(
              and(
                eq(sessions.programId, programId),
                eq(sessions.isPublished, true),
                inArray(sessions.positionGroup, positionGroups),
              ),
            ),
        );

        const idList = [...new Set(pushedPlayIds.map((r) => r.playId).filter(Boolean))];
        if (idList.length === 0) {
          span.done({ type, count: 0, reason: 'no_published_sessions' });
          return Response.json({ plays: [] });
        }

        const result = await withProgramContext(programId, async (tx) =>
          tx
            .select({
              id: plays.id,
              playOrder: plays.playOrder,
              down: plays.down,
              distance: plays.distance,
              formation: plays.formation,
              playType: plays.playType,
              gainLoss: plays.gainLoss,
              clipBlobKey: plays.clipBlobKey,
              opponentName: opponents.name,
            })
            .from(plays)
            .leftJoin(games, eq(plays.gameId, games.id))
            .leftJoin(opponents, eq(games.opponentId, opponents.id))
            .where(
              and(
                eq(plays.programId, programId),
                eq(plays.status, 'ready'),
                inArray(plays.id, idList),
              ),
            )
            .orderBy(desc(plays.createdAt))
            .limit(50),
        );

        const playsOut = result.map((row) => ({
          ...row,
          clipBlobKey: resolvePlayClipReadUrl(row.clipBlobKey),
        }));

        span.done({ type, count: playsOut.length });
        return Response.json({ plays: playsOut });
      }

      case 'gameplan': {
        const positionGroups = player.positions ?? [];

        const [plan] = await withProgramContext(programId, async (tx) =>
          tx
            .select()
            .from(gamePlans)
            .where(
              and(eq(gamePlans.programId, programId), eq(gamePlans.publishStatus, 'published')),
            )
            .orderBy(desc(gamePlans.publishedAt))
            .limit(1),
        );

        if (!plan) {
          span.done({ type, result: 'no_published_plan' });
          return Response.json({ gamePlan: null, plays: [] });
        }

        if (positionGroups.length === 0) {
          span.done({ type, gamePlanId: plan.id, playCount: 0, reason: 'no_positions' });
          return Response.json({ gamePlan: plan, plays: [] });
        }

        const assignments = await withProgramContext(programId, async (tx) =>
          tx
            .select()
            .from(gamePlanAssignments)
            .where(
              and(
                eq(gamePlanAssignments.gamePlanId, plan.id),
                inArray(gamePlanAssignments.positionGroup, positionGroups),
              ),
            ),
        );

        const planRows = await withProgramContext(programId, async (tx) =>
          tx
            .select({
              id: gamePlanPlays.id,
              playbookPlayId: gamePlanPlays.playbookPlayId,
            })
            .from(gamePlanPlays)
            .where(eq(gamePlanPlays.gamePlanId, plan.id)),
        );

        const planPlayIdSet = new Set(planRows.map((r) => r.id));
        const playbookToPlanPlayId = new Map<string, string>();
        for (const row of planRows) {
          if (row.playbookPlayId) playbookToPlanPlayId.set(row.playbookPlayId, row.id);
        }

        const resolvedPlanPlayIds = new Set<string>();
        for (const a of assignments) {
          const raw = a.relatedPlayIds;
          if (!Array.isArray(raw)) continue;
          for (const id of raw) {
            if (typeof id !== 'string' || id.length === 0) continue;
            if (planPlayIdSet.has(id)) resolvedPlanPlayIds.add(id);
            else {
              const mapped = playbookToPlanPlayId.get(id);
              if (mapped) resolvedPlanPlayIds.add(mapped);
            }
          }
        }

        if (resolvedPlanPlayIds.size === 0) {
          span.done({ type, gamePlanId: plan.id, playCount: 0, reason: 'no_assignment_play_ids' });
          return Response.json({ gamePlan: plan, plays: [] });
        }

        const planPlays = await withProgramContext(programId, async (tx) =>
          tx
            .select()
            .from(gamePlanPlays)
            .where(
              and(
                eq(gamePlanPlays.gamePlanId, plan.id),
                inArray(gamePlanPlays.id, [...resolvedPlanPlayIds]),
              ),
            )
            .orderBy(gamePlanPlays.situation, gamePlanPlays.sortOrder),
        );

        span.done({ type, gamePlanId: plan.id, playCount: planPlays.length });
        return Response.json({ gamePlan: plan, plays: planPlays });
      }

      case 'progress': {
        const [sessionStats] = await withProgramContext(programId, async (tx) =>
          tx
            .select({
              sessionsCompleted: sql<number>`cast(count(*) as int)`,
              avgAccuracy: sql<number | null>`avg(${playerSessionResults.accuracy})`,
              avgDecisionMs:
                sql<number | null>`avg(${playerSessionResults.averageDecisionTimeMs})`,
            })
            .from(playerSessionResults)
            .where(
              and(
                eq(playerSessionResults.programId, programId),
                eq(playerSessionResults.playerId, playerId),
                eq(playerSessionResults.completed, true),
              ),
            ),
        );

        const [filmStats] = await withProgramContext(programId, async (tx) =>
          tx
            .select({
              filmGrades: sql<number>`cast(count(*) as int)`,
              averageFilmGrade: sql<number | null>`avg(${filmGrades.grade})`,
            })
            .from(filmGrades)
            .where(and(eq(filmGrades.programId, programId), eq(filmGrades.playerId, playerId))),
        );

        span.done({ type, playerId, sessionsCompleted: sessionStats?.sessionsCompleted ?? 0 });
        return Response.json({
          progress: {
            positions: player.positions,
            sessionsCompleted: sessionStats?.sessionsCompleted ?? 0,
            averageAccuracy: sessionStats?.avgAccuracy,
            averageDecisionTimeMs: sessionStats?.avgDecisionMs,
            filmGradesCount: filmStats?.filmGrades ?? 0,
            averageFilmGrade: filmStats?.averageFilmGrade,
          },
        });
      }

      default:
        return Response.json({ error: `Unknown type: ${type}` }, { status: 400 });
    }
  } catch (error) {
    span.fail(error);
    return Response.json({ error: 'Failed to fetch player data' }, { status: 500 });
  }
}
