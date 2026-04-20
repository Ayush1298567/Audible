import { withProgramContext } from '@/lib/db/client';
import { filmGrades, players } from '@/lib/db/schema';
import { beginSpan } from '@/lib/observability/log';
import { eq, and, sql } from 'drizzle-orm';
import { z } from 'zod';
import { AuthError, requireCoachForProgram, requireCoachRoleForProgram } from '@/lib/auth/guards';

// ─── POST: Submit a grade ───────────────────────────────────

const gradeSchema = z.object({
  programId: z.string().uuid(),
  playId: z.string().uuid(),
  playerId: z.string().uuid(),
  grade: z.number().int().min(0).max(1),
  gradedBy: z.string().optional(),
  note: z.string().max(200).optional(),
});

export async function POST(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/grades', method: 'POST' }, req);

  try {
    const body = await req.json();
    const input = gradeSchema.parse(body);
    await requireCoachRoleForProgram('coordinator', input.programId);

    const [result] = await withProgramContext(input.programId, async (tx) =>
      tx.insert(filmGrades).values({
        programId: input.programId,
        playId: input.playId,
        playerId: input.playerId,
        grade: input.grade,
        gradedBy: input.gradedBy ?? null,
        note: input.note ?? null,
      }).returning(),
    );

    span.done({ gradeId: result?.id });
    return Response.json({ grade: result }, { status: 201 });
  } catch (error) {
    span.fail(error);
    if (error instanceof z.ZodError) {
      return Response.json({ error: 'Validation failed', details: error.issues }, { status: 400 });
    }
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: 'Failed to save grade' }, { status: 500 });
  }
}

// ─── GET: Player grade summaries ────────────────────────────

export async function GET(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/grades', method: 'GET' }, req);

  try {
    const url = new URL(req.url);
    const programId = url.searchParams.get('programId');
    const playerId = url.searchParams.get('playerId');

    if (!programId) {
      return Response.json({ error: 'programId required' }, { status: 400 });
    }
    await requireCoachForProgram(programId);

    if (playerId) {
      // Individual player grade summary
      const result = await withProgramContext(programId, async (tx) =>
        tx
          .select({
            totalPlays: sql<number>`COUNT(*)`,
            totalGrade: sql<number>`SUM(${filmGrades.grade})`,
            gradePercentage: sql<number>`CASE WHEN COUNT(*) > 0 THEN ROUND(SUM(${filmGrades.grade})::numeric / COUNT(*) * 100) ELSE 0 END`,
          })
          .from(filmGrades)
          .where(and(eq(filmGrades.programId, programId), eq(filmGrades.playerId, playerId))),
      );

      span.done({ playerId });
      return Response.json({ summary: result[0] });
    }

    // All players grade summary
    const result = await withProgramContext(programId, async (tx) =>
      tx
        .select({
          playerId: filmGrades.playerId,
          playerName: sql<string>`${players.firstName} || ' ' || ${players.lastName}`,
          jerseyNumber: players.jerseyNumber,
          totalPlays: sql<number>`COUNT(*)`,
          totalGrade: sql<number>`SUM(${filmGrades.grade})`,
          gradePercentage: sql<number>`CASE WHEN COUNT(*) > 0 THEN ROUND(SUM(${filmGrades.grade})::numeric / COUNT(*) * 100) ELSE 0 END`,
        })
        .from(filmGrades)
        .innerJoin(players, eq(filmGrades.playerId, players.id))
        .where(eq(filmGrades.programId, programId))
        .groupBy(filmGrades.playerId, players.firstName, players.lastName, players.jerseyNumber)
        .orderBy(sql`grade_percentage DESC`),
    );

    span.done({ count: result.length });
    return Response.json({ grades: result });
  } catch (error) {
    span.fail(error);
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: 'Failed to fetch grades' }, { status: 500 });
  }
}
