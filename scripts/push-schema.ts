/**
 * Direct schema push — runs all migration SQL files against the DB
 * using the postgres-js driver (same as the app). Use when drizzle-kit push hangs.
 *
 * Usage: bun run scripts/push-schema.ts
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';

const url = process.env.DATABASE_URL ?? process.env.DATABASE_URL_UNPOOLED;
if (!url) {
  console.error('DATABASE_URL or DATABASE_URL_UNPOOLED required');
  process.exit(1);
}

const sql = postgres(url, { max: 1, idle_timeout: 10 });

async function run() {
  // Test connection
  const [{ now }] = await sql`SELECT now()`;
  console.log(`Connected to DB at ${now}`);

  const drizzleDir = join(import.meta.dir, '..', 'drizzle');
  const files = readdirSync(drizzleDir)
    .filter((f) => f.endsWith('.sql') && /^\d{4}/.test(f))
    .sort();

  console.log(`Found ${files.length} migration files\n`);

  for (const file of files) {
    const path = join(drizzleDir, file);
    const content = readFileSync(path, 'utf-8');

    // Split on the drizzle statement breakpoint marker
    const statements = content
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'));

    console.log(`--- ${file} (${statements.length} statements) ---`);

    for (const stmt of statements) {
      try {
        await sql.unsafe(stmt);
        console.log(`  OK: ${stmt.slice(0, 70).replace(/\n/g, ' ')}...`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (
          msg.includes('already exists') ||
          msg.includes('duplicate') ||
          msg.includes('DUPLICATE')
        ) {
          console.log(`  SKIP (exists): ${stmt.slice(0, 50).replace(/\n/g, ' ')}...`);
        } else {
          console.error(`  FAIL: ${stmt.slice(0, 80).replace(/\n/g, ' ')}...`);
          console.error(`        ${msg}`);
        }
      }
    }
  }

  await sql.end();
  console.log('\nDone.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
