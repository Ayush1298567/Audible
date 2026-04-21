/**
 * Direct schema push via Neon HTTP driver.
 * Usage: npx tsx scripts/push-schema.ts
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

    const statements = content
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'));

    console.log(`--- ${file} (${statements.length} statements) ---`);

    for (const stmt of statements) {
      try {
        await sql.query(stmt);
        console.log(`  OK: ${stmt.slice(0, 70).replace(/\n/g, ' ')}...`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('already exists') || msg.includes('duplicate')) {
          console.log(`  SKIP (exists): ${stmt.slice(0, 50).replace(/\n/g, ' ')}...`);
        } else {
          console.error(`  FAIL: ${stmt.slice(0, 80).replace(/\n/g, ' ')}...`);
          console.error(`        ${msg}`);
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
