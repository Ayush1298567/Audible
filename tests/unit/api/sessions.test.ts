import { beforeEach, describe, expect, it, vi } from 'vitest';

const withProgramContextMock = vi.fn();
const verifyPlayerSessionTokenMock = vi.fn();

const programId = '11111111-1111-4111-8111-111111111111';
const playerId = '22222222-2222-4222-8222-222222222222';
const sessionId = '33333333-3333-4333-8333-333333333333';

class MockAuthError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

vi.mock('@/lib/db/client', () => ({
  withProgramContext: withProgramContextMock,
}));

vi.mock('@/lib/auth/player-token', () => ({
  verifyPlayerSessionToken: verifyPlayerSessionTokenMock,
}));

vi.mock('@/lib/auth/guards', () => ({
  AuthError: MockAuthError,
  requireCoachForProgram: vi.fn(),
  requireCoachRoleForProgram: vi.fn(),
}));

function submitResultRequest(headers?: HeadersInit): Request {
  return new Request('http://localhost/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({
      action: 'submitResult',
      programId,
      sessionId,
      playerId,
      totalQuestions: 4,
      correctAnswers: 3,
      averageDecisionTimeMs: 1200,
    }),
  });
}

function validClaims(overrides: Record<string, unknown> = {}) {
  return {
    playerId,
    programId,
    iat: 1,
    exp: 9999999999,
    playerUpdatedAt: '2026-01-01T00:00:00.000Z',
    joinCodeExpiresAt: '2026-02-01T00:00:00.000Z',
    ...overrides,
  };
}

function playerSelectTx(playerRows: unknown[]) {
  const limit = vi.fn(async () => playerRows);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { select };
}

function resultInsertTx(resultRows: unknown[]) {
  const returning = vi.fn(async () => resultRows);
  const values = vi.fn((_values: Record<string, unknown>) => ({ returning }));
  const insert = vi.fn(() => ({ values }));
  return { insert, values };
}

describe('POST /api/sessions submitResult', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires a player session token', async () => {
    const { POST } = await import('@/app/api/sessions/route');

    const res = await POST(submitResultRequest());

    expect(res.status).toBe(401);
    expect(withProgramContextMock).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toMatchObject({ error: 'Missing player session token' });
  });

  it('rejects token scope mismatch before touching tenant data', async () => {
    verifyPlayerSessionTokenMock.mockReturnValue(validClaims({ playerId: 'other-player' }));
    const { POST } = await import('@/app/api/sessions/route');

    const res = await POST(submitResultRequest({ 'x-player-token': 'token' }));

    expect(res.status).toBe(403);
    expect(withProgramContextMock).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toMatchObject({
      error: 'Forbidden: token scope mismatch',
    });
  });

  it('rejects revoked players', async () => {
    verifyPlayerSessionTokenMock.mockReturnValue(validClaims());
    withProgramContextMock.mockImplementationOnce(async (_programId: string, fn: (tx: unknown) => unknown) =>
      fn(
        playerSelectTx([
          {
            id: playerId,
            status: 'inactive',
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
            joinCodeExpiresAt: new Date('2026-02-01T00:00:00.000Z'),
          },
        ]),
      ),
    );
    const { POST } = await import('@/app/api/sessions/route');

    const res = await POST(submitResultRequest({ 'x-player-token': 'token' }));

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: 'Player access revoked' });
  });

  it('rejects stale player tokens when the player row changed', async () => {
    verifyPlayerSessionTokenMock.mockReturnValue(validClaims());
    withProgramContextMock.mockImplementationOnce(async (_programId: string, fn: (tx: unknown) => unknown) =>
      fn(
        playerSelectTx([
          {
            id: playerId,
            status: 'available',
            updatedAt: new Date('2026-01-01T00:00:01.000Z'),
            joinCodeExpiresAt: new Date('2026-02-01T00:00:00.000Z'),
          },
        ]),
      ),
    );
    const { POST } = await import('@/app/api/sessions/route');

    const res = await POST(submitResultRequest({ 'x-player-token': 'token' }));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Session invalidated; please rejoin',
    });
  });

  it('records completion results for a current player session', async () => {
    verifyPlayerSessionTokenMock.mockReturnValue(validClaims());
    const insertTx = resultInsertTx([{ id: 'result-1', completed: true }]);
    withProgramContextMock
      .mockImplementationOnce(async (_programId: string, fn: (tx: unknown) => unknown) =>
        fn(
          playerSelectTx([
            {
              id: playerId,
              status: 'available',
              updatedAt: new Date('2026-01-01T00:00:00.000Z'),
              joinCodeExpiresAt: new Date('2026-02-01T00:00:00.000Z'),
            },
          ]),
        ),
      )
      .mockImplementationOnce(async (_programId: string, fn: (tx: unknown) => unknown) =>
        fn(insertTx),
      );
    const { POST } = await import('@/app/api/sessions/route');

    const res = await POST(submitResultRequest({ 'x-player-token': 'token' }));

    expect(res.status).toBe(201);
    expect(insertTx.values).toHaveBeenCalledWith(
      expect.objectContaining({
        programId,
        sessionId,
        playerId,
        completed: true,
        completedAt: expect.any(Date),
        totalQuestions: 4,
        correctAnswers: 3,
        accuracy: 0.75,
        averageDecisionTimeMs: 1200,
      }),
    );
    await expect(res.json()).resolves.toMatchObject({
      result: { id: 'result-1', completed: true },
      accuracy: 0.75,
    });
  });
});
