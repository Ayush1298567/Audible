import { createHmac, timingSafeEqual } from 'node:crypto';

const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days

type PlayerTokenPayload = {
  playerId: string;
  programId: string;
  iat: number;
  exp: number;
  // Session invalidates if player row is mutated after issuance.
  playerUpdatedAt: string;
  // Session invalidates if join code expiry changed.
  joinCodeExpiresAt: string | null;
};

function getSigningSecret(): string {
  return (
    process.env.PLAYER_SESSION_SECRET_CURRENT ??
    process.env.PLAYER_SESSION_SECRET ??
    'dev-player-session-secret-change-me'
  );
}

function getVerificationSecrets(): string[] {
  const fromList = process.env.PLAYER_SESSION_PREVIOUS_SECRETS
    ?.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  return [
    process.env.PLAYER_SESSION_SECRET_CURRENT,
    process.env.PLAYER_SESSION_SECRET,
    process.env.PLAYER_SESSION_PREVIOUS_SECRET,
    ...(fromList ?? []),
    'dev-player-session-secret-change-me',
  ].filter((secret): secret is string => Boolean(secret));
}

function toBase64Url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function fromBase64Url(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export function createPlayerSessionToken(args: {
  playerId: string;
  programId: string;
  playerUpdatedAt: Date;
  joinCodeExpiresAt: Date | null;
  ttlSeconds?: number;
}): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload: PlayerTokenPayload = {
    playerId: args.playerId,
    programId: args.programId,
    iat: issuedAt,
    exp: issuedAt + (args.ttlSeconds ?? DEFAULT_TTL_SECONDS),
    playerUpdatedAt: args.playerUpdatedAt.toISOString(),
    joinCodeExpiresAt: args.joinCodeExpiresAt ? args.joinCodeExpiresAt.toISOString() : null,
  };
  const payloadRaw = JSON.stringify(payload);
  const payloadB64 = toBase64Url(payloadRaw);
  const signature = sign(payloadB64, getSigningSecret());
  return `${payloadB64}.${signature}`;
}

export function verifyPlayerSessionToken(token: string): PlayerTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  if (!payloadB64 || !sig) return null;

  const sigBuf = Buffer.from(sig, 'utf8');
  const signatureMatches = getVerificationSecrets().some((secret) => {
    const expected = sign(payloadB64, secret);
    const expBuf = Buffer.from(expected, 'utf8');
    return sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf);
  });
  if (!signatureMatches) {
    return null;
  }

  let payload: PlayerTokenPayload;
  try {
    payload = JSON.parse(fromBase64Url(payloadB64)) as PlayerTokenPayload;
  } catch {
    return null;
  }

  if (
    !payload?.playerId ||
    !payload?.programId ||
    !payload?.iat ||
    !payload?.exp ||
    !payload?.playerUpdatedAt
  ) {
    return null;
  }
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}
