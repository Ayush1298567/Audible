import { afterEach, describe, expect, it } from 'vitest';
import { createPlayerSessionToken, verifyPlayerSessionToken } from '@/lib/auth/player-token';

const originalEnv = { ...process.env };

describe('player session token', () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('creates and verifies a valid token', () => {
    process.env.PLAYER_SESSION_SECRET_CURRENT = 'test-current-secret';
    const token = createPlayerSessionToken({
      playerId: 'player-1',
      programId: 'program-1',
      playerUpdatedAt: new Date('2026-01-01T00:00:00.000Z'),
      joinCodeExpiresAt: new Date('2026-02-01T00:00:00.000Z'),
    });

    const claims = verifyPlayerSessionToken(token);
    expect(claims).not.toBeNull();
    expect(claims?.playerId).toBe('player-1');
    expect(claims?.programId).toBe('program-1');
  });

  it('rejects an expired token', () => {
    process.env.PLAYER_SESSION_SECRET_CURRENT = 'test-current-secret';
    const token = createPlayerSessionToken({
      playerId: 'player-1',
      programId: 'program-1',
      playerUpdatedAt: new Date('2026-01-01T00:00:00.000Z'),
      joinCodeExpiresAt: null,
      ttlSeconds: -1,
    });

    const claims = verifyPlayerSessionToken(token);
    expect(claims).toBeNull();
  });

  it('rejects tampered signatures', () => {
    process.env.PLAYER_SESSION_SECRET_CURRENT = 'test-current-secret';
    const token = createPlayerSessionToken({
      playerId: 'player-1',
      programId: 'program-1',
      playerUpdatedAt: new Date('2026-01-01T00:00:00.000Z'),
      joinCodeExpiresAt: null,
    });
    const tampered = `${token}tampered`;

    const claims = verifyPlayerSessionToken(tampered);
    expect(claims).toBeNull();
  });

  it('accepts tokens signed by previous secret during rotation', () => {
    process.env.PLAYER_SESSION_SECRET_CURRENT = 'new-secret';
    process.env.PLAYER_SESSION_PREVIOUS_SECRET = 'old-secret';

    process.env.PLAYER_SESSION_SECRET_CURRENT = 'old-secret';
    const oldToken = createPlayerSessionToken({
      playerId: 'player-1',
      programId: 'program-1',
      playerUpdatedAt: new Date('2026-01-01T00:00:00.000Z'),
      joinCodeExpiresAt: null,
    });

    process.env.PLAYER_SESSION_SECRET_CURRENT = 'new-secret';
    const claims = verifyPlayerSessionToken(oldToken);
    expect(claims).not.toBeNull();
    expect(claims?.playerId).toBe('player-1');
  });
});
