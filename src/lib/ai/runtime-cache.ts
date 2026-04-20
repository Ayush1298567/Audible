/**
 * Lightweight in-memory TTL cache for expensive AI calls.
 *
 * This is intentionally process-local. In Fluid Compute, warm instances can
 * reuse cached answers for repeated identical calls while staying stateless
 * enough for horizontal scaling.
 */

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry<unknown>>();

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }

  return entry.value as T;
}

export function setCached<T>(key: string, value: T, ttlMs: number): void {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

export function getOrSetCached<T>(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
  const existing = getCached<T>(key);
  if (existing !== null) {
    return Promise.resolve(existing);
  }

  return compute().then((value) => {
    setCached(key, value, ttlMs);
    return value;
  });
}
