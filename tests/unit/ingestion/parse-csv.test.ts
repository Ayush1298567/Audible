import { describe, expect, it } from 'vitest';
import { HudlCsvParseError, parseHudlBreakdownCsv } from '@/lib/ingestion';

describe('parseHudlBreakdownCsv', () => {
  it('parses a minimal valid breakdown CSV', () => {
    const csv = [
      'Play #,DN,DIST,HASH,QTR,ODK',
      '1,1,10,M,1,O',
      '2,2,7,L,1,O',
      '3,3,3,R,1,O',
    ].join('\n');

    const result = parseHudlBreakdownCsv(csv);

    expect(result.rowCount).toBe(3);
    expect(result.columnCount).toBe(6);
    expect(result.rows[0]).toEqual({
      'Play #': '1',
      DN: '1',
      DIST: '10',
      HASH: 'M',
      QTR: '1',
      ODK: 'O',
    });
  });

  it('preserves Hudl custom columns (passthrough)', () => {
    const csv = [
      'Play #,DN,DIST,OFF FORM,CustomTag1',
      '1,1,10,TRIPS RIGHT,Zone Read',
    ].join('\n');

    const result = parseHudlBreakdownCsv(csv);
    expect(result.rows[0]).toMatchObject({
      'OFF FORM': 'TRIPS RIGHT',
      CustomTag1: 'Zone Read',
    });
  });

  it('handles empty strings for missing fields', () => {
    const csv = ['Play #,DN,DIST,HASH', '1,1,10,', '2,,,'].join('\n');
    const result = parseHudlBreakdownCsv(csv);
    expect(result.rows[0]?.HASH).toBe('');
    expect(result.rows[1]?.DN).toBe('');
  });

  it('trims whitespace in values', () => {
    const csv = ['Play #,DN,DIST', '1 , 1 , 10 '].join('\n');
    const result = parseHudlBreakdownCsv(csv);
    expect(result.rows[0]).toEqual({ 'Play #': '1', DN: '1', DIST: '10' });
  });

  it('tolerates UTF-8 BOM at start of file', () => {
    const csv = '\uFEFFPlay #,DN,DIST\n1,1,10';
    const result = parseHudlBreakdownCsv(csv);
    expect(result.rowCount).toBe(1);
    expect(result.rows[0]?.['Play #']).toBe('1');
  });

  it('skips empty lines', () => {
    const csv = ['Play #,DN,DIST', '1,1,10', '', '2,2,7', ''].join('\n');
    const result = parseHudlBreakdownCsv(csv);
    expect(result.rowCount).toBe(2);
  });

  it('throws HudlCsvParseError on empty input', () => {
    expect(() => parseHudlBreakdownCsv('')).toThrow(HudlCsvParseError);
  });

  it('throws HudlCsvParseError on header-only input', () => {
    expect(() => parseHudlBreakdownCsv('Play #,DN,DIST\n')).toThrow(/empty/);
  });

  it('accepts Buffer input as well as string', () => {
    const csv = Buffer.from('Play #,DN,DIST\n1,1,10');
    const result = parseHudlBreakdownCsv(csv);
    expect(result.rowCount).toBe(1);
  });
});
