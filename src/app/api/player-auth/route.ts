import { db } from '@/lib/db/client';
import { players } from '@/lib/db/schema';
import { beginSpan } from '@/lib/observability/log';
import { eq, and, gt } from 'drizzle-orm';
import { z } from 'zod';
import { createPlayerSessionToken } from '@/lib/auth/player-token';
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit';

const joinCodeSchema = z.object({
  joinCode: z.string().min(4).max(8).transform((s) => s.toUpperCase().trim()),
});

export async function POST(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/player-auth' }, req);

  try {
    const body = await req.json();
    const { joinCode } = joinCodeSchema.parse(body);
    const ip = getClientIp(req);
    const ipLimiter = await checkRateLimit({
      key: `player-auth:ip:${ip}`,
      maxAttempts: 20,
      windowMs: 60 * 1000,
    });
    if (!ipLimiter.allowed) {
      span.done({ result: 'rate_limited_ip', ip });
      return Response.json(
        { error: 'Too many attempts. Try again shortly.' },
        {
          status: 429,
          headers: { 'Retry-After': String(ipLimiter.retryAfterSeconds) },
        },
      );
    }
    const codeLimiter = await checkRateLimit({
      key: `player-auth:code:${joinCode}`,
      maxAttempts: 10,
      windowMs: 60 * 1000,
    });
    if (!codeLimiter.allowed) {
      span.done({ result: 'rate_limited_code' });
      return Response.json(
        { error: 'Too many attempts. Try again shortly.' },
        {
          status: 429,
          headers: { 'Retry-After': String(codeLimiter.retryAfterSeconds) },
        },
      );
    }

    // Join codes bypass RLS — we need to find the player across all programs.
    // The players table IS RLS-enforced, so we query without program context
    // using a direct DB query. This is the ONE place we bypass the
    // withProgramContext pattern, and it's intentional: the join code itself
    // is the auth credential that grants access to a specific program.
    const result = await db
      .select()
      .from(players)
      .where(
        and(
          eq(players.joinCode, joinCode),
          gt(players.joinCodeExpiresAt, new Date()),
        ),
      )
      .limit(1);

    const player = result[0];

    if (!player) {
      span.done({ result: 'invalid_code', ip });
      return Response.json(
        { error: 'Invalid or expired join code' },
        { status: 401 },
      );
    }

    span.done({ playerId: player.id, programId: player.programId });
    const token = createPlayerSessionToken({
      playerId: player.id,
      programId: player.programId,
      playerUpdatedAt: player.updatedAt,
      joinCodeExpiresAt: player.joinCodeExpiresAt,
    });

    return Response.json({
      player: {
        id: player.id,
        programId: player.programId,
        firstName: player.firstName,
        lastName: player.lastName,
        jerseyNumber: player.jerseyNumber,
        positions: player.positions,
      },
      token,
    });
  } catch (error) {
    span.fail(error);
    if (error instanceof z.ZodError) {
      return Response.json({ error: 'Invalid join code format' }, { status: 400 });
    }
    return Response.json({ error: 'Authentication failed' }, { status: 500 });
  }
}
