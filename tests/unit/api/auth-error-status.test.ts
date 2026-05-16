import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../../..');
const apiDir = path.join(root, 'src/app/api');

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

describe('API auth error handling', () => {
  it('preserves AuthError statuses in write route handlers', () => {
    const writeRoutePattern = /export\s+async\s+function\s+(POST|PATCH|PUT|DELETE)\b/;
    const violations = listRouteHandlers(apiDir)
      .filter((file) => {
        const source = readFileSync(file, 'utf8');
        if (!writeRoutePattern.test(source)) return false;
        if (!source.includes('AuthError')) return false;
        return !/error\s+instanceof\s+AuthError[\s\S]*status:\s*error\.status/.test(source);
      })
      .map((file) => path.relative(root, file));

    expect(violations).toEqual([]);
  });
});
