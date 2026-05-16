import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPlayerSessionToken, verifyPlayerSessionToken } from '@/lib/auth/player-token';

const originalEnv = { ...process.env };

describe('player session token', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
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

  it('accepts comma-separated previous secrets during rotation', () => {
    process.env.PLAYER_SESSION_SECRET_CURRENT = 'older-secret';
    const oldToken = createPlayerSessionToken({
      playerId: 'player-1',
      programId: 'program-1',
      playerUpdatedAt: new Date('2026-01-01T00:00:00.000Z'),
      joinCodeExpiresAt: null,
    });

    process.env.PLAYER_SESSION_SECRET_CURRENT = 'new-secret';
    process.env.PLAYER_SESSION_PREVIOUS_SECRETS = 'old-secret, older-secret';

    const claims = verifyPlayerSessionToken(oldToken);
    expect(claims).not.toBeNull();
    expect(claims?.playerId).toBe('player-1');
  });

  it('throws in production when no signing secret is configured', () => {
    delete process.env.PLAYER_SESSION_SECRET_CURRENT;
    delete process.env.PLAYER_SESSION_SECRET;
    vi.stubEnv('NODE_ENV', 'production');

    expect(() =>
      createPlayerSessionToken({
        playerId: 'player-1',
        programId: 'program-1',
        playerUpdatedAt: new Date('2026-01-01T00:00:00.000Z'),
        joinCodeExpiresAt: null,
      }),
    ).toThrow('PLAYER_SESSION_SECRET_CURRENT is required in production');
  });

  it('throws in production when only the deprecated legacy signing secret is configured', () => {
    delete process.env.PLAYER_SESSION_SECRET_CURRENT;
    process.env.PLAYER_SESSION_SECRET = 'legacy-secret';
    vi.stubEnv('NODE_ENV', 'production');

    expect(() =>
      createPlayerSessionToken({
        playerId: 'player-1',
        programId: 'program-1',
        playerUpdatedAt: new Date('2026-01-01T00:00:00.000Z'),
        joinCodeExpiresAt: null,
      }),
    ).toThrow('PLAYER_SESSION_SECRET_CURRENT is required in production');
  });

  it('does not verify dev-secret tokens in production', () => {
    delete process.env.PLAYER_SESSION_SECRET_CURRENT;
    delete process.env.PLAYER_SESSION_SECRET;
    vi.stubEnv('NODE_ENV', 'development');
    const devToken = createPlayerSessionToken({
      playerId: 'player-1',
      programId: 'program-1',
      playerUpdatedAt: new Date('2026-01-01T00:00:00.000Z'),
      joinCodeExpiresAt: null,
    });

    vi.stubEnv('NODE_ENV', 'production');
    process.env.PLAYER_SESSION_SECRET_CURRENT = 'prod-secret';

    expect(verifyPlayerSessionToken(devToken)).toBeNull();
  });
});
