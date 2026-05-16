import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type Journal = {
  entries: Array<{ idx?: number; tag: string }>;
};

const root = path.resolve(__dirname, '../../..');
const drizzleDir = path.join(root, 'drizzle');
const schemaFiles = [
  path.join(root, 'src/lib/db/schema.ts'),
  path.join(root, 'src/lib/db/schema-gameplan.ts'),
  path.join(root, 'src/lib/db/schema-sessions.ts'),
];
const rlsMigrationPath = path.join(drizzleDir, '0007_rls_runtime_context.sql');
const updatedAtMigrationPath = path.join(drizzleDir, '0009_updated_at_triggers.sql');
const joinScopedTenantTables = new Set(['collection_plays']);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tablePattern(table: string): string {
  const escaped = escapeRegExp(table);
  return `(?:"${escaped}"|\\b${escaped}\\b)`;
}

function programScopedSchemaTables(): string[] {
  const tables = new Set<string>();

  for (const file of schemaFiles) {
    const source = readFileSync(file, 'utf8');
    for (const chunk of source.split(/\nexport const /)) {
      const table = chunk.match(/pgTable\(\s*['"]([^'"]+)['"]/)?.[1];
      if (table && /programId:\s*uuid\(\s*['"]program_id['"]/.test(chunk)) {
        tables.add(table);
      }
    }
  }

  for (const table of joinScopedTenantTables) {
    tables.add(table);
  }

  return [...tables].sort();
}

function updatedAtSchemaTables(): string[] {
  const tables = new Set<string>();

  for (const file of schemaFiles) {
    const source = readFileSync(file, 'utf8');
    for (const chunk of source.split(/\nexport const /)) {
      const table = chunk.match(/pgTable\(\s*['"]([^'"]+)['"]/)?.[1];
      if (table && /updatedAt:\s*timestamp\(\s*['"]updated_at['"]/.test(chunk)) {
        tables.add(table);
      }
    }
  }

  return [...tables].sort();
}

function hasAlterTableRls(sql: string, table: string, action: 'ENABLE' | 'FORCE'): boolean {
  return new RegExp(
    `ALTER\\s+TABLE\\s+${tablePattern(table)}\\s+${action}\\s+ROW\\s+LEVEL\\s+SECURITY\\s*;`,
    'i',
  ).test(sql);
}

function programIsolationPolicy(sql: string, table: string): string | null {
  return (
    sql.match(
      new RegExp(
        `CREATE\\s+POLICY[^;]*?\\s+ON\\s+${tablePattern(table)}\\s+FOR\\s+ALL[^;]*?;`,
        'i',
      ),
    )?.[0] ?? null
  );
}

describe('drizzle migrations', () => {
  it('has a SQL file for every journal entry', () => {
    const journal = JSON.parse(
      readFileSync(path.join(drizzleDir, 'meta/_journal.json'), 'utf8'),
    ) as Journal;

    const missing = journal.entries
      .map((entry) => `${entry.tag}.sql`)
      .filter((file) => !existsSync(path.join(drizzleDir, file)));

    expect(missing).toEqual([]);
  });

  it('keeps journal entries contiguous and aligned with filename prefixes', () => {
    const journal = JSON.parse(
      readFileSync(path.join(drizzleDir, 'meta/_journal.json'), 'utf8'),
    ) as Journal;

    const prefixes = journal.entries.map((entry) =>
      Number.parseInt(entry.tag.slice(0, 4), 10),
    );
    expect(prefixes).toEqual([...prefixes].sort((a, b) => a - b));
    expect(
      journal.entries.map((entry, position) => ({
        position,
        idx: Number.parseInt(String(entry.idx), 10),
        prefix: Number.parseInt(entry.tag.slice(0, 4), 10),
        tag: entry.tag,
      })),
    ).toEqual(
      journal.entries.map((entry, position) => ({
        position,
        idx: position,
        prefix: position,
        tag: entry.tag,
      })),
    );
  });

  it('does not leave duplicate numbered migration files except documented legacy files', () => {
    const allowedDuplicates = new Set(['0001']);
    const sqlFiles = readdirSync(drizzleDir).filter((file) => file.endsWith('.sql'));
    const byPrefix = new Map<string, string[]>();

    for (const file of sqlFiles) {
      const prefix = file.slice(0, 4);
      byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), file]);
    }

    const duplicates = [...byPrefix.entries()]
      .filter(([prefix, files]) => files.length > 1 && !allowedDuplicates.has(prefix))
      .map(([, files]) => files);

    expect(duplicates).toEqual([]);
  });

  it('enables and forces RLS for every tenant-scoped table', () => {
    const migration = readFileSync(rlsMigrationPath, 'utf8');
    const tables = programScopedSchemaTables();

    expect(tables).toContain('coaches');
    expect(tables).toContain('collection_plays');

    const missing = tables
      .filter(
        (table) =>
          !hasAlterTableRls(migration, table, 'ENABLE') ||
          !hasAlterTableRls(migration, table, 'FORCE'),
      )
      .map((table) => ({
        table,
        enable: hasAlterTableRls(migration, table, 'ENABLE'),
        force: hasAlterTableRls(migration, table, 'FORCE'),
      }));

    expect(missing).toEqual([]);
  });

  it('defines USING and WITH CHECK isolation for every tenant-scoped table', () => {
    const migration = readFileSync(rlsMigrationPath, 'utf8');
    const missing = programScopedSchemaTables()
      .map((table) => {
        const policy = programIsolationPolicy(migration, table);
        return {
          table,
          hasForAllPolicy: Boolean(policy),
          hasUsing: Boolean(policy && /\bUSING\s*\(/i.test(policy)),
          hasWithCheck: Boolean(policy && /\bWITH\s+CHECK\s*\(/i.test(policy)),
        };
      })
      .filter((coverage) => !coverage.hasForAllPolicy || !coverage.hasUsing || !coverage.hasWithCheck);

    expect(missing).toEqual([]);
  });

  it('requires collection_plays rows to match both the collection and play program', () => {
    const migration = readFileSync(rlsMigrationPath, 'utf8');
    const policy = programIsolationPolicy(migration, 'collection_plays');
    expect(policy).toBeTruthy();

    const [usingSection, withCheckSection = ''] = policy?.split(/\bWITH\s+CHECK\b/i) ?? [];
    const expectedCollectionCheck =
      /FROM\s+collections[\s\S]*collections\.program_id\s*=\s*app\.current_program_id\(\)/i;
    const expectedPlayCheck =
      /FROM\s+plays[\s\S]*plays\.program_id\s*=\s*app\.current_program_id\(\)/i;

    expect(usingSection).toMatch(expectedCollectionCheck);
    expect(usingSection).toMatch(expectedPlayCheck);
    expect(withCheckSection).toMatch(expectedCollectionCheck);
    expect(withCheckSection).toMatch(expectedPlayCheck);
  });

  it('attaches updated_at maintenance triggers to every updatedAt table', () => {
    const migration = readFileSync(updatedAtMigrationPath, 'utf8');
    const tables = updatedAtSchemaTables();

    expect(tables).toContain('players');
    expect(tables).toContain('plays');

    const missing = tables.filter(
      (table) =>
        !new RegExp(
          `CREATE\\s+TRIGGER\\s+touch_updated_at_${table}[\\s\\S]*?BEFORE\\s+UPDATE\\s+ON\\s+${tablePattern(table)}[\\s\\S]*?EXECUTE\\s+FUNCTION\\s+app\\.touch_updated_at\\(\\)\\s*;`,
          'i',
        ).test(migration),
    );

    expect(missing).toEqual([]);
  });
});
