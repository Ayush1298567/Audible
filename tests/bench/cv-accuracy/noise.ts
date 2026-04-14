/**
 * Controlled noise injectors — simulate the failure modes of the real
 * CV pipeline against the clean synthetic data, so we can measure how
 * well our accuracy defenses hold up.
 *
 * Every injector is deterministic given a seed, so bench results
 * reproduce. Every injector returns a NEW array — never mutates the
 * input.
 */

import type { SyntheticPlay } from './synthetic-games';

function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Jersey OCR errors ───────────────────────────────────────

/**
 * Simulate jersey OCR failures. `errorRate` fraction of matchup sides
 * get their jersey replaced (either with a different number, or cleared).
 *
 * Real CV pipeline: Claude returns wrong jerseys with low confidence on
 * blurry HS film. Our 0.7 threshold + jersey-role reconciliation should
 * catch most of these, but SOME slip through. This injector puts them
 * in at the matchup level.
 */
export function injectJerseyOcrErrors(
  plays: SyntheticPlay[],
  errorRate: number,
  seed = 101,
): SyntheticPlay[] {
  const rand = mulberry32(seed);
  return plays.map((play) => ({
    ...play,
    analytics: {
      ...play.analytics,
      keyMatchups: play.analytics.keyMatchups?.map((m) => {
        const newM = { ...m, offense: { ...m.offense }, defense: { ...m.defense } };
        if (rand() < errorRate && newM.offense.jersey) {
          // Replace with a plausible-looking but wrong number
          newM.offense.jersey = String(1 + Math.floor(rand() * 99));
        }
        if (rand() < errorRate && newM.defense.jersey) {
          newM.defense.jersey = String(1 + Math.floor(rand() * 99));
        }
        return newM;
      }),
    },
  }));
}

// ─── Role mis-labels ─────────────────────────────────────────

const OFF_ROLES = ['QB', 'RB', 'WR', 'TE', 'OL'];
const DEF_ROLES = ['CB', 'S', 'LB', 'DL'];

/**
 * Claude occasionally mis-infers a role — puts a CB in the "WR" bucket
 * based on kinematics alone. The jersey↔role reconciler should catch
 * these when the same jersey appears with the correct role more often,
 * but we want to measure its effectiveness.
 */
export function injectRoleMislabels(
  plays: SyntheticPlay[],
  errorRate: number,
  seed = 202,
): SyntheticPlay[] {
  const rand = mulberry32(seed);
  return plays.map((play) => ({
    ...play,
    analytics: {
      ...play.analytics,
      keyMatchups: play.analytics.keyMatchups?.map((m) => {
        const newM = { ...m, offense: { ...m.offense }, defense: { ...m.defense } };
        if (rand() < errorRate) {
          // Flip offense to a random defensive role (forces a cross-play contradiction)
          newM.offense.role = DEF_ROLES[Math.floor(rand() * DEF_ROLES.length)] ?? 'CB';
        }
        if (rand() < errorRate) {
          newM.defense.role = OFF_ROLES[Math.floor(rand() * OFF_ROLES.length)] ?? 'WR';
        }
        return newM;
      }),
    },
  }));
}

// ─── Confidence degradation ──────────────────────────────────

/**
 * Simulate the whole pipeline running hot — every matchup's joint
 * confidence drops by some amount (detection noise, poor calibration,
 * unreadable jerseys all stacking up). The ≥0.4 matchup filter and
 * trust-tier thresholds should respond accordingly.
 */
export function degradeMatchupConfidence(
  plays: SyntheticPlay[],
  reduction: number,
): SyntheticPlay[] {
  return plays.map((play) => ({
    ...play,
    analytics: {
      ...play.analytics,
      keyMatchups: play.analytics.keyMatchups?.map((m) => ({
        ...m,
        confidence: Math.max(0, m.confidence - reduction),
      })),
    },
  }));
}

// ─── Fake tendencies from noise tracks ───────────────────────

/**
 * Fabricate extra matchups that look like tendencies but are actually
 * sideline coaches, refs, or identity-switched tracks pretending to
 * be players. The aggregator's filters + confidence floor should
 * block these from becoming high-trust tendencies.
 */
export function injectFakeTendencies(
  plays: SyntheticPlay[],
  fakeMatchupsPerGame: number,
  seed = 303,
): SyntheticPlay[] {
  const rand = mulberry32(seed);
  const playsByGame = new Map<string, SyntheticPlay[]>();
  for (const p of plays) {
    const list = playsByGame.get(p.gameId) ?? [];
    list.push(p);
    playsByGame.set(p.gameId, list);
  }

  // Each fake tendency: pick a jersey not in the scripted matchups
  // (use high numbers to avoid collision with roster) and inject it
  // as an extra matchup on N plays in the game.
  const fakeDefenderNumber = '77';
  const out = [...plays];
  for (const [, list] of playsByGame) {
    for (let i = 0; i < fakeMatchupsPerGame; i++) {
      const target = list[Math.floor(rand() * list.length)];
      if (!target) continue;
      const extra = {
        offense: { trackId: 'fake-off', role: 'WR', jersey: '66' },
        defense: { trackId: 'fake-def', role: 'CB', jersey: fakeDefenderNumber },
        minSeparationYards: 2 + rand() * 2,
        atT: 1.5,
        closingYps: 1.5,
        offenseMaxSpeedYps: 7.5,
        // Low confidence — simulating the noise track
        confidence: 0.35,
      };
      const idx = out.findIndex((p) => p.playId === target.playId);
      if (idx === -1) continue;
      const orig = out[idx];
      if (!orig) continue;
      const currentMatchups = orig.analytics.keyMatchups ?? [];
      out[idx] = {
        ...orig,
        analytics: {
          ...orig.analytics,
          keyMatchups: [...currentMatchups, extra],
        },
      };
    }
  }
  return out;
}
