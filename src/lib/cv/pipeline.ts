/**
 * CV pipeline — orchestrates all vision tasks for a single play.
 *
 * Given a play's clip URL, this pipeline:
 *   1. Downloads the clip to a temp file
 *   2. Extracts key frames (pre-snap, snap, post-snap)
 *   3. Runs ensemble vision tasks for both offense and defense:
 *      - Coverage shell (defense)
 *      - Pressure type + source (defense)
 *      - Blocking scheme (offense)
 *      - Route concept (offense, pass plays only)
 *      - Run gap (offense, run plays only)
 *      - Player positions (both sides, all plays)
 *   4. Returns accepted results for DB write
 *
 * Each task runs the ensemble voting (two models, agree + threshold).
 * Tasks run in parallel where possible to minimize wall time.
 */

import { unlink } from 'node:fs/promises';
import { downloadClipToTemp, extractFrames } from './frame-extractor';
import { runEnsemble, type EnsembleResult } from './ensemble';
import {
  coverageShellSchema,
  COVERAGE_SHELL_SYSTEM_PROMPT_V1,
  pressureSchema,
  PRESSURE_SYSTEM_PROMPT_V1,
  blockingSchemeSchema,
  BLOCKING_SCHEME_SYSTEM_PROMPT_V1,
  routeConceptSchema,
  ROUTE_CONCEPT_SYSTEM_PROMPT_V1,
  runGapSchema,
  RUN_GAP_SYSTEM_PROMPT_V1,
  playerDetectionSchema,
  PLAYER_POSITIONS_SYSTEM_PROMPT_V1,
} from '@/lib/ai/schemas';
import type {
  CoverageShell,
  PressureTag,
  BlockingScheme,
  RouteConcept,
  RunGap,
  PlayerDetection,
} from '@/lib/ai/schemas';
import { log, beginSpan } from '@/lib/observability/log';

export interface CvPipelineInput {
  playId: string;
  clipBlobUrl: string;
  playType: string | null;
  programId: string;
}

export interface CvPipelineResult {
  playId: string;
  coverageShell: EnsembleResult<CoverageShell> | null;
  pressure: EnsembleResult<PressureTag> | null;
  blockingScheme: EnsembleResult<BlockingScheme> | null;
  routeConcept: EnsembleResult<RouteConcept> | null;
  runGap: EnsembleResult<RunGap> | null;
  playerPositions: EnsembleResult<PlayerDetection> | null;
}

/**
 * Run the full CV pipeline on a single play.
 */
