import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../../..');
const appDir = path.join(root, 'src/app');

function listRouteHandlers(dir: string): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === '.well-known') continue;
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

describe('route observability', () => {
  it('keeps route handlers instrumented with beginSpan', () => {
    const missing = listRouteHandlers(appDir)
      .filter((file) => {
        const source = readFileSync(file, 'utf8');
        return !source.includes('beginSpan(');
      })
      .map((file) => path.relative(root, file));

    expect(missing).toEqual([]);
  });
});
