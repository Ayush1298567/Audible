import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

type Journal = {
  entries: Array<{ idx?: number; tag: string }>;
};

const root = path.resolve(process.cwd());
const drizzleDir = path.join(root, 'drizzle');
const journalPath = path.join(drizzleDir, 'meta/_journal.json');
// 0001_enable_rls.sql is retained as legacy reference material; the journaled
// RLS runtime-context policies now live in 0007_rls_runtime_context.sql.
const allowedDuplicatePrefixes = new Set(['0001']);

function fail(message: string): never {
  console.error(`[migrate:check] ${message}`);
  process.exit(1);
}

function readJournal(): Journal {
  if (!existsSync(journalPath)) {
    fail(`Missing migration journal: ${path.relative(root, journalPath)}`);
  }

  try {
    return JSON.parse(readFileSync(journalPath, 'utf8')) as Journal;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(`Could not parse migration journal: ${message}`);
  }
}

function main(): void {
  const journal = readJournal();
  const sqlFiles = readdirSync(drizzleDir).filter((file) => file.endsWith('.sql')).sort();

  const missing = journal.entries
    .map((entry) => `${entry.tag}.sql`)
    .filter((file) => !existsSync(path.join(drizzleDir, file)));
  if (missing.length > 0) {
    fail(`Journal entries missing SQL files: ${missing.join(', ')}`);
  }

  const prefixes = journal.entries.map((entry) => Number.parseInt(entry.tag.slice(0, 4), 10));
  const sortedPrefixes = [...prefixes].sort((a, b) => a - b);
  if (JSON.stringify(prefixes) !== JSON.stringify(sortedPrefixes)) {
    fail(`Journal entries are out of order: ${journal.entries.map((entry) => entry.tag).join(', ')}`);
  }

  const misaligned = journal.entries
    .map((entry, position) => ({
      position,
      idx: entry.idx,
      prefix: Number.parseInt(entry.tag.slice(0, 4), 10),
      tag: entry.tag,
    }))
    .filter((entry) => entry.idx !== entry.position || entry.prefix !== entry.position);
  if (misaligned.length > 0) {
    fail(
      `Journal idx/prefix values must be contiguous and aligned: ${misaligned
        .map((entry) => `${entry.tag} has idx=${entry.idx}, prefix=${entry.prefix}, position=${entry.position}`)
        .join('; ')}`,
    );
  }

  const byPrefix = new Map<string, string[]>();
  for (const file of sqlFiles) {
    const prefix = file.slice(0, 4);
    byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), file]);
  }

  const duplicateGroups = [...byPrefix.entries()]
    .filter(([prefix, files]) => files.length > 1 && !allowedDuplicatePrefixes.has(prefix))
    .map(([, files]) => files);
  if (duplicateGroups.length > 0) {
    fail(
      `Duplicate migration prefixes are not allowed: ${duplicateGroups
        .map((files) => files.join(', '))
        .join('; ')}`,
    );
  }

  const journalFiles = new Set(journal.entries.map((entry) => `${entry.tag}.sql`));
  const unjournaled = sqlFiles.filter((file) => {
    const prefix = file.slice(0, 4);
    return !journalFiles.has(file) && !allowedDuplicatePrefixes.has(prefix);
  });
  if (unjournaled.length > 0) {
    fail(`SQL files are not present in the journal: ${unjournaled.join(', ')}`);
  }

  console.log(
    `[migrate:check] ok: ${journal.entries.length} journal entries, ${sqlFiles.length} SQL files`,
  );
}

main();