export async function analyzePlay(input: CvPipelineInput): Promise<CvPipelineResult> {
  const span = beginSpan({
    worker: 'cv_pipeline',
    playId: input.playId,
    programId: input.programId,
  });

  let clipPath: string | null = null;

  try {
    // Step 1: Download clip
    clipPath = await downloadClipToTemp(input.clipBlobUrl);

    // Step 2: Extract frames
    const frames = await extractFrames(clipPath, 8); // assume ~8s clip

    if (frames.length === 0) {
      log.warn('cv_no_frames_extracted', { playId: input.playId });
      span.done({ result: 'no_frames' });
      return emptyResult(input.playId);
    }

    // Convert frames to base64 for the ensemble
    const base64Frames = frames.map((f) => ({
      type: f.type,
      base64: f.buffer.toString('base64'),
    }));

    const preSnapFrames = base64Frames.filter((f) => f.type === 'pre_snap');
    const snapFrames = base64Frames.filter((f) => f.type === 'snap');
    const postSnapFrames = base64Frames.filter((f) => f.type === 'post_snap');
    const preAndPostFrames = [...preSnapFrames, ...postSnapFrames];

    // Determine which offensive tasks to run based on play type
    const isRunPlay = input.playType?.toLowerCase().includes('run');
    const isPassPlay = input.playType?.toLowerCase().includes('pass');

    // Step 3: Run all vision tasks in parallel
    const [
      coverageShell,
      pressure,
      blockingScheme,
      routeConcept,
      runGap,
      playerPositions,
    ] = await Promise.all([
      // Defense: coverage shell (needs pre-snap + post-snap)
      preAndPostFrames.length >= 2
        ? runEnsemble<CoverageShell>({
            taskName: 'coverage_shell',
            systemPrompt: COVERAGE_SHELL_SYSTEM_PROMPT_V1,
            frames: preAndPostFrames,
            schema: coverageShellSchema,
            context: 'Frame 1 is pre-snap alignment. Frame 2 is ~1 second post-snap.',
          })
        : Promise.resolve(null),

      // Defense: pressure type + source (needs snap frame)
      snapFrames.length > 0 || postSnapFrames.length > 0
        ? runEnsemble<PressureTag>({
            taskName: 'pressure',
            systemPrompt: PRESSURE_SYSTEM_PROMPT_V1,
            frames: snapFrames.length > 0 ? snapFrames : postSnapFrames,
            schema: pressureSchema,
            context: 'This frame is from the moment of/just after the snap.',
          })
        : Promise.resolve(null),

      // Offense: blocking scheme (needs snap/post-snap frame)
      postSnapFrames.length > 0
        ? runEnsemble<BlockingScheme>({
            taskName: 'blocking_scheme',
            systemPrompt: BLOCKING_SCHEME_SYSTEM_PROMPT_V1,
            frames: postSnapFrames,
            schema: blockingSchemeSchema,
            context: 'This frame is ~0.5-1 seconds after the snap.',
          })
        : Promise.resolve(null),

      // Offense: route concept (pass plays only)
      isPassPlay && postSnapFrames.length > 0
        ? runEnsemble<RouteConcept>({
            taskName: 'route_concept',
            systemPrompt: ROUTE_CONCEPT_SYSTEM_PROMPT_V1,
            frames: postSnapFrames,
            schema: routeConceptSchema,
            context: 'This frame is from a passing play, ~1-2 seconds after the snap.',
          })
        : Promise.resolve(null),

      // Offense: run gap (run plays only)
      isRunPlay && postSnapFrames.length > 0
        ? runEnsemble<RunGap>({
            taskName: 'run_gap',
            systemPrompt: RUN_GAP_SYSTEM_PROMPT_V1,
            frames: postSnapFrames,
            schema: runGapSchema,
            context: 'This frame is from a run play.',
          })
        : Promise.resolve(null),

      // Both: player positions (pre-snap frame — most useful)
      preSnapFrames.length > 0
        ? runEnsemble<PlayerDetection>({
            taskName: 'player_positions',
            systemPrompt: PLAYER_POSITIONS_SYSTEM_PROMPT_V1,
            frames: preSnapFrames,
            schema: playerDetectionSchema,
            context: 'This is a pre-snap frame showing both teams aligned before the snap.',
          })
        : Promise.resolve(null),
    ]);

    const result: CvPipelineResult = {
      playId: input.playId,
      coverageShell,
      pressure,
      blockingScheme,
      routeConcept,
      runGap,
      playerPositions,
    };

    // Log summary
    const accepted = [
      coverageShell?.accepted,
      pressure?.accepted,
      blockingScheme?.accepted,
      routeConcept?.accepted,
      runGap?.accepted,
      playerPositions?.accepted,
    ].filter(Boolean).length;

    const total = [
      coverageShell,
      pressure,
      blockingScheme,
      routeConcept,
      runGap,
      playerPositions,
    ].filter(Boolean).length;

    span.done({ accepted, total, playId: input.playId });

    return result;
  } catch (error) {
    span.fail(error, { playId: input.playId });
    return emptyResult(input.playId);
  } finally {
    if (clipPath) {
      await unlink(clipPath).catch(() => {});
    }
  }
}

function emptyResult(playId: string): CvPipelineResult {
  return {
    playId,
    coverageShell: null,
    pressure: null,
    blockingScheme: null,
    routeConcept: null,
    runGap: null,
    playerPositions: null,
  };
}
