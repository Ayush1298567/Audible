/**
 * Tests for the Hudl export reconciliation algorithm.
 *
 * This is the single most critical correctness checkpoint in Phase 2.
 * Every failure branch in PLAN.md §4a must have a test. Partial
 * ingestion is forbidden — a mismatch must reject with a clear error.
 *
 * Reference: src/lib/ingestion/reconcile.ts
 */

import { describe, expect, it } from 'vitest';
import {
  HudlReconciliationError,
  reconcileHudlExport,
  computeIdempotencyKey,
} from '@/lib/ingestion';

// Helper: build a valid CSV row for tests.
function csvRow(playNumber: number, overrides: Record<string, unknown> = {}) {
  return {
    'Play #': String(playNumber),
    DN: '1',
    DIST: '10',
    HASH: 'M',
    QTR: '1',
    ODK: 'O',
    ...overrides,
  };
}

// Helper: build a valid XML segment.
function xmlSegment(start: number, end: number) {
  return {
    code: String(Math.floor(start)),
    start,
    end,
  };
}

describe('reconcileHudlExport', () => {
  describe('happy path', () => {
    it('accepts matched CSV + XML with valid durations', () => {
      const result = reconcileHudlExport({
        csvRaw: [csvRow(1), csvRow(2), csvRow(3)],
        xmlRaw: [xmlSegment(0, 5), xmlSegment(30, 38), xmlSegment(60, 68)],
        // Video ends just past the last segment — no trailing footage warning
        mp4DurationSeconds: 69,
      });

      expect(result.playRows).toHaveLength(3);
      expect(result.playRows[0]).toMatchObject({
        playOrder: 1,
        segment: { start: 0, end: 5 },
      });
      expect(result.playRows[2]).toMatchObject({
        playOrder: 3,
        segment: { start: 60, end: 68 },
      });
      expect(result.warnings).toHaveLength(0);
    });

    it('warns when XML segments end well before MP4 ends', () => {
      const result = reconcileHudlExport({
        csvRaw: [csvRow(1)],
        xmlRaw: [xmlSegment(0, 5)],
        mp4DurationSeconds: 120, // 115s of trailing footage
      });

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('115');
      expect(result.warnings[0]).toContain('trailing footage');
    });
  });

  describe('rejection: CSV row count != XML segment count (PLAN.md §4a step 4)', () => {
    it('rejects when CSV has more rows than XML', () => {
      expect(() =>
        reconcileHudlExport({
          csvRaw: [csvRow(1), csvRow(2), csvRow(3)],
          xmlRaw: [xmlSegment(0, 5), xmlSegment(10, 15)],
          mp4DurationSeconds: 60,
        }),
      ).toThrow(HudlReconciliationError);
    });

    it('rejects when XML has more segments than CSV', () => {
      expect(() =>
        reconcileHudlExport({
          csvRaw: [csvRow(1)],
          xmlRaw: [xmlSegment(0, 5), xmlSegment(10, 15)],
          mp4DurationSeconds: 60,
        }),
      ).toThrow(/CSV has 1 plays but XML has 2 segments/);
    });

    it('error includes counts in the details object', () => {
      try {
        reconcileHudlExport({
          csvRaw: [csvRow(1), csvRow(2)],
          xmlRaw: [xmlSegment(0, 5)],
          mp4DurationSeconds: 60,
        });
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(HudlReconciliationError);
        if (err instanceof HudlReconciliationError) {
          expect(err.details.csvRowCount).toBe(2);
          expect(err.details.xmlSegmentCount).toBe(1);
        }
      }
    });
  });

  describe('rejection: XML drift beyond MP4 duration (step 5)', () => {
    it('rejects when max XML end exceeds MP4 duration by more than 2s tolerance', () => {
      expect(() =>
        reconcileHudlExport({
          csvRaw: [csvRow(1)],
          xmlRaw: [xmlSegment(0, 65)],
          mp4DurationSeconds: 60, // segment ends 5s after video ends
        }),
      ).toThrow(/extend.*beyond video duration/);
    });

    it('accepts within the 2s drift tolerance', () => {
      const result = reconcileHudlExport({
        csvRaw: [csvRow(1)],
        xmlRaw: [xmlSegment(0, 61.5)], // 1.5s past, within tolerance
        mp4DurationSeconds: 60,
      });
      expect(result.playRows).toHaveLength(1);
    });
  });

  describe('rejection: zero-duration segments (step 6)', () => {
    it('rejects segments where end <= start via Zod', () => {
      expect(() =>
        reconcileHudlExport({
          csvRaw: [csvRow(1)],
          xmlRaw: [{ code: '1', start: 10, end: 10 }],
          mp4DurationSeconds: 60,
        }),
      ).toThrow(HudlReconciliationError);
    });

    it('rejects segments longer than 5 minutes (likely parse bug)', () => {
      expect(() =>
        reconcileHudlExport({
          csvRaw: [csvRow(1)],
          xmlRaw: [{ code: '1', start: 0, end: 400 }],
          mp4DurationSeconds: 500,
        }),
      ).toThrow(HudlReconciliationError);
    });
  });

  describe('rejection: invalid CSV rows (Zod validation)', () => {
    it('rejects when breakdown CSV is empty', () => {
      expect(() =>
        reconcileHudlExport({
          csvRaw: [],
          xmlRaw: [],
          mp4DurationSeconds: 60,
        }),
      ).toThrow(HudlReconciliationError);
    });

    it('rejects when a row is missing Play #', () => {
      expect(() =>
        reconcileHudlExport({
          csvRaw: [{ DN: '1', DIST: '10' }],
          xmlRaw: [xmlSegment(0, 5)],
          mp4DurationSeconds: 60,
        }),
      ).toThrow(HudlReconciliationError);
    });
  });

  describe('alignment is positional (step 7)', () => {
    it('aligns CSV row i with XML segment i, not by any key', () => {
      const result = reconcileHudlExport({
        csvRaw: [csvRow(99), csvRow(100)], // Play #s don't start at 1
        xmlRaw: [xmlSegment(0, 5), xmlSegment(10, 18)],
        mp4DurationSeconds: 30,
      });

      // playOrder is the index position, NOT the Play # from the CSV
      expect(result.playRows[0]?.playOrder).toBe(1);
      expect(result.playRows[1]?.playOrder).toBe(2);
      // But the raw CSV row still carries the original Play #
      expect(result.playRows[0]?.row['Play #']).toBe(99);
      expect(result.playRows[1]?.row['Play #']).toBe(100);
    });
  });
});

describe('computeIdempotencyKey', () => {
  it('produces deterministic keys for the same inputs', () => {
    const key1 = computeIdempotencyKey({
      mp4Sha256: 'abc123',
      programId: 'prog-1',
      gameId: 'game-1',
    });
    const key2 = computeIdempotencyKey({
      mp4Sha256: 'abc123',
      programId: 'prog-1',
      gameId: 'game-1',
    });
    expect(key1).toBe(key2);
  });

  it('produces different keys for different MP4 hashes', () => {
    const key1 = computeIdempotencyKey({
      mp4Sha256: 'abc123',
      programId: 'prog-1',
      gameId: 'game-1',
    });
    const key2 = computeIdempotencyKey({
      mp4Sha256: 'def456',
      programId: 'prog-1',
      gameId: 'game-1',
    });
    expect(key1).not.toBe(key2);
  });

  it('scopes by program even when MP4 hash is identical', () => {
    const key1 = computeIdempotencyKey({
      mp4Sha256: 'abc123',
      programId: 'prog-1',
      gameId: 'game-1',
    });
    const key2 = computeIdempotencyKey({
      mp4Sha256: 'abc123',
      programId: 'prog-2',
      gameId: 'game-1',
    });
    expect(key1).not.toBe(key2);
  });
});
