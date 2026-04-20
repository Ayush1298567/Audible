/**
 * POST /api/cv — trigger CV analysis on a game's plays.
 *
 * Accepts: { programId, gameId }
 * Runs the CV pipeline on each ready play that hasn't been analyzed yet.
 * Phase 2 MVP: runs sequentially. Phase 4.5+ will use Vercel Queues.
 *
 * This is the endpoint the Film Room calls after an upload completes
 * (or the coach can trigger it manually from the Scouting Hub).
 */

import { eq, and } from 'drizzle-orm';
import { withProgramContext } from '@/lib/db/client';
import { plays, cvTags, playerDetections } from '@/lib/db/schema';
import { analyzePlay } from '@/lib/cv';
import { beginSpan, log } from '@/lib/observability/log';
import { z } from 'zod';
import { AuthError, requireCoachRoleForProgram } from '@/lib/auth/guards';
import { getActivePromptIds, type PromptTaskName } from '@/lib/prompts/active-prompts';

export const maxDuration = 60;

const requestSchema = z.object({
  programId: z.string().uuid(),
  gameId: z.string().uuid(),
});

const PROMPT_TASKS: PromptTaskName[] = [
  'coverage_shell',
  'pressure',
  'blocking_scheme',
  'route_concept',
  'run_gap',
  'player_positions',
  'coverage_disguise',
  'alignment_depth',
];

