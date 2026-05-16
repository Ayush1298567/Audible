/**
 * Row-Level Security isolation test.
 *
 * This mutates a real Postgres database, so it only runs when both
 * DATABASE_URL and RUN_DB_TESTS=1 are present. Use a Neon branch or local
 * database, never production.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';

const HAS_DATABASE_URL = Boolean(process.env.DATABASE_URL);
const DB_TESTS_ENABLED = process.env.RUN_DB_TESTS === '1';
const SHOULD_RUN = HAS_DATABASE_URL && DB_TESTS_ENABLED;
const testRunId = `rls-${Date.now()}-${Math.random().toString(16).slice(2)}`;

type DbModule = typeof import('@/lib/db/client');
type SchemaModule = typeof import('@/lib/db/schema');

let dbModule: DbModule;
let schema: SchemaModule;
let programAId: string;
let programBId: string;
let gameAId: string;
let gameBId: string;
let playerJoinCode: string;
let expiredPlayerJoinCode: string;

describe.skipIf(SHOULD_RUN || !HAS_DATABASE_URL)('DB test safety gate', () => {
  it('fails when DATABASE_URL is present but RUN_DB_TESTS=1 is missing', () => {
    expect(
      process.env.RUN_DB_TESTS,
      'DATABASE_URL is configured, so set RUN_DB_TESTS=1 only on a safe Neon branch/local DB, or unset DATABASE_URL to skip DB tests.',
    ).toBe('1');
  });
});

describe.skipIf(SHOULD_RUN || !DB_TESTS_ENABLED)('DB test configuration gate', () => {
  it('fails when RUN_DB_TESTS=1 is set without DATABASE_URL', () => {
    expect(
      process.env.DATABASE_URL,
      'RUN_DB_TESTS=1 was set, but DATABASE_URL is missing.',
    ).toBeTruthy();
  });
});

describe.skipIf(!SHOULD_RUN)('RLS cross-program isolation', () => {
  beforeAll(async () => {
    dbModule = await import('@/lib/db/client');
    schema = await import('@/lib/db/schema');

    const [programA, programB] = await dbModule.db
      .insert(schema.programs)
      .values([
        {
          name: `RLS Test A ${testRunId}`,
          level: 'hs',
          clerkOrgId: `org_${testRunId}_a`,
        },
        {
          name: `RLS Test B ${testRunId}`,
          level: 'hs',
          clerkOrgId: `org_${testRunId}_b`,
        },
      ])
      .returning();

    if (!programA || !programB) throw new Error('Failed to create RLS test programs');
    programAId = programA.id;
    programBId = programB.id;
    playerJoinCode = `T${Math.random().toString(36).slice(2, 7).toUpperCase()}`.slice(0, 6);
    expiredPlayerJoinCode = `X${Math.random().toString(36).slice(2, 7).toUpperCase()}`.slice(
      0,
      6,
    );

    await dbModule.withProgramContext(programAId, async (tx) => {
      const [season] = await tx
        .insert(schema.seasons)
        .values({ programId: programAId, year: 2026 })
        .returning();
      const [opponent] = await tx
        .insert(schema.opponents)
        .values({ programId: programAId, name: `Opponent A ${testRunId}` })
        .returning();
      const [game] = await tx
        .insert(schema.games)
        .values({
          programId: programAId,
          seasonId: season?.id,
          opponentId: opponent?.id,
        })
        .returning();
      if (!game) throw new Error('Failed to create RLS game A');
      gameAId = game.id;
      await tx.insert(schema.plays).values({
        programId: programAId,
        gameId: gameAId,
        playOrder: 1,
        down: 1,
        distance: 10,
        formation: 'Trips Right',
        playType: 'pass',
        status: 'ready',
      });
    });

    await dbModule.withProgramContext(programBId, async (tx) => {
      const [season] = await tx
        .insert(schema.seasons)
        .values({ programId: programBId, year: 2026 })
        .returning();
      const [opponent] = await tx
        .insert(schema.opponents)
        .values({ programId: programBId, name: `Opponent B ${testRunId}` })
        .returning();
      const [game] = await tx
        .insert(schema.games)
        .values({
          programId: programBId,
          seasonId: season?.id,
          opponentId: opponent?.id,
        })
        .returning();
      if (!game) throw new Error('Failed to create RLS game B');
      gameBId = game.id;
      await tx.insert(schema.plays).values({
        programId: programBId,
        gameId: gameBId,
        playOrder: 1,
        down: 3,
        distance: 4,
        formation: 'I Right',
        playType: 'run',
        status: 'ready',
      });
      await tx.insert(schema.players).values({
        programId: programBId,
        firstName: 'Join',
        lastName: 'Code',
        jerseyNumber: 9,
        positions: ['QB'],
        joinCode: playerJoinCode,
        joinCodeExpiresAt: new Date(Date.now() + 60_000),
      });
      await tx.insert(schema.players).values({
        programId: programBId,
        firstName: 'Expired',
        lastName: 'Code',
        jerseyNumber: 10,
        positions: ['WR'],
        joinCode: expiredPlayerJoinCode,
        joinCodeExpiresAt: new Date(Date.now() - 60_000),
      });
    });
  });

  afterAll(async () => {
    if (!dbModule || !schema || (!programAId && !programBId)) return;
    await dbModule.db
      .delete(schema.programs)
      .where(inArray(schema.programs.id, [programAId, programBId].filter(Boolean)));
  });

  it('queries from one program cannot read another program rows', async () => {
    const rowsFromA = await dbModule.withProgramContext(programAId, async (tx) =>
      tx.select().from(schema.plays),
    );
    const rowsFromB = await dbModule.withProgramContext(programBId, async (tx) =>
      tx.select().from(schema.plays),
    );

    expect(rowsFromA).toHaveLength(1);
    expect(rowsFromB).toHaveLength(1);
    expect(rowsFromA.every((row) => row.programId === programAId)).toBe(true);
    expect(rowsFromB.every((row) => row.programId === programBId)).toBe(true);
    expect(new Set(rowsFromA.map((row) => row.id))).not.toEqual(
      new Set(rowsFromB.map((row) => row.id)),
    );
  });

  it('explicit cross-program predicates still return zero rows', async () => {
    const leakedRows = await dbModule.withProgramContext(programAId, async (tx) =>
      tx
        .select()
        .from(schema.plays)
        .where(
          and(
            eq(schema.plays.programId, programBId),
            eq(schema.plays.gameId, gameBId),
          ),
        ),
    );

    expect(leakedRows).toEqual([]);
  });

  it('cross-program INSERT attempts are rejected by the WITH CHECK policy', async () => {
    await expect(
      dbModule.withProgramContext(programAId, async (tx) =>
        tx.insert(schema.plays).values({
          programId: programBId,
          gameId: gameBId,
          playOrder: 99,
          down: 4,
          distance: 1,
          status: 'ready',
        }),
      ),
    ).rejects.toThrow();
  });

  it('forgetting withProgramContext returns zero rows, not leaked rows', async () => {
    const rows = await dbModule.db.select().from(schema.plays);
    expect(rows).toEqual([]);
  });

  it('player join-code context exposes only the exact unexpired player row', async () => {
    const rows = await dbModule.withPlayerJoinCodeContext(playerJoinCode, async (tx) =>
      tx
        .select()
        .from(schema.players)
        .where(eq(schema.players.joinCode, playerJoinCode)),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.programId).toBe(programBId);
  });

  it('wrong player join-code context exposes no player rows', async () => {
    const rows = await dbModule.withPlayerJoinCodeContext('NOPE00', async (tx) =>
      tx.select().from(schema.players),
    );

    expect(rows).toEqual([]);
  });

  it('expired player join-code context exposes no player rows', async () => {
    const rows = await dbModule.withPlayerJoinCodeContext(expiredPlayerJoinCode, async (tx) =>
      tx.select().from(schema.players),
    );

    expect(rows).toEqual([]);
  });
});

if (!SHOULD_RUN && !HAS_DATABASE_URL && !DB_TESTS_ENABLED) {
  console.warn(
    '[rls.test.ts] DB integration tests skipped. Set DATABASE_URL and RUN_DB_TESTS=1 on a safe database to run them.',
  );
}
