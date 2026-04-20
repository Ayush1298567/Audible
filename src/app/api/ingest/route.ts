/**
 * POST /api/ingest — Hudl film ingestion endpoint.
 *
 * Accepts a multipart form upload with three files:
 *   - csv: Hudl breakdown CSV
 *   - xml: SportsCode XML with timestamps
 *   - mp4: concatenated MP4 of all clips
 *
 * Plus form fields:
 *   - programId: UUID
 *   - gameId: UUID
 *
 * Flow (implements PLAN.md §4a):
 *   1. Parse CSV + XML via Zod schemas
 *   2. Upload MP4 to Vercel Blob
 *   3. Probe MP4 duration via ffprobe
 *   4. Run reconciliation algorithm (hard-fail on mismatch)
 *   5. Insert tag rows into plays table
 *   6. Split clips and upload each to Blob
 *   7. Update play rows with clip URLs
 *   8. Return the created play count
 *
 * Phase 2 MVP: steps 5-7 run synchronously. Phase 4.5 migrates
 * to Vercel Queues (one job per play for clip splitting + CV).
 */

import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { put } from '@vercel/blob';
import { eq } from 'drizzle-orm';
import { withProgramContext } from '@/lib/db/client';
import { filmUploads, plays } from '@/lib/db/schema';
import { beginSpan, log } from '@/lib/observability/log';
import {
  parseHudlBreakdownCsv,
  parseSportscodeXml,
  reconcileHudlExport,
  computeIdempotencyKey,
  HudlReconciliationError,
} from '@/lib/ingestion';
import { probeVideoDuration, splitAndUploadClips } from '@/lib/ingestion/split-clips';
import { AuthError, requireCoachForProgram } from '@/lib/auth/guards';

