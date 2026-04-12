/**
 * Hudl SportsCode XML parser.
 *
 * SportsCode XML is a simple schema:
 *
 *   <file>
 *     <ALL_INSTANCES>
 *       <instance>
 *         <ID>1</ID>
 *         <start>12.34</start>
 *         <end>18.76</end>
 *         <code>1</code>
 *         <label>...</label>         (optional, ignored)
 *       </instance>
 *       ...
 *     </ALL_INSTANCES>
 *   </file>
 *
 * We only need `code`, `start`, and `end` for reconciliation. Everything
 * else is ignored. The result is fed into `reconcileHudlExport` which
 * Zod-validates it before use.
 */

import { XMLParser } from 'fast-xml-parser';

export interface ParseXmlResult {
  segments: Array<{
    code: string;
    start: number;
    end: number;
  }>;
  segmentCount: number;
}

export class HudlXmlParseError extends Error {
  constructor(
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'HudlXmlParseError';
  }
}

const xmlParser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false, // we want strings, we parse numbers ourselves
  trimValues: true,
  isArray: (name) => name === 'instance',
});

/**
 * Parse a SportsCode XML string into an array of segments. Segments are
 * returned in document order, which matches play order (positional
 * alignment with the breakdown CSV). See reconcile.ts step 7.
 */
export function parseSportscodeXml(input: string | Buffer): ParseXmlResult {
  const text = Buffer.isBuffer(input) ? input.toString('utf8') : input;

  let doc: unknown;
  try {
    doc = xmlParser.parse(text);
  } catch (err) {
    throw new HudlXmlParseError(
      `Could not parse SportsCode XML: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  // Navigate the doc tree: file > ALL_INSTANCES > instance[]
  const fileNode = (doc as Record<string, unknown>).file;
  if (!fileNode || typeof fileNode !== 'object') {
    throw new HudlXmlParseError('SportsCode XML missing root <file> element', { doc });
  }

  const instancesNode = (fileNode as Record<string, unknown>).ALL_INSTANCES;
  if (!instancesNode || typeof instancesNode !== 'object') {
    throw new HudlXmlParseError(
      'SportsCode XML missing <ALL_INSTANCES> container',
      { file: fileNode },
    );
  }

  const rawInstances = (instancesNode as Record<string, unknown>).instance;
  if (!Array.isArray(rawInstances)) {
    throw new HudlXmlParseError(
      'SportsCode XML contains no <instance> elements',
      { allInstances: instancesNode },
    );
  }

  if (rawInstances.length === 0) {
    throw new HudlXmlParseError('SportsCode XML contains zero instances');
  }

  const segments = rawInstances.map((raw, i) => {
    if (!raw || typeof raw !== 'object') {
      throw new HudlXmlParseError(`Malformed instance at index ${i}: not an object`, {
        index: i,
        raw,
      });
    }
    const inst = raw as Record<string, unknown>;

    const code = typeof inst.code === 'string' ? inst.code : String(inst.code ?? '');
    const startRaw = inst.start;
    const endRaw = inst.end;

    const start = typeof startRaw === 'string' ? parseFloat(startRaw) : Number(startRaw);
    const end = typeof endRaw === 'string' ? parseFloat(endRaw) : Number(endRaw);

    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      throw new HudlXmlParseError(
        `Malformed instance at index ${i}: non-numeric start/end`,
        { index: i, startRaw, endRaw },
      );
    }

    return { code, start, end };
  });

  return {
    segments,
    segmentCount: segments.length,
  };
}
