/**
 * Public-data scouting fetchers for COLLEGE football opponents only.
 *
 * Ethical line: high-school player data is off-limits — we do not
 * aggregate or fetch information about minors. College players are
 * public figures with publicly available rosters. This module
 * enforces that distinction at the type level: every entry point
 * requires a `programLevel` arg and refuses to operate on HS targets.
 *
 * Data source: ESPN's public college football API. No auth required,
 * no rate-limit issues at our scale (one fetch per opponent per
 * scouting setup, cached on the opponents table thereafter).
 *
 * What we fetch:
 *   - Roster: jersey, name, position group, height/weight if available
 *   - Coaching staff: head coach name + tenure
 *   - Team metadata: conference, current record, location
 *
 * What we do NOT fetch (even for college):
 *   - Recruiting profiles
 *   - Social media accounts
 *   - Personal contact info
 *   - Anything not on the team's public roster page
 */

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football';

// ─── Types ──────────────────────────────────────────────────

/**
 * Match the `programs.level` column in the schema. The `programs` table
 * stores 'hs' / 'd2' / 'd3' / 'd1' / 'college' depending on what the
 * setup wizard wrote. Anything that isn't 'hs' counts as college for
 * the purposes of this module's ethics gate.
 */
export type ProgramLevel = 'hs' | 'd1' | 'd2' | 'd3' | 'college';

export interface CollegeRosterPlayer {
  jersey: string;
  name: string;
  position: string;
  /** Position group label as ESPN reports it (e.g. "Offense", "Defense"). */
  group: string;
  heightInches?: number;
  weightLbs?: number;
  /** Year of eligibility (e.g. "Senior", "Junior"). */
  year?: string;
}

export interface CollegeTeamSummary {
  /** ESPN's internal team ID — used for follow-up roster/schedule fetches. */
  espnId: string;
  displayName: string;
  shortDisplayName: string;
  conference?: string;
  /** Record string like "11-2" if season is in progress / completed. */
  record?: string;
  /** Logo URL if present in the API response. */
  logoUrl?: string;
}

export interface CollegeOpponentScoutData {
  team: CollegeTeamSummary;
  roster: CollegeRosterPlayer[];
  headCoach?: { name: string; experience?: string };
  fetchedAt: string;
}

// ─── Guard ──────────────────────────────────────────────────

/**
 * Hard guard — every public entry point must pass through this.
 * If a caller hands us an HS program, throw. We do NOT silently
 * succeed and return empty data, because a silent failure could
 * lead a future code path to assume "HS scouting is supported,
 * the program just has no data."
 */
function assertCollege(level: ProgramLevel): void {
  if (level === 'hs') {
    throw new Error(
      'College-scouting fetchers are restricted to college programs by policy. ' +
        'High-school data is not scraped from third-party sources for ethical reasons.',
    );
  }
}

// ─── ESPN API responses (minimal — only fields we use) ──────

interface EspnTeamsResponse {
  sports?: Array<{
    leagues?: Array<{
      teams?: Array<{
        team: {
          id: string;
          displayName: string;
          shortDisplayName: string;
          location: string;
          name: string;
          abbreviation?: string;
          logos?: Array<{ href: string }>;
        };
      }>;
    }>;
  }>;
}

interface EspnRosterResponse {
  team?: {
    id: string;
    displayName: string;
    shortDisplayName: string;
    location: string;
    nickname?: string;
    record?: { items?: Array<{ summary: string }> };
    groups?: { conference?: { name?: string } };
    logos?: Array<{ href: string }>;
  };
  athletes?: Array<{
    position?: { name: string };
    items: Array<{
      id: string;
      jersey?: string;
      displayName: string;
      position?: { abbreviation: string };
      height?: number;
      weight?: number;
      experience?: { displayValue?: string };
    }>;
  }>;
  coach?: Array<{ firstName?: string; lastName?: string; experience?: number }>;
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Find an ESPN team by name. ESPN's /teams endpoint paginates by 50 — we
 * walk all pages once and cache nothing (caller should cache).
 *
 * Match strategy: case-insensitive substring match on displayName,
 * shortDisplayName, location, or nickname. First match wins, with a
 * preference for exact matches.
 */
export async function searchCollegeTeam(
  query: string,
  level: ProgramLevel,
): Promise<CollegeTeamSummary | null> {
  assertCollege(level);
  if (!query.trim()) return null;

  const wanted = query.toLowerCase().trim();
  let exactMatch: CollegeTeamSummary | null = null;
  let firstMatch: CollegeTeamSummary | null = null;

  // ESPN paginates with `limit` + `groups`. Walk groups (FBS=80, FCS=81, etc.)
  // — practically the FBS list (130 teams) is enough for most cases. We use
  // the higher-level /teams?limit=900 trick which returns more in one call.
  const url = `${ESPN_BASE}/teams?limit=900`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    throw new Error(`ESPN /teams returned ${res.status}`);
  }
  const data = (await res.json()) as EspnTeamsResponse;
  const teams = data.sports?.[0]?.leagues?.[0]?.teams ?? [];

