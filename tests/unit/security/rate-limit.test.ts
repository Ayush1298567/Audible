import { describe, expect, it } from 'vitest';
import { checkRateLimit } from '@/lib/security/rate-limit';

describe('rate-limit in-memory fallback', () => {
  it('allows requests under the threshold and blocks over threshold', async () => {
    const key = `test-key-${Math.random()}`;
    const first = await checkRateLimit({
      key,
      maxAttempts: 2,
      windowMs: 10_000,
    });
    const second = await checkRateLimit({
      key,
      maxAttempts: 2,
      windowMs: 10_000,
    });
    const third = await checkRateLimit({
      key,
      maxAttempts: 2,
      windowMs: 10_000,
    });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSeconds).toBeGreaterThan(0);
  });
});