export async function POST(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/cv' }, req);

  try {
    const body = await req.json();
    const { programId, gameId } = requestSchema.parse(body);
    await requireCoachRoleForProgram('coordinator', programId);

    const promptIds = await getActivePromptIds(PROMPT_TASKS);
    for (const name of PROMPT_TASKS) {
      if (!promptIds[name]) {
        log.error('cv_missing_active_prompt', { name });
        return Response.json(
          { error: `Missing active prompt row for ${name}. Run DB migrations or seed prompts.` },
          { status: 503 },
        );
      }
    }
    const P = promptIds as Record<PromptTaskName, string>;

    // Get all ready plays for this game that haven't been CV-analyzed
    const gamePlays = await withProgramContext(programId, async (tx) =>
      tx
        .select({
          id: plays.id,
          clipBlobKey: plays.clipBlobKey,
          playType: plays.playType,
          status: plays.status,
        })
        .from(plays)
        .where(
          and(
            eq(plays.programId, programId),
            eq(plays.gameId, gameId),
            eq(plays.status, 'ready'),
          ),
        )
        .orderBy(plays.playOrder),
    );

    log.info('cv_analysis_starting', {
      programId,
      gameId,
      playCount: gamePlays.length,
    });

    let analyzed = 0;
    let accepted = 0;

    for (const play of gamePlays) {
      if (!play.clipBlobKey) continue;

      const result = await analyzePlay({
        playId: play.id,
        clipBlobUrl: play.clipBlobKey,
        playType: play.playType,
        programId,
      });

      // Write accepted CV tags to the database
      await withProgramContext(programId, async (tx) => {
        const tagInserts = [];

        if (result.coverageShell?.accepted && result.coverageShell.value) {
          tagInserts.push({
            programId,
            playId: play.id,
            tagType: 'coverage_shell' as const,
            value: result.coverageShell.value,
            promptId: P.coverage_shell,
            anthropicConfidence: result.coverageShell.anthropicConfidence,
            openaiConfidence: result.coverageShell.openaiConfidence,
            ensembleConfidence: result.coverageShell.ensembleConfidence,
            modelsAgreed: result.coverageShell.agreed,
            isSurfaced: true,
          });
        }

        if (result.pressure?.accepted && result.pressure.value) {
          tagInserts.push({
            programId,
            playId: play.id,
            tagType: 'pressure_type' as const,
            value: result.pressure.value,
            promptId: P.pressure,
            anthropicConfidence: result.pressure.anthropicConfidence,
            openaiConfidence: result.pressure.openaiConfidence,
            ensembleConfidence: result.pressure.ensembleConfidence,
            modelsAgreed: result.pressure.agreed,
            isSurfaced: true,
          });
        }

        if (result.coverageDisguise?.accepted && result.coverageDisguise.value) {
          tagInserts.push({
            programId,
            playId: play.id,
            tagType: 'coverage_disguise' as const,
            value: result.coverageDisguise.value,
            promptId: P.coverage_disguise,
            anthropicConfidence: result.coverageDisguise.anthropicConfidence,
            openaiConfidence: result.coverageDisguise.openaiConfidence,
            ensembleConfidence: result.coverageDisguise.ensembleConfidence,
            modelsAgreed: result.coverageDisguise.agreed,
            isSurfaced: true,
          });
        }

        if (result.alignmentDepth?.accepted && result.alignmentDepth.value) {
          const v = result.alignmentDepth.value;
          tagInserts.push({
            programId,
            playId: play.id,
            tagType: 'cushion_depth_cb' as const,
            value: { yards: v.cbCushionYards },
            promptId: P.alignment_depth,
            anthropicConfidence: result.alignmentDepth.anthropicConfidence,
            openaiConfidence: result.alignmentDepth.openaiConfidence,
            ensembleConfidence: result.alignmentDepth.ensembleConfidence,
            modelsAgreed: result.alignmentDepth.agreed,
            isSurfaced: true,
          });
          tagInserts.push({
            programId,
            playId: play.id,
            tagType: 'safety_depth' as const,
            value: { yards: v.safetyDepthYards },
            promptId: P.alignment_depth,
            anthropicConfidence: result.alignmentDepth.anthropicConfidence,
            openaiConfidence: result.alignmentDepth.openaiConfidence,
            ensembleConfidence: result.alignmentDepth.ensembleConfidence,
            modelsAgreed: result.alignmentDepth.agreed,
            isSurfaced: true,
          });
        }

        if (result.blockingScheme?.accepted && result.blockingScheme.value) {
          tagInserts.push({
            programId,
            playId: play.id,
            tagType: 'blocking_scheme' as const,
            value: result.blockingScheme.value,
            promptId: P.blocking_scheme,
            anthropicConfidence: result.blockingScheme.anthropicConfidence,
            openaiConfidence: result.blockingScheme.openaiConfidence,
            ensembleConfidence: result.blockingScheme.ensembleConfidence,
            modelsAgreed: result.blockingScheme.agreed,
            isSurfaced: true,
          });
        }

        if (result.routeConcept?.accepted && result.routeConcept.value) {
          tagInserts.push({
            programId,
            playId: play.id,
            tagType: 'route_concept' as const,
            value: result.routeConcept.value,
            promptId: P.route_concept,
            anthropicConfidence: result.routeConcept.anthropicConfidence,
            openaiConfidence: result.routeConcept.openaiConfidence,
            ensembleConfidence: result.routeConcept.ensembleConfidence,
            modelsAgreed: result.routeConcept.agreed,
            isSurfaced: true,
          });
        }

        if (result.runGap?.accepted && result.runGap.value) {
          tagInserts.push({
            programId,
            playId: play.id,
            tagType: 'run_gap' as const,
            value: result.runGap.value,
            promptId: P.run_gap,
            anthropicConfidence: result.runGap.anthropicConfidence,
            openaiConfidence: result.runGap.openaiConfidence,
            ensembleConfidence: result.runGap.ensembleConfidence,
            modelsAgreed: result.runGap.agreed,
            isSurfaced: true,
          });
        }

        if (tagInserts.length > 0) {
          await tx.insert(cvTags).values(tagInserts);
          accepted += tagInserts.length;
        }

        // Write player detections if accepted
        if (result.playerPositions?.accepted && result.playerPositions.value) {
          const detectionInserts = result.playerPositions.value.players.map((p) => ({
            programId,
            playId: play.id,
            frameType: 'pre_snap' as const,
            team: p.team === 'unknown' ? 'offense' : p.team,
            jerseyNumber: p.jerseyNumber,
            positionEstimate: p.positionEstimate === 'unknown' ? null : p.positionEstimate,
            xYards: p.xYards,
            yYards: p.yYards,
            depthYards: p.depthYards,
            alignmentNotes: p.alignmentNotes,
            promptId: P.player_positions,
            ensembleConfidence: result.playerPositions?.ensembleConfidence ?? 0,
          }));

          if (detectionInserts.length > 0) {
            await tx.insert(playerDetections).values(detectionInserts);
          }
        }
      });

      analyzed++;
    }

    span.done({ analyzed, accepted, gameId });

    return Response.json({
      analyzed,
      accepted,
      message: `Analyzed ${analyzed} plays, ${accepted} tags accepted.`,
    });
  } catch (error) {
    span.fail(error);
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof z.ZodError) {
      return Response.json({ error: 'Validation failed', details: error.issues }, { status: 400 });
    }
    return Response.json({ error: 'CV analysis failed' }, { status: 500 });
  }
}