  for (const t of teams) {
    const team = t.team;
    if (!team.id) continue;
    const haystack = [
      team.displayName,
      team.shortDisplayName,
      team.location,
      team.name,
      team.abbreviation,
    ]
      .filter((s): s is string => Boolean(s))
      .map((s) => s.toLowerCase());

    if (haystack.includes(wanted)) {
      exactMatch = espnTeamToSummary(team);
      break;
    }
    if (!firstMatch && haystack.some((s) => s.includes(wanted))) {
      firstMatch = espnTeamToSummary(team);
    }
  }

  return exactMatch ?? firstMatch;
}

/**
 * Fetch a college team's roster + coach info by their ESPN team ID.
 * Caller should have used `searchCollegeTeam` first (or pulled the ID
 * from a cached opponent record).
 */
export async function fetchCollegeOpponent(
  espnTeamId: string,
  level: ProgramLevel,
): Promise<CollegeOpponentScoutData> {
  assertCollege(level);

  const url = `${ESPN_BASE}/teams/${encodeURIComponent(espnTeamId)}/roster`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    throw new Error(`ESPN roster ${espnTeamId} returned ${res.status}`);
  }
  const data = (await res.json()) as EspnRosterResponse;

  const team = data.team;
  if (!team) throw new Error(`ESPN roster ${espnTeamId} returned no team data`);

  const roster: CollegeRosterPlayer[] = [];
  for (const group of data.athletes ?? []) {
    const groupName = group.position?.name ?? 'Other';
    for (const p of group.items) {
      if (!p.jersey || !p.position?.abbreviation) continue;
      roster.push({
        jersey: p.jersey,
        name: p.displayName,
        position: p.position.abbreviation,
        group: groupName,
        heightInches: p.height,
        weightLbs: p.weight,
        year: p.experience?.displayValue,
      });
    }
  }

  // ESPN sometimes returns coaches as an array — we only take the head.
  const coach = data.coach?.[0];
  const headCoach = coach
    ? {
        name: [coach.firstName, coach.lastName].filter(Boolean).join(' '),
        experience: coach.experience !== undefined ? `${coach.experience} years` : undefined,
      }
    : undefined;

  return {
    team: {
      espnId: team.id,
      displayName: team.displayName,
      shortDisplayName: team.shortDisplayName,
      conference: team.groups?.conference?.name,
      record: team.record?.items?.[0]?.summary,
      logoUrl: team.logos?.[0]?.href,
    },
    roster,
    headCoach,
    fetchedAt: new Date().toISOString(),
  };
}

// ─── Roster validation helpers (used by walkthrough) ────────

/**
 * Build a Set of valid jersey numbers from a roster, scoped to a list
 * of allowed position abbreviations. Used by the walkthrough to drop
 * any jersey number Claude cites that isn't on the actual roster.
 */
export function jerseysForPositions(
  roster: CollegeRosterPlayer[],
  positions: string[],
): Set<string> {
  const allowed = new Set(positions);
  const out = new Set<string>();
  for (const p of roster) {
    if (allowed.has(p.position)) out.add(p.jersey);
  }
  return out;
}

/**
 * Validate a single (role, jersey) claim against the opponent roster.
 * Returns `null` if valid, or a string describing why it's not.
 */
export function validateRosterClaim(
  roster: CollegeRosterPlayer[],
  role: string,
  jersey: string,
): string | null {
  const player = roster.find((p) => p.jersey === jersey);
  if (!player) {
    return `jersey #${jersey} is not on the roster`;
  }
  // Map our broad roles to the position abbreviations a roster might have.
  // A QB is QB. A WR could be WR. A CB could be CB or DB. Defensive line
  // could be DE, DT, NT, etc.
  const ROLE_POSITION_MATCH: Record<string, string[]> = {
    QB: ['QB'],
    RB: ['RB', 'FB'],
    WR: ['WR'],
    TE: ['TE'],
    OL: ['OL', 'OG', 'OT', 'C', 'G', 'T'],
    DL: ['DL', 'DE', 'DT', 'NT', 'EDGE'],
    LB: ['LB', 'ILB', 'OLB', 'MLB'],
    CB: ['CB', 'DB'],
    S: ['S', 'FS', 'SS', 'DB', 'SAF'],
  };
  const allowedPositions = ROLE_POSITION_MATCH[role.toUpperCase()];
  if (allowedPositions && !allowedPositions.includes(player.position)) {
    return `jersey #${jersey} is on the roster but listed as ${player.position}, not ${role}`;
  }
  return null;
}

// ─── Internal helpers ───────────────────────────────────────

interface EspnTeamShape {
  id: string;
  displayName: string;
  shortDisplayName: string;
  location?: string;
  name?: string;
  abbreviation?: string;
  logos?: Array<{ href: string }>;
}

function espnTeamToSummary(team: EspnTeamShape): CollegeTeamSummary {
  return {
    espnId: team.id,
    displayName: team.displayName,
    shortDisplayName: team.shortDisplayName,
    logoUrl: team.logos?.[0]?.href,
  };
}