export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/ingest' }, req);
  let uploadContext: { programId: string; filmUploadId: string } | null = null;

  try {
    // Parse the multipart form
    const formData = await req.formData();
    const csvFile = formData.get('csv') as File | null;
    const xmlFile = formData.get('xml') as File | null;
    const mp4File = formData.get('mp4') as File | null;
    const programId = formData.get('programId') as string | null;
    const gameId = formData.get('gameId') as string | null;

    // Validate required fields
    if (!csvFile || !xmlFile || !mp4File) {
      return Response.json(
        { error: 'Missing required files: csv, xml, mp4' },
        { status: 400 },
      );
    }
    if (!programId || !gameId) {
      return Response.json(
        { error: 'Missing required fields: programId, gameId' },
        { status: 400 },
      );
    }
    const coachSession = await requireCoachForProgram(programId);

    // Read file contents
    const csvText = await csvFile.text();
    const xmlText = await xmlFile.text();
    const mp4Buffer = Buffer.from(await mp4File.arrayBuffer());

    // Compute idempotency key
    const mp4Sha256 = createHash('sha256').update(mp4Buffer).digest('hex');
    const idempotencyKey = computeIdempotencyKey({ mp4Sha256, programId, gameId });

    // Check for duplicate upload
    const existingUpload = await withProgramContext(programId, async (tx) => {
      const rows = await tx
        .select()
        .from(filmUploads)
        .where(eq(filmUploads.idempotencyKey, idempotencyKey))
        .limit(1);
      return rows[0];
    });

    if (existingUpload) {
      span.done({ result: 'duplicate', filmUploadId: existingUpload.id });
      return Response.json({
        message: 'This film has already been uploaded',
        filmUploadId: existingUpload.id,
        status: existingUpload.status,
      });
    }

    // Step 1: Parse CSV and XML
    log.info('parsing_hudl_export', { programId, gameId });

    const csvResult = parseHudlBreakdownCsv(csvText);
    const xmlResult = parseSportscodeXml(xmlText);

    // Step 2: Upload MP4 to Blob (needed for clip splitting later)
    log.info('uploading_mp4_to_blob', {
      programId,
      gameId,
      sizeBytes: mp4Buffer.length,
    });

    const mp4BlobPath = `programs/${programId}/games/${gameId}/full-game.mp4`;
    const mp4Blob = await put(mp4BlobPath, mp4Buffer, {
      access: 'public',
      contentType: 'video/mp4',
      addRandomSuffix: true,
    });

    // Step 3: Probe MP4 duration
    const mp4TempPath = join(tmpdir(), `probe-${randomUUID()}.mp4`);
    await writeFile(mp4TempPath, mp4Buffer);
    const mp4Duration = await probeVideoDuration(mp4TempPath);

    // Step 4: Reconcile (hard-fail on mismatch — PLAN.md §4a)
    log.info('reconciling_hudl_export', {
      csvRows: csvResult.rowCount,
      xmlSegments: xmlResult.segmentCount,
      mp4Duration,
      programId,
    });

    const reconciled = reconcileHudlExport({
      csvRaw: csvResult.rows,
      xmlRaw: xmlResult.segments,
      mp4DurationSeconds: mp4Duration,
    });

    // Create the film upload record
    const [upload] = await withProgramContext(programId, async (tx) =>
      tx
        .insert(filmUploads)
        .values({
          programId,
          gameId,
          idempotencyKey,
          mp4BlobKey: mp4Blob.url,
          csvRowCount: csvResult.rowCount,
          xmlSegmentCount: xmlResult.segmentCount,
          mp4DurationSeconds: mp4Duration,
          status: 'splitting',
          uploadedByClerkUserId: coachSession.clerkUserId,
        })
        .returning(),
    );

    if (!upload) {
      throw new Error('Film upload insert returned no rows');
    }
    uploadContext = { programId, filmUploadId: upload.id };

    // Step 5: Insert tag rows from the reconciled CSV data
    log.info('inserting_play_tags', {
      playCount: reconciled.playRows.length,
      programId,
      filmUploadId: upload.id,
    });

    const playInserts = reconciled.playRows.map((pr) => ({
      programId,
      gameId,
      filmUploadId: upload.id,
      playOrder: pr.playOrder,
      down: pr.row.DN != null ? Number(pr.row.DN) : null,
      distance: pr.row.DIST != null ? Number(pr.row.DIST) : null,
      distanceBucket: categorizeDistance(pr.row.DIST != null ? Number(pr.row.DIST) : null),
      hash: pr.row.HASH as string | null,
      quarter: pr.row.QTR != null ? Number(pr.row.QTR) : null,
      formation: pr.row['OFF FORM'] as string | null ?? null,
      personnel: pr.row.PERS as string | null ?? null,
      motion: pr.row.MOTION as string | null ?? null,
      odk: pr.row.ODK as string | null ?? null,
      playType: pr.row['PLAY TYPE'] as string | null ?? null,
      playDirection: pr.row['PLAY DIR'] as string | null ?? null,
      gainLoss: pr.row['GN/LS'] != null ? Number(pr.row['GN/LS']) : null,
      result: pr.row.RESULT as string | null ?? null,
      clipStartSeconds: pr.segment.start,
      clipEndSeconds: pr.segment.end,
      status: 'awaiting_clip' as const,
      rawCsvRow: pr.row as Record<string, unknown>,
    }));

    const insertedPlays = await withProgramContext(programId, async (tx) =>
      tx.insert(plays).values(playInserts).returning({ id: plays.id, playOrder: plays.playOrder }),
    );

    // Step 6: Split clips from the MP4 and upload to Blob
    log.info('splitting_clips', {
      playCount: insertedPlays.length,
      programId,
      filmUploadId: upload.id,
    });

    const clipResults = await splitAndUploadClips({
      mp4BlobUrl: mp4Blob.url,
      programId,
      gameId,
      plays: insertedPlays.map((p, i) => {
        const segment = reconciled.playRows[i]?.segment;
        if (!segment) throw new Error(`Missing segment for play ${i}`);
        return {
          playId: p.id,
          playOrder: p.playOrder,
          startSeconds: segment.start,
          endSeconds: segment.end,
        };
      }),
    });

    // Step 7: Update play rows with clip URLs
    await withProgramContext(programId, async (tx) => {
      for (const clip of clipResults) {
        await tx
          .update(plays)
          .set({
            clipBlobKey: clip.clipBlobUrl,
            status: 'ready',
            updatedAt: new Date(),
          })
          .where(eq(plays.id, clip.playId));
      }
    });

    // Mark upload as complete
    await withProgramContext(programId, async (tx) =>
      tx
        .update(filmUploads)
        .set({ status: 'ready', completedAt: new Date() })
        .where(eq(filmUploads.id, upload.id)),
    );

    span.done({
      filmUploadId: upload.id,
      playCount: insertedPlays.length,
      clipCount: clipResults.length,
      warnings: reconciled.warnings,
    });

    return Response.json({
      filmUploadId: upload.id,
      playCount: insertedPlays.length,
      clipCount: clipResults.length,
      warnings: reconciled.warnings,
    }, { status: 201 });
  } catch (error) {
    span.fail(error);

    if (uploadContext) {
      const failedUpload = uploadContext;
      await withProgramContext(failedUpload.programId, async (tx) =>
        tx
          .update(filmUploads)
          .set({
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : String(error),
          })
          .where(eq(filmUploads.id, failedUpload.filmUploadId)),
      ).catch((updateError) => {
        log.error('ingest_failed_to_mark_upload_failed', {
          filmUploadId: failedUpload.filmUploadId,
          error: updateError instanceof Error ? updateError.message : String(updateError),
        });
      });
    }

    if (error instanceof HudlReconciliationError) {
      return Response.json(
        {
          error: 'Hudl export reconciliation failed',
          message: error.userFacingMessage,
          details: error.details,
        },
        { status: 422 },
      );
    }
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    log.error('ingest_unexpected_error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return Response.json(
      { error: 'Ingestion failed. Please try again.' },
      { status: 500 },
    );
  }
}

/**
 * Categorize distance into buckets for tendency queries.
 * Standard football bucketing: short (1-3), medium (4-6), long (7+).
 */
function categorizeDistance(distance: number | null): string | null {
  if (distance == null) return null;
  if (distance <= 3) return 'short';
  if (distance <= 6) return 'medium';
  return 'long';
}

/**
 * GET /api/ingest?programId=X
 *
 * List all film uploads for a program with their processing status.
 * Coaches use this to see which films are uploaded / parsing / ready / failed.
 */
export async function GET(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/ingest', method: 'GET' }, req);
  try {
    const url = new URL(req.url);
    const programId = url.searchParams.get('programId');
    if (!programId) {
      return Response.json({ error: 'programId required' }, { status: 400 });
    }
    await requireCoachForProgram(programId);

    const uploads = await withProgramContext(programId, async (tx) =>
      tx
        .select({
          id: filmUploads.id,
          gameId: filmUploads.gameId,
          status: filmUploads.status,
          csvRowCount: filmUploads.csvRowCount,
          xmlSegmentCount: filmUploads.xmlSegmentCount,
          mp4DurationSeconds: filmUploads.mp4DurationSeconds,
          errorMessage: filmUploads.errorMessage,
          createdAt: filmUploads.createdAt,
          completedAt: filmUploads.completedAt,
        })
        .from(filmUploads)
        .where(eq(filmUploads.programId, programId))
        .orderBy(filmUploads.createdAt),
    );

    span.done({ count: uploads.length });
    return Response.json({ uploads });
  } catch (error) {
    span.fail(error);
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: 'Failed to fetch uploads' }, { status: 500 });
  }
}
