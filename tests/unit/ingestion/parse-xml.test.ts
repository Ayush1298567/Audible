import { describe, expect, it } from 'vitest';
import { HudlXmlParseError, parseSportscodeXml } from '@/lib/ingestion';

function buildXml(
  instances: Array<{ id: number; code: string; start: number; end: number }>,
): string {
  const inner = instances
    .map(
      (i) => `
    <instance>
      <ID>${i.id}</ID>
      <start>${i.start}</start>
      <end>${i.end}</end>
      <code>${i.code}</code>
    </instance>`,
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<file>
  <ALL_INSTANCES>${inner}
  </ALL_INSTANCES>
</file>`;
}

describe('parseSportscodeXml', () => {
  it('parses a valid SportsCode XML with three instances', () => {
    const xml = buildXml([
      { id: 1, code: '1', start: 0, end: 5.2 },
      { id: 2, code: '2', start: 30, end: 38.4 },
      { id: 3, code: '3', start: 60.1, end: 68.3 },
    ]);

    const result = parseSportscodeXml(xml);

    expect(result.segmentCount).toBe(3);
    expect(result.segments[0]).toEqual({ code: '1', start: 0, end: 5.2 });
    expect(result.segments[1]).toEqual({ code: '2', start: 30, end: 38.4 });
    expect(result.segments[2]).toEqual({ code: '3', start: 60.1, end: 68.3 });
  });

  it('preserves document order in the output array', () => {
    const xml = buildXml([
      { id: 1, code: 'A', start: 0, end: 5 },
      { id: 2, code: 'B', start: 10, end: 15 },
      { id: 3, code: 'C', start: 20, end: 25 },
    ]);
    const result = parseSportscodeXml(xml);
    const codes = result.segments.map((s) => s.code);
    expect(codes).toEqual(['A', 'B', 'C']);
  });

  it('handles a single instance without array unwrapping bugs', () => {
    const xml = buildXml([{ id: 1, code: '1', start: 0, end: 5 }]);
    const result = parseSportscodeXml(xml);
    expect(result.segmentCount).toBe(1);
    expect(Array.isArray(result.segments)).toBe(true);
  });

  it('accepts Buffer input as well as string', () => {
    const xml = Buffer.from(buildXml([{ id: 1, code: '1', start: 0, end: 5 }]));
    const result = parseSportscodeXml(xml);
    expect(result.segmentCount).toBe(1);
  });

  it('throws on missing <file> root', () => {
    expect(() => parseSportscodeXml('<not-a-file></not-a-file>')).toThrow(HudlXmlParseError);
  });

  it('throws on missing <ALL_INSTANCES> container', () => {
    const xml = '<file><SomethingElse/></file>';
    expect(() => parseSportscodeXml(xml)).toThrow(/ALL_INSTANCES/);
  });

  it('throws on zero instances', () => {
    const xml = '<file><ALL_INSTANCES></ALL_INSTANCES></file>';
    expect(() => parseSportscodeXml(xml)).toThrow(HudlXmlParseError);
  });

  it('throws on malformed XML', () => {
    expect(() => parseSportscodeXml('<file><ALL_INSTANCES><instance>')).toThrow(
      HudlXmlParseError,
    );
  });

  it('throws on non-numeric start/end', () => {
    const xml = `<?xml version="1.0"?>
<file>
  <ALL_INSTANCES>
    <instance>
      <ID>1</ID>
      <start>not-a-number</start>
      <end>5</end>
      <code>1</code>
    </instance>
  </ALL_INSTANCES>
</file>`;
    expect(() => parseSportscodeXml(xml)).toThrow(/non-numeric/);
  });
});
