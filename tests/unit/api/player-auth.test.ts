import { beforeEach, describe, expect, it, vi } from 'vitest';

const withPlayerJoinCodeContextMock = vi.fn();
const createPlayerSessionTokenMock = vi.fn();
const checkRateLimitMock = vi.fn();
const getClientIpMock = vi.fn();

vi.mock('@/lib/db/client', () => ({
  withPlayerJoinCodeContext: withPlayerJoinCodeContextMock,
}));

vi.mock('@/lib/auth/player-token', () => ({
  createPlayerSessionToken: createPlayerSessionTokenMock,
}));

vi.mock('@/lib/security/rate-limit', () => ({
  checkRateLimit: checkRateLimitMock,
  getClientIp: getClientIpMock,
}));

const playerRow = {
  id: 'player-1',
  programId: 'program-1',
  firstName: 'Avery',
  lastName: 'Jones',
  jerseyNumber: 12,
  positions: ['QB'],
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  joinCodeExpiresAt: new Date('2026-02-01T00:00:00.000Z'),
};

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/player-auth', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/player-auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createPlayerSessionTokenMock.mockReturnValue('signed-player-token');
    getClientIpMock.mockReturnValue('203.0.113.9');
    checkRateLimitMock.mockResolvedValue({
      allowed: true,
      remaining: 9,
      retryAfterSeconds: 60,
    });
    withPlayerJoinCodeContextMock.mockResolvedValue([playerRow]);
  });

  it('trims and uppercases join codes before lookup and rate limiting', async () => {
    const { POST } = await import('@/app/api/player-auth/route');

    const res = await POST(makeRequest({ joinCode: ' ab12 ' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(withPlayerJoinCodeContextMock).toHaveBeenCalledWith('AB12', expect.any(Function));
    expect(checkRateLimitMock).toHaveBeenNthCalledWith(2, {
      key: 'player-auth:code:AB12',
      maxAttempts: 10,
      windowMs: 60_000,
    });
    expect(createPlayerSessionTokenMock).toHaveBeenCalledWith({
      playerId: playerRow.id,
      programId: playerRow.programId,
      playerUpdatedAt: playerRow.updatedAt,
      joinCodeExpiresAt: playerRow.joinCodeExpiresAt,
    });
    expect(json).toMatchObject({
      token: 'signed-player-token',
      player: {
        id: 'player-1',
        programId: 'program-1',
        firstName: 'Avery',
        lastName: 'Jones',
        jerseyNumber: 12,
        positions: ['QB'],
      },
    });
  });

  it.each([
    { name: 'too short after trim', body: { joinCode: ' abc ' } },
    { name: 'too long after trim', body: { joinCode: ' abcdefghi ' } },
    { name: 'missing joinCode', body: {} },
    { name: 'non-string joinCode', body: { joinCode: 1234 } },
  ])('returns 400 for invalid body: $name', async ({ body }) => {
    const { POST } = await import('@/app/api/player-auth/route');

    const res = await POST(makeRequest(body));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Invalid join code format',
    });
    expect(checkRateLimitMock).not.toHaveBeenCalled();
    expect(withPlayerJoinCodeContextMock).not.toHaveBeenCalled();
  });

  it('returns 429 with Retry-After when the IP limiter blocks the request', async () => {
    checkRateLimitMock.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 42,
    });
    const { POST } = await import('@/app/api/player-auth/route');

    const res = await POST(makeRequest({ joinCode: 'AB12' }));

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('42');
    await expect(res.json()).resolves.toMatchObject({
      error: 'Too many attempts. Try again shortly.',
    });
    expect(withPlayerJoinCodeContextMock).not.toHaveBeenCalled();
  });

  it('returns 429 with Retry-After when the join-code limiter blocks the request', async () => {
    checkRateLimitMock
      .mockResolvedValueOnce({
        allowed: true,
        remaining: 19,
        retryAfterSeconds: 60,
      })
      .mockResolvedValueOnce({
        allowed: false,
        remaining: 0,
        retryAfterSeconds: 17,
      });
    const { POST } = await import('@/app/api/player-auth/route');

    const res = await POST(makeRequest({ joinCode: 'AB12' }));

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('17');
    await expect(res.json()).resolves.toMatchObject({
      error: 'Too many attempts. Try again shortly.',
    });
    expect(withPlayerJoinCodeContextMock).not.toHaveBeenCalled();
  });

  it('returns 401 for an unknown or expired join code', async () => {
    withPlayerJoinCodeContextMock.mockResolvedValueOnce([]);
    const { POST } = await import('@/app/api/player-auth/route');

    const res = await POST(makeRequest({ joinCode: 'AB12' }));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Invalid or expired join code',
    });
    expect(createPlayerSessionTokenMock).not.toHaveBeenCalled();
  });
});
