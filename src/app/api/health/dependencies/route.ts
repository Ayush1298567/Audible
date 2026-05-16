import { beginSpan } from '@/lib/observability/log';

type DependencyCheck = {
  name: string;
  required: boolean;
  configured: boolean;
  missing: string[];
};

function missingEnv(names: string[]): string[] {
  return names.filter((name) => !process.env[name]);
}

function hasAnyEnv(names: string[]): boolean {
  return names.some((name) => Boolean(process.env[name]));
}

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
}

function buildChecks(): DependencyCheck[] {
  const production = isProductionRuntime();
  const geminiConfigured = hasAnyEnv(['GOOGLE_API_KEY', 'GEMINI_API_KEY']);
  const llmConfigured = hasAnyEnv(['AI_GATEWAY_API_KEY', 'ANTHROPIC_API_KEY']);

  return [
    {
      name: 'database',
      required: true,
      configured: missingEnv(['DATABASE_URL']).length === 0,
      missing: missingEnv(['DATABASE_URL']),
    },
    {
      name: 'clerk',
      required: true,
      configured:
        missingEnv(['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'CLERK_SECRET_KEY']).length === 0,
      missing: missingEnv(['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'CLERK_SECRET_KEY']),
    },
    {
      name: 'player_sessions',
      required: production,
      configured: missingEnv(['PLAYER_SESSION_SECRET_CURRENT']).length === 0,
      missing: production ? missingEnv(['PLAYER_SESSION_SECRET_CURRENT']) : [],
    },
    {
      name: 'rate_limit',
      required: production,
      configured:
        missingEnv(['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']).length === 0,
      missing: production ? missingEnv(['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) : [],
    },
    {
      name: 'blob',
      required: false,
      configured: missingEnv(['BLOB_READ_WRITE_TOKEN']).length === 0,
      missing: missingEnv(['BLOB_READ_WRITE_TOKEN']),
    },
    {
      name: 'llm',
      required: false,
      configured: llmConfigured,
      missing: llmConfigured ? [] : ['AI_GATEWAY_API_KEY or ANTHROPIC_API_KEY'],
    },
    {
      name: 'video_boundary_ai',
      required: false,
      configured: geminiConfigured,
      missing: geminiConfigured ? [] : ['GOOGLE_API_KEY or GEMINI_API_KEY'],
    },
    {
      name: 'vision_secondary_model',
      required: false,
      configured: missingEnv(['OPENAI_API_KEY']).length === 0,
      missing: missingEnv(['OPENAI_API_KEY']),
    },
    {
      name: 'player_detection',
      required: false,
      configured: missingEnv(['ROBOFLOW_API_KEY']).length === 0,
      missing: missingEnv(['ROBOFLOW_API_KEY']),
    },
  ];
}

export async function GET(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/health/dependencies', method: 'GET' }, req);

  try {
    const checks = buildChecks();
    const missingRequired = checks
      .filter((check) => check.required && !check.configured)
      .flatMap((check) => check.missing);
    const status = missingRequired.length === 0 ? 'ok' : 'degraded';

    span.done({ status, missingRequiredCount: missingRequired.length });
    return Response.json({
      status,
      runtime: isProductionRuntime() ? 'production' : 'development',
      checks,
      missingRequired,
    });
  } catch (error) {
    span.fail(error);
    return Response.json({ status: 'error', error: 'Dependency check failed' }, { status: 500 });
  }
}
