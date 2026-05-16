import { withPlayerJoinCodeContext } from '@/lib/db/client';
import { players } from '@/lib/db/schema';
import { beginSpan, emitMetric } from '@/lib/observability/log';
import { eq, and, gt } from 'drizzle-orm';
import { z } from 'zod';
import { createPlayerSessionToken } from '@/lib/auth/player-token';
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit';

const joinCodeSchema = z.object({
  joinCode: z.string().trim().toUpperCase().min(4).max(8),
});

export async function POST(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/player-auth' }, req);

  try {
    const body = await req.json();
    const { joinCode } = joinCodeSchema.parse(body);
    const ip = getClientIp(req);
    const ipLimiter = await checkRateLimit({
      key: `player-auth:ip:${ip}`,
      maxAttempts: 20,
      windowMs: 60 * 1000,
    });
    if (!ipLimiter.allowed) {
      emitMetric('player_auth_rate_limited', 1, {
        limiter: 'ip',
        route: '/api/player-auth',
      });
      span.done({ result: 'rate_limited_ip', ip });
      return Response.json(
        { error: 'Too many attempts. Try again shortly.' },
        {
          status: 429,
          headers: { 'Retry-After': String(ipLimiter.retryAfterSeconds) },
        },
      );
    }
    const codeLimiter = await checkRateLimit({
      key: `player-auth:code:${joinCode}`,
      maxAttempts: 10,
      windowMs: 60 * 1000,
    });
    if (!codeLimiter.allowed) {
      emitMetric('player_auth_rate_limited', 1, {
        limiter: 'join_code',
        route: '/api/player-auth',
      });
      span.done({ result: 'rate_limited_code' });
      return Response.json(
        { error: 'Too many attempts. Try again shortly.' },
        {
          status: 429,
          headers: { 'Retry-After': String(codeLimiter.retryAfterSeconds) },
        },
      );
    }

    // Join codes are global credentials, but still RLS-scoped: the DB policy
    // only allows selecting the row whose join_code matches app.join_code.
    const result = await withPlayerJoinCodeContext(joinCode, async (tx) =>
      tx
        .select()
        .from(players)
        .where(
          and(
            eq(players.joinCode, joinCode),
            gt(players.joinCodeExpiresAt, new Date()),
          ),
        )
        .limit(1),
    );

    const player = result[0];

    if (!player) {
      emitMetric('player_auth_invalid_join_code', 1, {
        route: '/api/player-auth',
        codeLength: joinCode.length,
      });
      span.done({ result: 'invalid_code', ip });
      return Response.json(
        { error: 'Invalid or expired join code' },
        { status: 401 },
      );
    }

    span.done({ playerId: player.id, programId: player.programId });
    const token = createPlayerSessionToken({
      playerId: player.id,
      programId: player.programId,
      playerUpdatedAt: player.updatedAt,
      joinCodeExpiresAt: player.joinCodeExpiresAt,
    });

    return Response.json({
      player: {
        id: player.id,
        programId: player.programId,
        firstName: player.firstName,
        lastName: player.lastName,
        jerseyNumber: player.jerseyNumber,
        positions: player.positions,
      },
      token,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      emitMetric('player_auth_invalid_join_code_format', 1, {
        route: '/api/player-auth',
        issueCount: error.issues.length,
      });
      span.done({ result: 'invalid_format' });
      return Response.json({ error: 'Invalid join code format' }, { status: 400 });
    }
    span.fail(error);
    return Response.json({ error: 'Authentication failed' }, { status: 500 });
  }
}
