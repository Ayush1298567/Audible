/**
 * Direct schema push via Neon HTTP driver.
 *
 * Legacy/emergency fallback only. The supported migration path is:
 *   bun run db:migrate
 *
 * Usage: bun run scripts/push-schema.ts
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL ?? process.env.DATABASE_URL_UNPOOLED;
if (!url) {
  console.error('DATABASE_URL or DATABASE_URL_UNPOOLED required');
  process.exit(1);
}

const sql = neon(url);

function isIdempotentMigrationError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('already exists') || normalized.includes('duplicate');
}

function stripLeadingSqlComments(statement: string): string {
  const lines = statement.trim().split('\n');
  while (lines[0]?.trim() === '' || lines[0]?.trim().startsWith('--')) {
    lines.shift();
  }
  return lines.join('\n').trim();
}

function splitSqlStatements(content: string): string[] {
  const chunks = content.includes('--> statement-breakpoint')
    ? content.split('--> statement-breakpoint')
    : splitOnSemicolons(content);

  return chunks
    .map(stripLeadingSqlComments)
    .filter((statement) => statement.length > 0);
}

function splitOnSemicolons(content: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarQuote: string | null = null;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i] ?? '';
    const next = content[i + 1] ?? '';
    current += char;

    if (inLineComment) {
      if (char === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (char === '*' && next === '/') {
        current += next;
        i += 1;
        inBlockComment = false;
      }
      continue;
    }
    if (dollarQuote) {
      if (content.startsWith(dollarQuote, i)) {
        current += content.slice(i + 1, i + dollarQuote.length);
        i += dollarQuote.length - 1;
        dollarQuote = null;
      }
      continue;
    }
    if (inSingleQuote) {
      if (char === "'" && next === "'") {
        current += next;
        i += 1;
      } else if (char === "'") {
        inSingleQuote = false;
      }
      continue;
    }
    if (inDoubleQuote) {
      if (char === '"' && next === '"') {
        current += next;
        i += 1;
      } else if (char === '"') {
        inDoubleQuote = false;
      }
      continue;
    }

    if (char === '-' && next === '-') {
      current += next;
      i += 1;
      inLineComment = true;
      continue;
    }
    if (char === '/' && next === '*') {
      current += next;
      i += 1;
      inBlockComment = true;
      continue;
    }
    if (char === "'") {
      inSingleQuote = true;
      continue;
    }
    if (char === '"') {
      inDoubleQuote = true;
      continue;
    }
    if (char === '$') {
      const match = content.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match?.[0]) {
        current += match[0].slice(1);
        i += match[0].length - 1;
        dollarQuote = match[0];
      }
      continue;
    }
    if (char === ';') {
      statements.push(current.trim());
      current = '';
    }
  }

  if (current.trim()) {
    statements.push(current.trim());
  }

  return statements;
}

async function run() {
  const result = await sql`SELECT now() as now`;
  console.log(`Connected to DB at ${result[0]?.now}`);

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const drizzleDir = join(__dirname, '..', 'drizzle');
  const files = readdirSync(drizzleDir)
    .filter((f) => f.endsWith('.sql') && /^\d{4}/.test(f))
    .sort();

  console.log(`Found ${files.length} migration files\n`);

  for (const file of files) {
    const path = join(drizzleDir, file);
    const content = readFileSync(path, 'utf-8');
    const statements = splitSqlStatements(content);

    console.log(`--- ${file} (${statements.length} statements) ---`);

    for (const stmt of statements) {
      try {
        await sql.query(stmt);
        console.log(`  OK: ${stmt.slice(0, 70).replace(/\n/g, ' ')}...`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (isIdempotentMigrationError(msg)) {
          console.log(`  SKIP (exists): ${stmt.slice(0, 50).replace(/\n/g, ' ')}...`);
        } else {
          console.error(`  FAIL: ${stmt.slice(0, 80).replace(/\n/g, ' ')}...`);
          console.error(`        ${msg}`);
          process.exit(1);
        }
      }
    }
  }

  console.log('\nDone.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
