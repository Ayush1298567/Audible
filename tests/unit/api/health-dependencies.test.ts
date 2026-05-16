import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

describe('GET /api/health/dependencies', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    process.env = { ...originalEnv };
  });

  it('reports missing required configuration without exposing values', async () => {
    delete process.env.DATABASE_URL;
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.CLERK_SECRET_KEY;
    vi.stubEnv('NODE_ENV', 'production');

    const { GET } = await import('@/app/api/health/dependencies/route');
    const res = await GET(new Request('http://localhost/api/health/dependencies'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe('degraded');
    expect(json.missingRequired).toEqual(
      expect.arrayContaining([
        'DATABASE_URL',
        'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
        'CLERK_SECRET_KEY',
        'PLAYER_SESSION_SECRET_CURRENT',
      ]),
    );
    expect(JSON.stringify(json)).not.toContain('secret-value');
  });

  it('reports ok when production required dependencies are configured', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DATABASE_URL', 'secret-value-db');
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'secret-value-clerk-public');
    vi.stubEnv('CLERK_SECRET_KEY', 'secret-value-clerk');
    vi.stubEnv('PLAYER_SESSION_SECRET_CURRENT', 'secret-value-player-session');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'secret-value-redis-url');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'secret-value-redis-token');

    const { GET } = await import('@/app/api/health/dependencies/route');
    const res = await GET(new Request('http://localhost/api/health/dependencies'));
    const json = await res.json();

    expect(json.status).toBe('ok');
    expect(json.missingRequired).toEqual([]);
    expect(JSON.stringify(json)).not.toContain('secret-value');
  });
});
