import { beforeEach, describe, expect, it, vi } from 'vitest';

const withProgramContextMock = vi.fn();
const requireCoachRoleForProgramMock = vi.fn();
const programId = '11111111-1111-4111-8111-111111111111';
const playerId = '22222222-2222-4222-8222-222222222222';

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

vi.mock('@/lib/auth/guards', () => ({
  AuthError: MockAuthError,
  requireCoachForProgram: vi.fn(),
  requireCoachRoleForProgram: requireCoachRoleForProgramMock,
}));

function patchRequest(body: unknown): Request {
  return new Request('http://localhost/api/players', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function mockPlayerUpdate(rows: unknown[]) {
  const returning = vi.fn(async () => rows);
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn((_patch: Record<string, unknown>) => ({ where }));
  const update = vi.fn(() => ({ set }));

  withProgramContextMock.mockImplementation(async (_programId: string, fn: (tx: unknown) => unknown) =>
    fn({ update }),
  );

  return { returning, where, set, update };
}

describe('PATCH /api/players', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCoachRoleForProgramMock.mockResolvedValue({
      programId,
      role: 'coordinator',
    });
  });

  it('revokes player access by marking the player inactive', async () => {
    const updatedPlayer = {
      id: playerId,
      programId,
      status: 'inactive',
    };
    const db = mockPlayerUpdate([updatedPlayer]);
    const { PATCH } = await import('@/app/api/players/route');

    const res = await PATCH(
      patchRequest({
        programId: updatedPlayer.programId,
        playerId: updatedPlayer.id,
        action: 'revokeAccess',
      }),
    );

    expect(res.status).toBe(200);
    expect(requireCoachRoleForProgramMock).toHaveBeenCalledWith('coordinator', updatedPlayer.programId);
    expect(withProgramContextMock).toHaveBeenCalledWith(updatedPlayer.programId, expect.any(Function));
    expect(db.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'inactive', updatedAt: expect.any(Date) }),
    );
    await expect(res.json()).resolves.toMatchObject({ player: updatedPlayer });
  });

  it('restores player access without changing the join code', async () => {
    const updatedPlayer = {
      id: playerId,
      programId,
      status: 'available',
      joinCode: 'AB12CD',
    };
    const db = mockPlayerUpdate([updatedPlayer]);
    const { PATCH } = await import('@/app/api/players/route');

    const res = await PATCH(
      patchRequest({
        programId: updatedPlayer.programId,
        playerId: updatedPlayer.id,
        action: 'restoreAccess',
      }),
    );

    expect(res.status).toBe(200);
    expect(db.set).toHaveBeenCalledWith(
      expect.not.objectContaining({ joinCode: expect.any(String) }),
    );
    expect(db.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'available', updatedAt: expect.any(Date) }),
    );
  });

  it('rotates the join code and refreshes access', async () => {
    const updatedPlayer = {
      id: playerId,
      programId,
      status: 'available',
      joinCode: 'ZZ99YY',
    };
    const db = mockPlayerUpdate([updatedPlayer]);
    const { PATCH } = await import('@/app/api/players/route');

    const res = await PATCH(
      patchRequest({
        programId: updatedPlayer.programId,
        playerId: updatedPlayer.id,
        action: 'rotateJoinCode',
      }),
    );

    expect(res.status).toBe(200);
    const patch = db.set.mock.calls.at(0)?.[0];
    expect(patch).toBeDefined();
    if (!patch) throw new Error('expected update patch');
    expect(patch.status).toBe('available');
    expect(patch.joinCode).toEqual(expect.stringMatching(/^[A-HJ-NP-Z2-9]{6}$/));
    expect(patch.joinCodeExpiresAt).toEqual(expect.any(Date));
    expect(patch.updatedAt).toEqual(expect.any(Date));
  });

  it('returns 404 when the player is not in the program', async () => {
    mockPlayerUpdate([]);
    const { PATCH } = await import('@/app/api/players/route');

    const res = await PATCH(
      patchRequest({
        programId,
        playerId,
        action: 'revokeAccess',
      }),
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: 'Player not found' });
  });

  it('preserves auth guard status codes', async () => {
    requireCoachRoleForProgramMock.mockRejectedValueOnce(new MockAuthError('Forbidden', 403));
    const { PATCH } = await import('@/app/api/players/route');

    const res = await PATCH(
      patchRequest({
        programId,
        playerId,
        action: 'revokeAccess',
      }),
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: 'Forbidden' });
  });
});
