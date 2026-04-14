import { gateway, generateText, Output } from 'ai';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  aggregateByPlayType,
  aggregateMatchupsByDefender,
  aggregateMatchupsByOffense,
  aggregateMotionTendencies,
  aggregatePersonnelTendencies,
  aggregateQuarterTendencies,
  aggregateRouteVsCoverage,
  computeSituationalTendencies,
  extractExplosivePlays,
  type PlayAnalytics,
} from '@/lib/cv/track-analytics';
import { reconcileMatchupJerseyRoles } from '@/lib/cv/track-consistency';
import { withProgramContext } from '@/lib/db/client';
import { games, opponents, plays } from '@/lib/db/schema';
import { beginSpan } from '@/lib/observability/log';
import { buildCallSheet } from '@/lib/scouting/call-sheet';
import type { InsightExample, Walkthrough } from '@/lib/scouting/insights';
import { buildAnalyticsHeader } from '@/lib/scouting/prompt-headers';

export const maxDuration = 180;

/**
 * POST /api/scouting-walkthrough
 *
 * Given all the analyzed plays for an opponent, ask Claude to surface
 * the 3-5 most exploitable tendencies + pick example clips + craft
 * the narrative that will guide the coach through the walkthrough.
 */

const requestSchema = z.object({
  programId: z.string().uuid(),
  opponentId: z.string().uuid(),
  /**
   * Optional: scope the walkthrough to a single game (e.g. "their most
   * recent game vs Central"). When omitted, aggregates across every
   * game we have film for against this opponent.
   */
  gameId: z.string().uuid().optional(),
});

// The schema Claude returns. We'll map to the front-end Walkthrough type.
const curatedInsightSchema = z.object({
  headline: z.string().max(60).describe('Short headline in CAPS, max 6 words'),
  narrative: z.string().min(40).max(400).describe('2-3 sentences explaining the tendency'),
  evidence_play_ids: z
    .array(z.string())
    .min(1)
    .max(5)
    .describe('Play IDs that best demonstrate this. 1-5 clips.'),
  recommendations: z
    .array(
      z.object({
        situation: z
          .string()
          .max(80)
          .describe(
            'When to use this — e.g. "3rd & long vs Cover 3 rotation", ' +
              '"red zone, 11 personnel", "when they motion jet right". ' +
              'Should mirror tendency triggers the coach can recognize live.',
          ),
        call: z
          .string()
          .min(3)
          .max(80)
          .describe(
            'The concrete play-call the coach would yell — "Mesh vs Rt Trips", ' +
              '"Power Read with a wheel tag", "Cover 1 Robber". Must be a name ' +
              'a football coach would recognize.',
          ),
        rationale: z
          .string()
          .min(10)
          .max(200)
          .describe(
            'One sentence: why this works against that situation, ideally ' +
              'citing a measurement ("beats the 60% Cover 3 rotation", ' +
              '"exploits CB #24 giving up 3.2yd avg sep").',
          ),
      }),
    )
    .min(1)
    .max(4)
    .describe(
      'Structured play recommendations: each has a situation trigger, ' +
        'a concrete call, and a rationale grounded in the CV data.',
    ),
  overlays_per_play: z
    .record(
      z.string(),
      z.array(
        z.object({
          timestamp: z.number().describe('Seconds from clip start'),
          duration: z.number().optional(),
          type: z.enum(['circle', 'arrow', 'label', 'zone']),
          x: z.number().min(0).max(1),
          y: z.number().min(0).max(1),
          toX: z.number().min(0).max(1).optional(),
          toY: z.number().min(0).max(1).optional(),
          radius: z.number().min(0).max(1).optional(),
          label: z.string().max(30).optional(),
          color: z.string().optional(),
        }),
      ),
    )
    .describe('Per-play overlays, keyed by play ID'),
  highlight_tracks_per_play: z
    .record(z.string(), z.array(z.string()).max(4))
    .optional()
    .describe(
      'Per-play track IDs Claude wants visually highlighted as the coach watches ' +
        '— usually the WR/CB/S pair from the key matchup. Max 4 per play.',
    ),
});

