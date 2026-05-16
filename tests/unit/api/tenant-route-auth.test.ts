import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../../..');
const apiDir = path.join(root, 'src/app/api');

const publicRoutes = new Set([
  'src/app/api/health/route.ts',
  'src/app/api/health/dependencies/route.ts',
  'src/app/api/player-auth/route.ts',
]);

const bootstrapRoutes = new Set(['src/app/api/programs/route.ts']);
const playerTokenRoutes = new Set(['src/app/api/player-data/route.ts']);

const coachGuardCallPattern =
  /\b(?:requireCoach|requireCoachForProgram|requireCoachRole|requireCoachRoleForProgram|requireHeadCoach)\s*\(/g;
const tenantDbCallPattern = /\bwithProgramContext\s*\(/g;
const directClerkRouteAuthPattern = /from\s+['"]@clerk\/nextjs\/server['"]/;

function listRouteHandlers(dir: string): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      routes.push(...listRouteHandlers(fullPath));
    } else if (entry === 'route.ts') {
      routes.push(fullPath);
    }
  }
  return routes;
}

function relativeRoute(file: string): string {
  return path.relative(root, file);
}

function firstCallIndex(source: string, pattern: RegExp): number | null {
  pattern.lastIndex = 0;
  const match = pattern.exec(source);
  return match?.index ?? null;
}

function hasCall(source: string, pattern: RegExp): boolean {
  pattern.lastIndex = 0;
  return pattern.test(source);
}

describe('tenant route auth', () => {
  it('does not use Clerk auth directly outside the program bootstrap route', () => {
    const violations = listRouteHandlers(apiDir)
      .map((file) => ({ file: relativeRoute(file), source: readFileSync(file, 'utf8') }))
      .filter(({ file }) => !bootstrapRoutes.has(file))
      .filter(({ source }) => directClerkRouteAuthPattern.test(source))
      .map(({ file }) => file);

    expect(violations).toEqual([]);
  });

  it('guards tenant-scoped route handlers before opening a program DB context', () => {
    const violations = listRouteHandlers(apiDir)
      .map((file) => ({ file: relativeRoute(file), source: readFileSync(file, 'utf8') }))
      .filter(({ file }) => !publicRoutes.has(file))
      .filter(({ file }) => !bootstrapRoutes.has(file))
      .filter(({ file }) => !playerTokenRoutes.has(file))
      .flatMap(({ file, source }) => {
        const firstTenantDb = firstCallIndex(source, tenantDbCallPattern);
        if (firstTenantDb === null) return [];

        const firstGuard = firstCallIndex(source, coachGuardCallPattern);
        if (firstGuard !== null && firstGuard < firstTenantDb) return [];

        return [{ file, reason: 'withProgramContext before centralized coach guard' }];
      });

    expect(violations).toEqual([]);
  });

  it('requires every client-program route to use a coach guard or player token', () => {
    const violations = listRouteHandlers(apiDir)
      .map((file) => ({ file: relativeRoute(file), source: readFileSync(file, 'utf8') }))
      .filter(({ file }) => !publicRoutes.has(file))
      .filter(({ file }) => !bootstrapRoutes.has(file))
      .filter(({ file }) => !playerTokenRoutes.has(file))
      .filter(({ source }) => /\bprogramId\b/.test(source))
      .filter(({ source }) => !hasCall(source, coachGuardCallPattern))
      .map(({ file }) => file);

    expect(violations).toEqual([]);
  });

  it('keeps the player-data route scoped by the signed player token before tenant reads', () => {
    const file = path.join(root, 'src/app/api/player-data/route.ts');
    const source = readFileSync(file, 'utf8');
    const verifyIndex = firstCallIndex(source, /\bverifyPlayerSessionToken\s*\(/g);
    const tenantReadIndex = firstCallIndex(source, tenantDbCallPattern);

    expect(verifyIndex).not.toBeNull();
    expect(tenantReadIndex).not.toBeNull();
    expect(verifyIndex).toBeLessThan(tenantReadIndex ?? 0);
  });

  it('keeps player session result submission scoped by the signed player token', () => {
    const file = path.join(root, 'src/app/api/sessions/route.ts');
    const source = readFileSync(file, 'utf8');
    const submitResultStart = source.indexOf("case 'submitResult'");
    const submitResultEnd = source.indexOf('default:', submitResultStart);
    const submitResultBlock = source.slice(submitResultStart, submitResultEnd);

    const verifyIndex = firstCallIndex(submitResultBlock, /\bverifyPlayerSessionToken\s*\(/g);
    const tenantReadIndex = firstCallIndex(submitResultBlock, tenantDbCallPattern);

    expect(submitResultStart).toBeGreaterThanOrEqual(0);
    expect(verifyIndex).not.toBeNull();
    expect(tenantReadIndex).not.toBeNull();
    expect(verifyIndex).toBeLessThan(tenantReadIndex ?? 0);
  });
});
