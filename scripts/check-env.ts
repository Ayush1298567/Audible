type EnvGroup = {
  title: string;
  entries: EnvEntry[];
};

type EnvEntry = {
  names: string[];
  label?: string;
  required: boolean;
};

const productionMode =
  process.argv.includes('--production') ||
  process.env.NODE_ENV === 'production' ||
  process.env.VERCEL_ENV === 'production';

function hasEnv(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function statusFor(entry: EnvEntry): 'ok' | 'missing' {
  return entry.names.some(hasEnv) ? 'ok' : 'missing';
}

function displayName(entry: EnvEntry): string {
  return entry.label ?? entry.names.join(' or ');
}

function printGroup(group: EnvGroup): string[] {
  const missingRequired: string[] = [];
  console.log(`[env:check] ${group.title}`);

  for (const entry of group.entries) {
    const status = statusFor(entry);
    const requiredSuffix = entry.required ? 'required' : 'optional';
    console.log(`  [${status}] ${displayName(entry)} (${requiredSuffix})`);

    if (entry.required && status === 'missing') {
      missingRequired.push(displayName(entry));
    }
  }

  return missingRequired;
}

function main(): void {
  const requiredAlways: EnvGroup = {
    title: 'required for local app startup',
    entries: [
      { names: ['DATABASE_URL'], required: true },
      { names: ['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'], required: true },
      { names: ['CLERK_SECRET_KEY'], required: true },
    ],
  };

  const productionRequired: EnvGroup = {
    title: productionMode
      ? 'required for production readiness'
      : 'production-only requirements (skipped outside production)',
    entries: [
      { names: ['PLAYER_SESSION_SECRET_CURRENT'], required: productionMode },
      { names: ['UPSTASH_REDIS_REST_URL'], required: productionMode },
      { names: ['UPSTASH_REDIS_REST_TOKEN'], required: productionMode },
    ],
  };

  const optionalReadiness: EnvGroup = {
    title: 'optional integration readiness',
    entries: [
      { names: ['BLOB_READ_WRITE_TOKEN'], required: false },
      { names: ['AI_GATEWAY_API_KEY', 'ANTHROPIC_API_KEY'], required: false },
      { names: ['GOOGLE_API_KEY', 'GEMINI_API_KEY'], required: false },
      { names: ['OPENAI_API_KEY'], required: false },
      { names: ['ROBOFLOW_API_KEY'], required: false },
      { names: ['RESEND_API_KEY'], required: false },
      { names: ['RESEND_FROM_EMAIL'], required: false },
    ],
  };

  console.log(`[env:check] mode=${productionMode ? 'production' : 'development'}`);
  const missing = [
    ...printGroup(requiredAlways),
    ...printGroup(productionRequired),
    ...printGroup(optionalReadiness),
  ];

  if (missing.length > 0) {
    console.error(`[env:check] missing required env vars: ${missing.join(', ')}`);
    process.exit(1);
  }

  console.log('[env:check] ok');
}

main();
