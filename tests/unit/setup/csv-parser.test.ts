import { describe, it, expect } from 'vitest';
import { parseRosterCsv } from '@/lib/setup/roster-csv';

/**
 * Tests for the CSV roster parser used in the setup wizard.
 * The parser powers the setup import preview before any players are inserted.
 */

describe('parseCsvRoster', () => {
  it('parses standard CSV with all columns', () => {
    const csv = `FirstName,LastName,Jersey,Position,Grade
John,Smith,12,QB,SR
Jane,Doe,5,WR,JR`;

    const { players, issues } = parseRosterCsv(csv);
    expect(players).toHaveLength(2);
    expect(issues).toHaveLength(0);
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

    const { players } = parseRosterCsv(csv);
    expect(players).toHaveLength(1);
    expect(players[0]?.jerseyNumber).toBe(12);
  });

  it('handles "#" column header', () => {
    const csv = `FirstName,LastName,#,Position
Pat,Mahomes,15,QB`;

    const { players } = parseRosterCsv(csv);
    expect(players).toHaveLength(1);
    expect(players[0]?.jerseyNumber).toBe(15);
  });

  it('defaults to ATH when no position column', () => {
    const csv = `FirstName,LastName,Jersey
Mike,Jones,88`;

    const { players } = parseRosterCsv(csv);
    expect(players).toHaveLength(1);
    expect(players[0]?.positions).toEqual(['ATH']);
  });

  it('returns empty for header-only CSV', () => {
    const csv = `FirstName,LastName,Jersey`;
    expect(parseRosterCsv(csv).players).toHaveLength(0);
  });

  it('returns a validation issue for missing required columns', () => {
    const csv = `Name,Position
John Smith,QB`;
    const result = parseRosterCsv(csv);
    expect(result.players).toHaveLength(0);
    expect(result.issues[0]?.severity).toBe('error');
  });

  it('skips rows with invalid jersey numbers and reports the row', () => {
    const csv = `FirstName,LastName,Jersey,Position
John,Smith,abc,QB
Jane,Doe,5,WR`;

    const { players, issues } = parseRosterCsv(csv);
    expect(players).toHaveLength(1);
    expect(players[0]?.firstName).toBe('Jane');
    expect(issues[0]?.row).toBe(2);
  });

  it('skips empty rows', () => {
    const csv = `FirstName,LastName,Jersey,Position
John,Smith,12,QB

Jane,Doe,5,WR`;

    const { players } = parseRosterCsv(csv);
    expect(players).toHaveLength(2);
  });

  it('uppercases position values', () => {
    const csv = `FirstName,LastName,Jersey,Position
John,Smith,12,qb`;

    const { players } = parseRosterCsv(csv);
    expect(players[0]?.positions).toEqual(['QB']);
  });

  it('handles "Class" as grade column', () => {
    const csv = `FirstName,LastName,Jersey,Position,Class
John,Smith,12,QB,Junior`;

    const { players } = parseRosterCsv(csv);
    expect(players[0]?.grade).toBe('Junior');
  });

  it('parses quoted position lists without splitting CSV columns incorrectly', () => {
    const csv = `FirstName,LastName,Jersey,Position
John,Smith,12,"QB, ATH"`;

    const { players } = parseRosterCsv(csv);
    expect(players[0]?.positions).toEqual(['QB', 'ATH']);
  });

  it('warns about duplicate jerseys in the CSV', () => {
    const csv = `FirstName,LastName,Jersey,Position
John,Smith,12,QB
Jake,Stone,12,WR`;

    const result = parseRosterCsv(csv);
    expect(result.players).toHaveLength(2);
    expect(result.duplicateJerseyNumbers).toEqual([12]);
    expect(result.issues.some((issue) => issue.severity === 'warning')).toBe(true);
  });

  it('warns about jerseys already present on the roster', () => {
    const csv = `FirstName,LastName,Jersey,Position
John,Smith,12,QB`;

    const result = parseRosterCsv(csv, { existingJerseyNumbers: [12] });
    expect(result.players).toHaveLength(1);
    expect(result.duplicateJerseyNumbers).toEqual([12]);
    expect(result.issues[0]?.message).toContain('already on this roster');
  });
});
