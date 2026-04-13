import { describe, it, expect } from 'vitest';

/**
 * Tests for the CSV roster parser used in the setup wizard.
 * The parser is inline in the setup page — we extract the logic here for testing.
 */

interface RosterPlayer {
  firstName: string;
  lastName: string;
  jerseyNumber: number;
  positions: string[];
  grade?: string;
}

// Extracted from src/app/setup/page.tsx parseCsvRoster
function parseCsvRoster(text: string): RosterPlayer[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  const headerLine = lines[0];
  if (!headerLine) return [];
  const header = headerLine.toLowerCase().split(',').map((h) => h.trim());
  const firstNameIdx = header.findIndex((h) => h.includes('first'));
  const lastNameIdx = header.findIndex((h) => h.includes('last'));
  const jerseyIdx = header.findIndex((h) => h.includes('jersey') || h.includes('number') || h === '#');
  const posIdx = header.findIndex((h) => h.includes('pos'));
  const gradeIdx = header.findIndex((h) => h.includes('grade') || h.includes('year') || h.includes('class'));

  if (firstNameIdx === -1 || lastNameIdx === -1 || jerseyIdx === -1) return [];

  const players: RosterPlayer[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cols = line.split(',').map((c) => c.trim());
    const firstName = cols[firstNameIdx];
    const lastName = cols[lastNameIdx];
    const jersey = Number(cols[jerseyIdx]);

    if (!firstName || !lastName || Number.isNaN(jersey)) continue;

    const position = posIdx !== -1 && cols[posIdx] ? cols[posIdx].toUpperCase() : 'ATH';

    players.push({
      firstName,
      lastName,
      jerseyNumber: jersey,
      positions: [position],
      grade: gradeIdx !== -1 ? cols[gradeIdx] || undefined : undefined,
    });
  }

  return players;
}

describe('parseCsvRoster', () => {
  it('parses standard CSV with all columns', () => {
    const csv = `FirstName,LastName,Jersey,Position,Grade
John,Smith,12,QB,SR
Jane,Doe,5,WR,JR`;

    const players = parseCsvRoster(csv);
    expect(players).toHaveLength(2);
    expect(players[0]).toEqual({
      firstName: 'John',
      lastName: 'Smith',
      jerseyNumber: 12,
      positions: ['QB'],
      grade: 'SR',
    });
  });

  it('handles "Number" column header', () => {
    const csv = `FirstName,LastName,Number,Position
Tom,Brady,12,QB`;

    const players = parseCsvRoster(csv);
    expect(players).toHaveLength(1);
    expect(players[0]?.jerseyNumber).toBe(12);
  });

  it('handles "#" column header', () => {
    const csv = `FirstName,LastName,#,Position
Pat,Mahomes,15,QB`;

    const players = parseCsvRoster(csv);
    expect(players).toHaveLength(1);
    expect(players[0]?.jerseyNumber).toBe(15);
  });

  it('defaults to ATH when no position column', () => {
    const csv = `FirstName,LastName,Jersey
Mike,Jones,88`;

    const players = parseCsvRoster(csv);
    expect(players).toHaveLength(1);
    expect(players[0]?.positions).toEqual(['ATH']);
  });

  it('returns empty for header-only CSV', () => {
    const csv = `FirstName,LastName,Jersey`;
    expect(parseCsvRoster(csv)).toHaveLength(0);
  });

  it('returns empty for missing required columns', () => {
    const csv = `Name,Position
John Smith,QB`;
    expect(parseCsvRoster(csv)).toHaveLength(0);
  });

  it('skips rows with invalid jersey numbers', () => {
    const csv = `FirstName,LastName,Jersey,Position
John,Smith,abc,QB
Jane,Doe,5,WR`;

    const players = parseCsvRoster(csv);
    expect(players).toHaveLength(1);
    expect(players[0]?.firstName).toBe('Jane');
  });

  it('skips empty rows', () => {
    const csv = `FirstName,LastName,Jersey,Position
John,Smith,12,QB

Jane,Doe,5,WR`;

    const players = parseCsvRoster(csv);
    expect(players).toHaveLength(2);
  });

  it('uppercases position values', () => {
    const csv = `FirstName,LastName,Jersey,Position
John,Smith,12,qb`;

    const players = parseCsvRoster(csv);
    expect(players[0]?.positions).toEqual(['QB']);
  });

  it('handles "Class" as grade column', () => {
    const csv = `FirstName,LastName,Jersey,Position,Class
John,Smith,12,QB,Junior`;

    const players = parseCsvRoster(csv);
    expect(players[0]?.grade).toBe('Junior');
  });
});
