import { Redis } from '@upstash/redis';

type RateWindow = {
  count: number;
  resetAt: number;
};

const windows = new Map<string, RateWindow>();
let redisClient: Redis | null = null;

function getRedisClient(): Redis | null {
  if (redisClient) return redisClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redisClient = new Redis({ url, token });
  return redisClient;
}

export async function checkRateLimit(args: {
  key: string;
  maxAttempts: number;
  windowMs: number;
}): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds: number }> {
  const redis = getRedisClient();
  if (redis) {
    return checkRateLimitWithRedis(redis, args);
  }
  return checkRateLimitInMemory(args);
}

function checkRateLimitInMemory(args: {
  key: string;
  maxAttempts: number;
  windowMs: number;
}): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
  const now = Date.now();
  const existing = windows.get(args.key);

  if (!existing || existing.resetAt <= now) {
    windows.set(args.key, { count: 1, resetAt: now + args.windowMs });
    return {
      allowed: true,
      remaining: args.maxAttempts - 1,
      retryAfterSeconds: Math.ceil(args.windowMs / 1000),
    };
  }

  if (existing.count >= args.maxAttempts) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000),
    };
  }

  existing.count += 1;
  windows.set(args.key, existing);
  return {
    allowed: true,
    remaining: Math.max(0, args.maxAttempts - existing.count),
    retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000),
  };
}

async function checkRateLimitWithRedis(
  redis: Redis,
  args: { key: string; maxAttempts: number; windowMs: number },
): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds: number }> {
  const key = `rate-limit:${args.key}`;
  const now = Date.now();
  const windowStart = now - args.windowMs;
  const member = `${now}-${Math.random()}`;

  await redis.zremrangebyscore(key, 0, windowStart);
  await redis.zadd(key, { score: now, member });
  const rawCount = await redis.zcard(key);
  await redis.expire(key, Math.ceil(args.windowMs / 1000));
  const oldest = await redis.zrange(key, 0, 0, { withScores: true });

  const count = Number(rawCount ?? 0);
  const oldestEntry = Array.isArray(oldest) && oldest.length > 0 ? oldest[0] : null;
  const oldestScore = Array.isArray(oldestEntry) ? Number(oldestEntry[1]) : now;
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((oldestScore + args.windowMs - now) / 1000),
  );

  if (count > args.maxAttempts) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds,
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, args.maxAttempts - count),
    retryAfterSeconds,
  };
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip') ?? 'unknown-ip';
}