const responseSchema = z.object({
  summary: z.string().min(40).max(400),
  insights: z.array(curatedInsightSchema).min(1).max(5),
});

const SYSTEM_PROMPT = `You are an expert football quality control coach. Given analyzed
plays from an opponent, identify the 3-5 most EXPLOITABLE tendencies a coach should
attack in this week's game plan.

Rules:
1. Every tendency must be SPECIFIC enough to call a play against. NOT "they run Cover 2" —
   instead "they run Cover 2 on 3rd & long with the free safety widening post-snap".
2. Every tendency needs evidence: at least 3 plays showing the pattern.
3. Recommendations are STRUCTURED: each has a situation, a call, and a
   rationale.
   - situation: when this fires ("3rd & long vs Cover 3 rotation")
   - call: the concrete play-call a coach would yell ("Mesh vs Trips Rt",
     "Power Read with a wheel tag", "Cover 1 Robber")
   - rationale: one sentence grounding in the data ("beats their 60% Cover
     3 rotation on 3rd & long — they give up 11yd avg on Mesh in film")
   Every recommendation's rationale should cite a concrete number from the
   headers when possible. Generic rationales are failure.
4. Rank by exploitability — #1 should be the biggest edge.
5. For each evidence play, provide 1-4 visual overlays that highlight the key
   moment(s). Normalized 0-1 coords:
   - Circle around a key player (WR, safety, LB) at a specific timestamp
   - Arrow showing motion or route direction
   - Label callout like "Safety widens" at t=1.2s
   - Zone rectangle over an open area
6. USE THE MATCHUP DATA. When a play includes a "matchups" field, that's the
   CV-derived answer to "who got open and against whom." When you cite a
   tendency, prefer citing the exact matchup — "their CB #24 gave up 3.2 yds
   of separation on slants" beats "they give up separation on slants".
7. USE THE DEFENDER-TENDENCIES HEADER, BUT RESPECT THE TRUST TIER.
   Each row carries [trust=high|medium|low, conf=X.XX]. These come from
   real CV-pipeline confidence scores (track quality × role inference ×
   jersey OCR), and they MUST guide what you cite:
   - trust=high: cite this defender by name in your narrative + recommendations.
   - trust=medium: mention as a recurring pattern, e.g. "their boundary CB
     gives up separation"; do NOT name a specific jersey number.
   - trust=low: ignore. Do not cite even as a pattern. The data is too
     noisy to call a tendency.
   - "jersey unreadable" rows: NEVER cite as a specific player. They're
     pattern signals, not player IDs.
   The OFFENSIVE-PLAYMAKERS block mirrors this with the same trust rules.
   Citing a player by name when trust < high is a HALLUCINATION; the coach
   will lose faith in the system the moment a #24 they don't have on the
   roster shows up in a recommendation.
8. For each evidence play, populate highlight_tracks_per_play with the
   track IDs the coach should watch — typically the offense/defense pair
   from the key matchup (trackIds in the matchups array). This is what
   visually lights up on the clip as the coach watches.
9. USE THE SITUATIONAL HEADER. The down & distance rollups tell you
   what they DO in a given situation — run/pass mix, dominant coverage,
   post-snap rotation rate. Look for extremes: 80%+ run/pass tilts,
   40%+ rotation rates, or strong coverage tendencies by down. Tie
   these to concrete calls ("on 3rd & long they rotate to Cover 3 60%
   of the time — call post-wheel with a late-over tag").
10. USE THE ROUTE×COVERAGE HEATMAP. It tells you which concepts have
    historically BEAT which coverages in this opponent's film. If Mesh
    vs Cover 3 averaged 11 yds across 4 samples, that's a core Friday
    call — make it a recommendation. If Four Verts vs Cover 2 averaged
    -1 yd, DON'T recommend it.
11. USE THE PERSONNEL HEADER. Personnel is VISIBLE pre-snap (count TEs
    and RBs on the field). If they run 75% out of 12 personnel, tell
    the coach "load the box when 12 comes on." If they pass 80% out of
    11 personnel, tell the coach "expect pass — bring nickel." This is
    the defense's play-calling tell every down.
12. USE THE MOTION-TELLS HEADER. Pre-snap motion is a live football
    signal the defense can READ and react to in real time. "Jet motion
    right → run jet right 70%" is a tell the coach tells LBs "match
    jet." Flag any motion-to-direction pattern ≥60% as a bullet the
    coach should coach during the week.
13. USE THE EXPLOSIVE-PLAYS BLOCK. These are the single biggest
    outliers — gains ≥15 yds and losses ≤-7 yds — with their play IDs.
    Explosives are great evidence clips. If an explosive matches a
    tendency you've identified (right coverage, right motion, right
    personnel), cite it by play ID as evidence. Tendencies that lack
    any explosive backing are weaker narratives.

14. NEVER FABRICATE NUMBERS OR PLAYERS. This is the most important rule.
    - Every measurement you cite (yards, percentages, jersey numbers,
      separation, speed) MUST appear verbatim in the headers or per-play
      JSON above. If you can't point to its source, don't cite it.
    - Every play ID in evidence_play_ids MUST appear in the per-play JSON.
      Inventing IDs invalidates the whole walkthrough.
    - If a tendency is supported by 2 plays only, say "2 plays" — don't
      round up to "consistently."
    - When the data doesn't support a strong claim, return FEWER insights.
      Three honest insights are infinitely more valuable than five with
      one hallucinated detail.

Be ruthless. Don't pad the list. 3 great insights beat 5 mediocre ones.
A SINGLE fabricated number ruins the whole walkthrough's credibility.`;

