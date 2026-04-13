import { withProgramContext } from '@/lib/db/client';
import { collections, collectionPlays } from '@/lib/db/schema';
import { beginSpan } from '@/lib/observability/log';
import { eq, and, desc, sql } from 'drizzle-orm';
import { z } from 'zod';

// ─── GET: List collections for a program ────────────────────────

export async function GET(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/collections', method: 'GET' }, req);

  try {
    const url = new URL(req.url);
    const programId = url.searchParams.get('programId');
    if (!programId) {
      return Response.json({ error: 'programId required' }, { status: 400 });
    }

    const result = await withProgramContext(programId, async (tx) =>
      tx
        .select({
          id: collections.id,
          name: collections.name,
          description: collections.description,
          createdAt: collections.createdAt,
          playCount: sql<number>`(
            SELECT COUNT(*) FROM collection_plays
            WHERE collection_plays.collection_id = ${collections.id}
          )`.as('play_count'),
        })
        .from(collections)
        .where(eq(collections.programId, programId))
        .orderBy(desc(collections.createdAt)),
    );

    span.done({ count: result.length });
    return Response.json({ collections: result });
  } catch (error) {
    span.fail(error);
    return Response.json({ error: 'Failed to fetch collections' }, { status: 500 });
  }
}

// ─── POST: Create a collection ──────────────────────────────────

const createSchema = z.object({
  programId: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
});

export async function POST(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/collections', method: 'POST' }, req);

  try {
    const body = await req.json();
    const input = createSchema.parse(body);

    const [collection] = await withProgramContext(input.programId, async (tx) =>
      tx
        .insert(collections)
        .values({
          programId: input.programId,
          name: input.name,
          description: input.description ?? null,
        })
        .returning(),
    );

    span.done({ collectionId: collection?.id });
    return Response.json({ collection }, { status: 201 });
  } catch (error) {
    span.fail(error);
    if (error instanceof z.ZodError) {
      return Response.json({ error: 'Validation failed', details: error.issues }, { status: 400 });
    }
    return Response.json({ error: 'Failed to create collection' }, { status: 500 });
  }
}

// ─── PATCH: Add or remove a play from a collection ──────────────

const modifySchema = z.object({
  programId: z.string().uuid(),
  collectionId: z.string().uuid(),
  playId: z.string().uuid(),
  action: z.enum(['add', 'remove']),
});

export async function PATCH(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/collections', method: 'PATCH' }, req);

  try {
    const body = await req.json();
    const input = modifySchema.parse(body);

    await withProgramContext(input.programId, async (tx) => {
      if (input.action === 'add') {
        await tx
          .insert(collectionPlays)
          .values({
            collectionId: input.collectionId,
            playId: input.playId,
          })
          .onConflictDoNothing();
      } else {
        await tx
          .delete(collectionPlays)
          .where(
            and(
              eq(collectionPlays.collectionId, input.collectionId),
              eq(collectionPlays.playId, input.playId),
            ),
          );
      }
    });

    span.done({ action: input.action });
    return Response.json({ ok: true });
  } catch (error) {
    span.fail(error);
    if (error instanceof z.ZodError) {
      return Response.json({ error: 'Validation failed', details: error.issues }, { status: 400 });
    }
    return Response.json({ error: 'Failed to modify collection' }, { status: 500 });
  }
}

// ─── DELETE: Delete a collection ────────────────────────────────

const deleteSchema = z.object({
  programId: z.string().uuid(),
  collectionId: z.string().uuid(),
});

export async function DELETE(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/collections', method: 'DELETE' }, req);

  try {
    const body = await req.json();
    const input = deleteSchema.parse(body);

    await withProgramContext(input.programId, async (tx) =>
      tx
        .delete(collections)
        .where(
          and(
            eq(collections.id, input.collectionId),
            eq(collections.programId, input.programId),
          ),
        ),
    );

    span.done({ collectionId: input.collectionId });
    return Response.json({ ok: true });
  } catch (error) {
    span.fail(error);
    if (error instanceof z.ZodError) {
      return Response.json({ error: 'Validation failed', details: error.issues }, { status: 400 });
    }
    return Response.json({ error: 'Failed to delete collection' }, { status: 500 });
  }
}
