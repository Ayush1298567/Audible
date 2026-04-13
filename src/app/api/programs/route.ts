import { db } from '@/lib/db/client';
import { programs, seasons, plays } from '@/lib/db/schema';
import { beginSpan } from '@/lib/observability/log';
import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

// ─── GET: List all programs with play count (prefer programs with data) ──

export async function GET(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/programs', method: 'GET' }, req);

  try {
    // Use a direct query to bypass RLS for the count
    // (programs table itself has no RLS, but the plays subquery would need a context)
    const result = await db.execute(sql`
      SELECT p.id, p.name, p.level,
        (SELECT COUNT(*) FROM plays pl WHERE pl.program_id = p.id) as play_count
      FROM programs p
      ORDER BY play_count DESC
      LIMIT 10
    `);

    span.done({ count: result.length });
    return Response.json({ programs: result });
  } catch (error) {
    span.fail(error);
    return Response.json({ error: 'Failed to fetch programs' }, { status: 500 });
  }
}

const createProgramSchema = z.object({
  name: z.string().min(1).max(200),
  level: z.enum(['hs', 'd2', 'd3']),
  city: z.string().max(100).optional(),
  state: z.string().length(2).optional(),
  seasonYear: z.number().int().min(2020).max(2030),
});

export async function POST(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/programs' }, req);

  try {
    const body = await req.json();
    const input = createProgramSchema.parse(body);

    // Create program (no RLS context needed — programs table is unscoped)
    const [program] = await db
      .insert(programs)
      .values({
        name: input.name,
        level: input.level,
        city: input.city ?? null,
        state: input.state ?? null,
        // Placeholder clerk org ID — replaced when Clerk is wired in
        clerkOrgId: `placeholder_${Date.now()}`,
      })
      .returning();

    if (!program) {
      throw new Error('Program insert returned no rows');
    }

    // Create the initial season
    const [season] = await db
      .insert(seasons)
      .values({
        programId: program.id,
        year: input.seasonYear,
      })
      .returning();

    span.done({ programId: program.id, seasonId: season?.id });

    return Response.json({
      program: { id: program.id, name: program.name },
      season: { id: season?.id, year: input.seasonYear },
    }, { status: 201 });
  } catch (error) {
    span.fail(error);

    if (error instanceof z.ZodError) {
      return Response.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 },
      );
    }

    return Response.json(
      { error: 'Failed to create program' },
      { status: 500 },
    );
  }
}