export async function POST(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/scouting-walkthrough', method: 'POST' }, req);

  try {
    const body = await req.json();
    const input = requestSchema.parse(body);

    // Load opponent info
    const [opp] = await withProgramContext(input.programId, async (tx) =>
      tx
        .select({ id: opponents.id, name: opponents.name })
        .from(opponents)
        .where(and(eq(opponents.id, input.opponentId), eq(opponents.programId, input.programId))),
    );

    if (!opp) {
      return Response.json({ error: 'Opponent not found' }, { status: 404 });
    }

    // Load all analyzed plays for this opponent
    const allPlays = await withProgramContext(input.programId, async (tx) =>
      tx
        .select({
          id: plays.id,
          gameId: plays.gameId,
          down: plays.down,
          distance: plays.distance,
          quarter: plays.quarter,
          formation: plays.formation,
          personnel: plays.personnel,
          motion: plays.motion,
          playType: plays.playType,
          playDirection: plays.playDirection,
          gainLoss: plays.gainLoss,
          result: plays.result,
          clipBlobKey: plays.clipBlobKey,
          coachOverride: plays.coachOverride,
        })
        .from(plays)
        .innerJoin(games, eq(plays.gameId, games.id))
        .where(
          and(
            eq(plays.programId, input.programId),
            eq(games.opponentId, input.opponentId),
            eq(plays.status, 'ready'),
            // When gameId is provided, scope to that single game's film.
            ...(input.gameId ? [eq(plays.gameId, input.gameId)] : []),
          ),
        ),
    );

    if (allPlays.length === 0) {
      return Response.json(
        {
          error: input.gameId
            ? 'No plays analyzed for this game yet'
            : 'No plays analyzed for this opponent yet',
        },
        { status: 400 },
      );
    }

    // Parse analytics JSON from coachOverride once per play (we reuse this for
    // both the per-play prompt payload and the aggregate summary).
    const parsedAnalytics = allPlays.map((p) => {
      const raw = (p.coachOverride as { analytics?: string | unknown })?.analytics;
      if (typeof raw === 'string') {
        try {
          return JSON.parse(raw) as PlayAnalytics;
        } catch {
          return null;
        }
      }
      return raw ? (raw as PlayAnalytics) : null;
    });

    // Explosive plays: the biggest single outliers (gains + losses).
    // Computed early so the prompt-cap logic can guarantee they're included.
    const explosives = extractExplosivePlays(
      allPlays.map((p) => ({
        id: p.id,
        down: p.down,
        distance: p.distance,
        quarter: p.quarter,
        formation: p.formation,
        playType: p.playType,
        playDirection: p.playDirection,
        gainLoss: p.gainLoss,
        result: p.result,
        coverage: (p.coachOverride as { aiCoverage?: string })?.aiCoverage,
        route: (p.coachOverride as { aiRouteConcept?: string })?.aiRouteConcept,
      })),
    );

    // Prompt budget guard: on games with lots of plays we send only the most
    // informative ones as per-play JSON. Everything still contributes to the
    // aggregated headers — those scale O(1) in the prompt regardless of play
    // count.
    const PROMPT_PLAY_CAP = 80;

    // Score each play on "would this be useful evidence for an insight?" —
    // 3rd downs, explosive plays, plays with matchup data, and unusual results
    // score higher. Ties broken by play order (newer first).
    const playScores = allPlays.map((p, idx) => {
      let score = 0;
      if (p.down === 3 || p.down === 4) score += 3; // money downs
      if (typeof p.gainLoss === 'number' && Math.abs(p.gainLoss) >= 15) score += 3; // explosives
      if (parsedAnalytics[idx]?.keyMatchups?.length) score += 2;
      if (parsedAnalytics[idx]?.fieldSpace) score += 1;
      if (p.motion && !/^none$/i.test(p.motion)) score += 1;
      // Penalty plays and extreme losses are teachable moments too
      if (typeof p.gainLoss === 'number' && p.gainLoss <= -5) score += 2;
      return { idx, score };
    });

    // Force-include every explosive play (those blurbs reference playIds that
    // MUST exist in the JSON so Claude can cite them as evidence).
    const explosiveIds = new Set(explosives.map((e) => e.playId));

    const keptIndices = allPlays.length <= PROMPT_PLAY_CAP
      ? allPlays.map((_, i) => i)
      : (() => {
          const forced = allPlays
            .map((p, i) => (explosiveIds.has(p.id) ? i : -1))
            .filter((i) => i >= 0);
          const forcedSet = new Set(forced);
          const topByScore = playScores
            .filter((p) => !forcedSet.has(p.idx))
            .sort((a, b) => (b.score - a.score) || (b.idx - a.idx))
            .slice(0, Math.max(0, PROMPT_PLAY_CAP - forced.length))
            .map((p) => p.idx);
          return [...forced, ...topByScore].sort((a, b) => a - b);
        })();

    const keptSet = new Set(keptIndices);

    // Serialize plays for Claude — include per-play peak speed, depth, duration
    // ONLY when field-space tracking is available. Pixel-space values would
    // mislead Claude into citing fake measurements.
    const playsForPrompt = allPlays.map((p, idx) => {
      if (!keptSet.has(idx)) return null;
      // Return actual payload below
      const a = parsedAnalytics[idx];
      const isFieldSpace = a?.fieldSpace === true;
      const deepest = isFieldSpace
        ? a?.tracks.find((t) => t.trackId === a.deepestTrackId)
        : undefined;
      return {
        id: p.id,
        down: p.down,
        distance: p.distance,
        quarter: p.quarter,
        formation: p.formation,
        playType: p.playType,
        direction: p.playDirection,
        yards: p.gainLoss,
        result: p.result,
        coverage: (p.coachOverride as { aiCoverage?: string })?.aiCoverage,
        front: (p.coachOverride as { aiDefensiveFront?: string })?.aiDefensiveFront,
        pressure: (p.coachOverride as { aiPressure?: string })?.aiPressure,
        route: (p.coachOverride as { aiRouteConcept?: string })?.aiRouteConcept,
        gap: (p.coachOverride as { aiRunGap?: string })?.aiRunGap,
        observations: (p.coachOverride as { aiObservations?: string })?.aiObservations,
        // CV-derived measurements — only set when the clip was field-calibrated
        peakSpeedYps:
          isFieldSpace && a && a.peakSpeedYps > 0 ? Number(a.peakSpeedYps.toFixed(1)) : undefined,
        playDurationSec:
          a?.playDurationSeconds && a.playDurationSeconds > 0
            ? Number(a.playDurationSeconds.toFixed(1))
            : undefined,
        maxDepthYards:
          deepest?.maxDepthYards !== undefined
            ? Number(deepest.maxDepthYards.toFixed(1))
            : undefined,
        // Matchups: the football-meaningful pairings — WR/TE/RB vs their
        // nearest defender — with separation + closing speed. This is
        // where tendencies actually live.
        matchups: isFieldSpace && a?.keyMatchups?.length
          ? a.keyMatchups.map((m) => ({
              trackIds: [m.offense.trackId, m.defense.trackId],
              off: `${m.offense.role}${m.offense.jersey ? ` #${m.offense.jersey}` : ''}`,
              def: `${m.defense.role}${m.defense.jersey ? ` #${m.defense.jersey}` : ''}`,
              sepYds: m.minSeparationYards,
              closingYps: m.closingYps,
              offMaxYps: m.offenseMaxSpeedYps,
            }))
          : undefined,
      };
    }).filter((x): x is NonNullable<typeof x> => x !== null);

    // Aggregate CV analytics across plays for the "here's the data the coach
    // should know" header Claude sees before the raw play list.
    const aggregated = aggregateByPlayType(
      allPlays.map((p, idx) => ({
        playType: p.playType,
        analytics: parsedAnalytics[idx] ?? null,
      })),
    );

    // (explosives already computed above, before the prompt-cap logic.)

    // Quarter tendencies: how does their play-calling shift by quarter?
    const quarterTendencies = aggregateQuarterTendencies(
      allPlays.map((p) => ({
        quarter: p.quarter,
        playType: p.playType,
        gainLoss: p.gainLoss,
      })),
    );

    // Motion tendencies: pre-snap motion → play direction / type tells.
    const motionTendencies = aggregateMotionTendencies(
      allPlays.map((p) => ({
        motion: p.motion,
        playType: p.playType,
        playDirection: p.playDirection,
        gainLoss: p.gainLoss,
      })),
    );

    // Personnel tendencies: what do they do out of 11/12/21 etc.?
    const personnelTendencies = aggregatePersonnelTendencies(
      allPlays.map((p) => ({
        personnel: p.personnel,
        formation: p.formation,
        playType: p.playType,
        gainLoss: p.gainLoss,
      })),
    );

    // Route concept × coverage: which concepts beat which shells?
    const routeVsCoverage = aggregateRouteVsCoverage(
      allPlays.map((p) => ({
        playType: p.playType,
        route: (p.coachOverride as { aiRouteConcept?: string })?.aiRouteConcept,
        coverage: (p.coachOverride as { aiCoverage?: string })?.aiCoverage,
        gainLoss: p.gainLoss,
      })),
    );

    // Situational tendencies: how do they play by down & distance?
    const situations = computeSituationalTendencies(
      allPlays.map((p) => ({
        down: p.down,
        distance: p.distance,
        playType: p.playType,
        gainLoss: p.gainLoss,
        coverage: (p.coachOverride as { aiCoverage?: string })?.aiCoverage,
        preSnapRead: (p.coachOverride as { aiPreSnapRead?: string })?.aiPreSnapRead,
        pressure: (p.coachOverride as { aiPressure?: string })?.aiPressure,
      })),
    );

    // Cross-play jersey↔role consistency pass. If a jersey shows up with
    // conflicting roles across plays (e.g. #88 as WR in 5 plays and CB
    // in 1), the minority instance is almost certainly an OCR or role-
    // inference mistake. Zero those matchups' confidence so the
    // aggregator drops them instead of letting them pollute a "CB #88"
    // bucket that's really a single fluke.
    const reconciled = reconcileMatchupJerseyRoles(parsedAnalytics);
    if (reconciled.inconsistencies.length > 0) {
      console.log('walkthrough_jersey_role_reconciled', {
        inconsistencies: reconciled.inconsistencies,
      });
    }

    // Roll up every matchup by the defender's jersey+role so we can point
    // Claude at specific exploitable defenders instead of just "the corner".
    // gameId flows into the aggregators so tendencies get demoted when
    // they only show up in one of several games.
    const matchupAnalyticsInput = allPlays.map((p, idx) => ({
      analytics: reconciled.analytics[idx] ?? null,
      gameId: p.gameId,
    }));
    const defenderTendencies = aggregateMatchupsByDefender(matchupAnalyticsInput);
    const offenseTendencies = aggregateMatchupsByOffense(matchupAnalyticsInput);

    // All header rendering lives in the pure prompt-headers module so
    // it's testable without dragging in the DB client.
    const analyticsHeader = buildAnalyticsHeader({
      aggregated,
      defenders: defenderTendencies,
      offense: offenseTendencies,
      personnel: personnelTendencies,
      motions: motionTendencies,
      quarters: quarterTendencies,
      explosives,
      routeVsCoverage,
      situations,
    });

    // Ask Claude to curate the walkthrough
    const { output } = await generateText({
      model: gateway('anthropic/claude-sonnet-4.6'),
      system: SYSTEM_PROMPT,
      prompt: `Opponent: ${opp.name}\nScope: ${input.gameId ? 'single game (scouting their most recent look)' : 'every game we have film for'}\nTotal plays analyzed: ${allPlays.length}${allPlays.length > playsForPrompt.length ? ` (showing top ${playsForPrompt.length} most informative below — aggregated headers above cover all ${allPlays.length})` : ''}${analyticsHeader}\n\nPlay data (JSON, with per-play CV measurements where available):\n${JSON.stringify(playsForPrompt, null, 2)}\n\nIdentify the 3-5 most exploitable tendencies. Cite CV measurements (peakSpeedYps, maxDepthYards, playDurationSec) in your narrative when they sharpen the insight. For each tendency, pick 2-3 evidence play IDs and provide visual overlays.`,
      output: Output.object({ schema: responseSchema }),
    });

    if (!output) {
      throw new Error('Claude returned no output');
    }

    // Hallucination guards — Claude is told not to fabricate, but the only
    // way to actually enforce that is to validate every claim it makes
    // against the data we provided. An insight that cites a play we never
    // sent, or names a jersey that wasn't in the trusted defender/offense
    // headers, gets dropped entirely. Better to ship 2 grounded insights
    // than 5 with one made-up player.
    const validPlayIds = new Set(playsForPrompt.map((p) => p.id));
    const namedPlayers = new Set<string>();
    for (const d of defenderTendencies) {
      if (d.trust === 'high' && d.jersey) namedPlayers.add(`${d.role}#${d.jersey}`);
    }
    for (const o of offenseTendencies) {
      if (o.trust === 'high' && o.jersey) namedPlayers.add(`${o.role}#${o.jersey}`);
    }

    const validatedInsights = output.insights.filter((ins) => {
      // Drop insights whose evidence references unknown play IDs
      const allEvidenceValid = ins.evidence_play_ids.every((id) => validPlayIds.has(id));
      if (!allEvidenceValid) {
        console.warn('walkthrough_dropped_hallucinated_play', {
          headline: ins.headline,
          ids: ins.evidence_play_ids,
        });
        return false;
      }

      // Detect "ROLE #NN" mentions in narrative or recommendations
      const text = `${ins.narrative} ${ins.recommendations.map((r) => `${r.situation} ${r.call} ${r.rationale}`).join(' ')}`;
      const playerRefs = text.matchAll(/\b(QB|RB|WR|TE|OL|DL|LB|CB|S)\s*#?(\d{1,2})\b/g);
      for (const m of playerRefs) {
        const role = m[1];
        const jersey = m[2];
        if (!namedPlayers.has(`${role}#${jersey}`)) {
          console.warn('walkthrough_dropped_unverified_player_reference', {
            headline: ins.headline,
            playerRef: `${role} #${jersey}`,
          });
          return false;
        }
      }

      return true;
    });

    if (validatedInsights.length === 0) {
      throw new Error(
        'Walkthrough produced no verifiable insights — every candidate either ' +
          'referenced unknown play IDs or named players the trust pipeline ' +
          'did not validate. Re-run with more film if this opponent has ≤5 plays.',
      );
    }

    output.insights = validatedInsights;

    // Build the walkthrough shape the front end expects
    const playMap = new Map(allPlays.map((p) => [p.id, p]));

    const walkthrough: Walkthrough = {
      opponentId: opp.id,
      opponentName: opp.name,
      playsAnalyzed: allPlays.length,
      summary: output.summary,
      generatedAt: new Date().toISOString(),
      insights: output.insights.map((ins, i) => ({
        id: slugify(ins.headline),
        rank: i + 1,
        headline: ins.headline,
        narrative: ins.narrative,
        evidenceCount: ins.evidence_play_ids.length,
        recommendations: ins.recommendations,
        examples: ins.evidence_play_ids
          .map((pid) => {
            const p = playMap.get(pid);
            if (!p?.clipBlobKey) return null;
            // Extract tracks from coachOverride JSON if present
            let tracks: InsightExample['tracks'];
            const rawTracks = (p.coachOverride as { tracks?: string | unknown })?.tracks;
            if (typeof rawTracks === 'string') {
              try {
                tracks = JSON.parse(rawTracks);
              } catch {
                tracks = undefined;
              }
            } else if (Array.isArray(rawTracks)) {
              tracks = rawTracks as InsightExample['tracks'];
            }
            // Extract analytics JSON — for visible measurement badges in the UI.
            let playAnalytics: PlayAnalytics | null = null;
            const rawAnalytics = (p.coachOverride as { analytics?: string | unknown })?.analytics;
            if (typeof rawAnalytics === 'string') {
              try {
                playAnalytics = JSON.parse(rawAnalytics) as PlayAnalytics;
              } catch {
                /* ignore */
              }
            } else if (rawAnalytics) {
              playAnalytics = rawAnalytics as PlayAnalytics;
            }
            let measurements: InsightExample['measurements'];
            // Only surface measurements when calibration succeeded — pixel-space
            // speeds/distances are meaningless and would mislead the coach. Play
            // duration is always valid (it's just elapsed seconds).
            if (playAnalytics?.fieldSpace) {
              const peakTrack = playAnalytics.tracks.find(
                (t) => Math.abs(t.maxSpeedYps - playAnalytics.peakSpeedYps) < 0.01,
              );
              const deepest = playAnalytics.tracks.find(
                (t) => t.trackId === playAnalytics.deepestTrackId,
              );
              measurements = {
                peakSpeedYps:
                  playAnalytics.peakSpeedYps > 0
                    ? Number(playAnalytics.peakSpeedYps.toFixed(1))
                    : undefined,
                peakSpeedPlayer: peakTrack
                  ? { jersey: peakTrack.jersey, role: peakTrack.role }
                  : undefined,
                maxDepthYards:
                  deepest?.maxDepthYards !== undefined
                    ? Number(deepest.maxDepthYards.toFixed(1))
                    : undefined,
                playDurationSec:
                  playAnalytics.playDurationSeconds > 0
                    ? Number(playAnalytics.playDurationSeconds.toFixed(1))
                    : undefined,
                fieldRegistered: true,
              };
            } else if (playAnalytics && playAnalytics.playDurationSeconds > 0) {
              // Pixel-space fallback: still show the play time (always valid) but
              // omit speed/depth so the coach doesn't see nonsense numbers.
              measurements = {
                playDurationSec: Number(playAnalytics.playDurationSeconds.toFixed(1)),
                fieldRegistered: false,
              };
            }
            return {
              playId: pid,
              label:
                `${p.down ?? '?'}&${p.distance ?? '?'} · Q${p.quarter ?? '?'} · ${p.formation ?? ''}`.trim(),
              clipUrl: p.clipBlobKey,
              description:
                `${p.playType ?? 'Play'} ${p.playDirection ?? ''} — ${p.result ?? `${p.gainLoss ?? 0} yd`}`.trim(),
              overlays: ins.overlays_per_play[pid] ?? [],
              tracks,
              highlightTrackIds: ins.highlight_tracks_per_play?.[pid],
              measurements,
            };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null),
      })),
    };

    // Derive the Friday call sheet from the structured recommendations.
    // Pure post-processing — no extra AI cost.
    walkthrough.callSheet = buildCallSheet(walkthrough.insights);

    span.done({
      opponentId: opp.id,
      insights: walkthrough.insights.length,
      callSheetBuckets: walkthrough.callSheet.buckets.length,
    });

    return Response.json(walkthrough);
  } catch (error) {
    span.fail(error);
    const msg = error instanceof Error ? error.message : 'Failed';
    return Response.json({ error: msg }, { status: 500 });
  }
}


function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}
