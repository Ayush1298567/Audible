import { parse } from 'csv-parse/sync';

export interface RosterCsvPlayer {
  firstName: string;
  lastName: string;
  jerseyNumber: number;
  positions: string[];
  grade?: string;
}

export interface RosterCsvIssue {
  row?: number;
  severity: 'error' | 'warning';
  message: string;
  jerseyNumber?: number;
}

export interface RosterCsvParseResult {
  players: RosterCsvPlayer[];
  issues: RosterCsvIssue[];
  duplicateJerseyNumbers: number[];
}

interface ParseRosterCsvOptions {
  existingJerseyNumbers?: Iterable<number>;
}

type CsvRecord = Record<string, string | undefined>;

const FIRST_NAME_HEADERS = ['first', 'first name', 'firstname', 'given'];
const LAST_NAME_HEADERS = ['last', 'last name', 'lastname', 'surname', 'family'];
const JERSEY_HEADERS = ['jersey', 'number', '#', 'no', 'no.'];
const POSITION_HEADERS = ['position', 'positions', 'pos'];
const GRADE_HEADERS = ['grade', 'year', 'class'];

export function parseRosterCsv(
  text: string,
  options: ParseRosterCsvOptions = {},
): RosterCsvParseResult {
  const issues: RosterCsvIssue[] = [];
  const duplicateJerseyNumbers = new Set<number>();
  const existingJerseyNumbers = new Set(options.existingJerseyNumbers ?? []);

  const trimmed = text.trim();
  if (!trimmed) {
    return {
      players: [],
      issues: [{ severity: 'error', message: 'CSV is empty.' }],
      duplicateJerseyNumbers: [],
    };
  }

  let headers: string[];
  let records: CsvRecord[];

  try {
    headers = parse(trimmed, {
      bom: true,
      relax_column_count: true,
      skip_empty_lines: true,
      to_line: 1,
      trim: true,
    })[0] as string[];

    records = parse(trimmed, {
      bom: true,
      columns: true,
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true,
    }) as CsvRecord[];
  } catch {
    return {
      players: [],
      issues: [{ severity: 'error', message: 'CSV could not be parsed. Check quotes and column separators.' }],
      duplicateJerseyNumbers: [],
    };
  }

  if (!headers || headers.length === 0) {
    return {
      players: [],
      issues: [{ severity: 'error', message: 'CSV is missing a header row.' }],
      duplicateJerseyNumbers: [],
    };
  }

  const firstNameHeader = findHeader(headers, FIRST_NAME_HEADERS);
  const lastNameHeader = findHeader(headers, LAST_NAME_HEADERS);
  const jerseyHeader = findHeader(headers, JERSEY_HEADERS);
  const positionHeader = findHeader(headers, POSITION_HEADERS);
  const gradeHeader = findHeader(headers, GRADE_HEADERS);

  if (!firstNameHeader || !lastNameHeader || !jerseyHeader) {
    return {
      players: [],
      issues: [
        {
          severity: 'error',
          message: 'CSV needs first name, last name, and jersey number columns.',
        },
      ],
      duplicateJerseyNumbers: [],
    };
  }

  const seenInFile = new Set<number>();
  const players: RosterCsvPlayer[] = [];

  records.forEach((record, index) => {
    const row = index + 2;
    const firstName = clean(record[firstNameHeader]);
    const lastName = clean(record[lastNameHeader]);
    const jerseyRaw = clean(record[jerseyHeader]);

    if (!firstName || !lastName) {
      issues.push({
        row,
        severity: 'error',
        message: `Row ${row} skipped: first and last name are required.`,
      });
      return;
    }

    const jerseyNumber = Number(jerseyRaw);
    if (!Number.isInteger(jerseyNumber) || jerseyNumber < 0 || jerseyNumber > 99) {
      issues.push({
        row,
        severity: 'error',
        message: `Row ${row} skipped: jersey number must be 0-99.`,
      });
      return;
    }

    if (existingJerseyNumbers.has(jerseyNumber)) {
      duplicateJerseyNumbers.add(jerseyNumber);
      issues.push({
        row,
        severity: 'warning',
        jerseyNumber,
        message: `Row ${row}: jersey #${jerseyNumber} is already on this roster.`,
      });
    }

    if (seenInFile.has(jerseyNumber)) {
      duplicateJerseyNumbers.add(jerseyNumber);
      issues.push({
        row,
        severity: 'warning',
        jerseyNumber,
        message: `Row ${row}: jersey #${jerseyNumber} appears more than once in this CSV.`,
      });
    }
    seenInFile.add(jerseyNumber);

    const positionValue = positionHeader ? clean(record[positionHeader]) : '';
    const positions = positionValue
      ? positionValue
          .split(/[;/,]/)
          .map((position) => position.trim().toUpperCase())
          .filter(Boolean)
      : ['ATH'];

    players.push({
      firstName,
      lastName,
      jerseyNumber,
      positions: positions.length > 0 ? positions : ['ATH'],
      grade: gradeHeader ? clean(record[gradeHeader]) || undefined : undefined,
    });
  });

  return {
    players,
    issues,
    duplicateJerseyNumbers: [...duplicateJerseyNumbers].sort((a, b) => a - b),
  };
}

function clean(value: string | undefined): string {
  return (value ?? '').trim();
}

function findHeader(headers: string[], candidates: string[]): string | undefined {
  return headers.find((header) => {
    const normalized = header.trim().toLowerCase();
    return candidates.some((candidate) => normalized === candidate || normalized.includes(candidate));
  });
}
