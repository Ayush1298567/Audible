import { beforeEach, describe, expect, it, vi } from 'vitest';

const withProgramContextMock = vi.fn();
const verifyPlayerSessionTokenMock = vi.fn();

vi.mock('@/lib/db/client', () => ({
  withProgramContext: withProgramContextMock,
}));

vi.mock('@/lib/auth/player-token', () => ({
  verifyPlayerSessionToken: verifyPlayerSessionTokenMock,
}));

describe('GET /api/player-data auth guardrails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when token is missing', async () => {
    const { GET } = await import('@/app/api/player-data/route');
    const req = new Request(
      'http://localhost/api/player-data?programId=11111111-1111-1111-1111-111111111111&playerId=22222222-2222-2222-2222-222222222222&type=film',
    );

    const res = await GET(req);
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Missing player session token',
    });
  });

  it('returns 403 when token scope does not match query', async () => {
    verifyPlayerSessionTokenMock.mockReturnValue({
      playerId: 'other-player',
      programId: 'other-program',
      iat: 1,
      exp: 9999999999,
      playerUpdatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      joinCodeExpiresAt: null,
    });
    const { GET } = await import('@/app/api/player-data/route');
    const req = new Request(
      'http://localhost/api/player-data?programId=11111111-1111-1111-1111-111111111111&playerId=22222222-2222-2222-2222-222222222222&type=film',
      {
        headers: { 'x-player-token': 'token' },
      },
    );

    const res = await GET(req);
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Forbidden: token scope mismatch',
    });
  });

  it('returns 403 when player status is revoked', async () => {
    verifyPlayerSessionTokenMock.mockReturnValue({
      playerId: '22222222-2222-2222-2222-222222222222',
      programId: '11111111-1111-1111-1111-111111111111',
      iat: 1,
      exp: 9999999999,
      playerUpdatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      joinCodeExpiresAt: null,
    });
    withProgramContextMock.mockResolvedValueOnce([
      {
        id: '22222222-2222-2222-2222-222222222222',
        positions: ['QB'],
        status: 'inactive',
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        joinCodeExpiresAt: null,
      },
    ]);

    const { GET } = await import('@/app/api/player-data/route');
    const req = new Request(
      'http://localhost/api/player-data?programId=11111111-1111-1111-1111-111111111111&playerId=22222222-2222-2222-2222-222222222222&type=progress',
      {
        headers: { 'x-player-token': 'token' },
      },
    );

    const res = await GET(req);
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Player access revoked',
    });
  });

  it('returns 401 when player row was changed after token issue', async () => {
    verifyPlayerSessionTokenMock.mockReturnValue({
      playerId: '22222222-2222-2222-2222-222222222222',
      programId: '11111111-1111-1111-1111-111111111111',
      iat: 1,
      exp: 9999999999,
      playerUpdatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      joinCodeExpiresAt: null,
    });
    withProgramContextMock.mockResolvedValueOnce([
      {
        id: '22222222-2222-2222-2222-222222222222',
        positions: ['QB'],
        status: 'available',
        updatedAt: new Date('2026-01-01T00:00:01.000Z'),
        joinCodeExpiresAt: null,
      },
    ]);

    const { GET } = await import('@/app/api/player-data/route');
    const req = new Request(
      'http://localhost/api/player-data?programId=11111111-1111-1111-1111-111111111111&playerId=22222222-2222-2222-2222-222222222222&type=progress',
      {
        headers: { 'x-player-token': 'token' },
      },
    );

    const res = await GET(req);
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Session invalidated; please rejoin',
    });
  });
});
