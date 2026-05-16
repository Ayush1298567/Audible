import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../../..');

const tenantScopedTables = new Set([
  'coaches',
  'players',
  'opponents',
  'walkthroughs',
  'seasons',
  'games',
  'filmUploads',
  'plays',
  'cvTags',
  'evalBench',
  'playerDetections',
  'playbookPlays',
  'gamePlans',
  'collections',
  'collectionPlays',
  'scenarios',
  'sessions',
  'sessionPlays',
  'playerSessionResults',
  'filmGrades',
  'gamePlanPlays',
  'gamePlanAssignments',
  'suggestionDismissals',
]);

type DirectDbCall = {
  file: string;
  line: number;
  method: string;
  table: string;
  snippet: string;
};

function listTypeScriptFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...listTypeScriptFiles(fullPath));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(fullPath);
    }
  }
  return files;
}

function lineForIndex(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

function compactSnippet(source: string, index: number): string {
  return source
    .slice(index, index + 220)
    .replace(/\s+/g, ' ')
    .trim();
}

function findDirectDbCalls(file: string): DirectDbCall[] {
  const source = readFileSync(file, 'utf8');
  const calls: DirectDbCall[] = [];

  for (const match of source.matchAll(/\bdb\.(insert|update|delete)\s*\(\s*(\w+)/g)) {
    const [, method, table] = match;
    if (!method || !table) continue;
    calls.push({
      file,
      line: lineForIndex(source, match.index ?? 0),
      method,
      table,
      snippet: compactSnippet(source, match.index ?? 0),
    });
  }

  for (const match of source.matchAll(/\bdb\.select\s*\(/g)) {
    const index = match.index ?? 0;
    const window = source.slice(index, index + 1000);
    const fromMatch = window.match(/\.from\s*\(\s*(\w+)/);
    const table = fromMatch?.[1];
    if (!table) continue;
    calls.push({
      file,
      line: lineForIndex(source, index),
      method: 'select',
      table,
      snippet: compactSnippet(source, index),
    });
  }

  return calls;
}

describe('static tenant DB access guard', () => {
  it('does not query tenant-scoped tables through the raw db handle', () => {
    const scannedFiles = [
      ...listTypeScriptFiles(path.join(root, 'src')),
      ...listTypeScriptFiles(path.join(root, 'scripts')),
    ];

    const violations = scannedFiles
      .flatMap(findDirectDbCalls)
      .filter((call) => tenantScopedTables.has(call.table))
      .map((call) => ({
        file: path.relative(root, call.file),
        line: call.line,
        method: call.method,
        table: call.table,
        snippet: call.snippet,
      }));

    expect(violations).toEqual([]);
  });
});
