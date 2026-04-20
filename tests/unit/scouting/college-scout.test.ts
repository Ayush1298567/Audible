/**
 * Tests for the college-scout module. Mocks fetch so we don't hit the
 * real ESPN API during unit tests — the integration layer (live API
 * call, roster shape) is exercised manually in dev / via the live
 * fetch in the actual product.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchCollegeOpponent,
  jerseysForPositions,
  searchCollegeTeam,
  validateRosterClaim,
  type CollegeRosterPlayer,
} from '@/lib/scouting/college-scout';

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetchOnce(json: unknown, status = 200) {
  const fetchSpy = vi.spyOn(global, 'fetch');
  fetchSpy.mockResolvedValueOnce(
    new Response(JSON.stringify(json), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  return fetchSpy;
}

describe('searchCollegeTeam', () => {
  it('refuses to operate on HS programs', async () => {
    await expect(searchCollegeTeam('Lincoln', 'hs')).rejects.toThrow(/restricted to college/);
  });

  it('returns null on empty input', async () => {
    expect(await searchCollegeTeam('', 'college')).toBeNull();
    expect(await searchCollegeTeam('   ', 'college')).toBeNull();
  });

  it('finds an exact name match', async () => {
    mockFetchOnce({
      sports: [
        {
          leagues: [
            {
              teams: [
                {
                  team: {
                    id: '333',
                    displayName: 'Alabama Crimson Tide',
                    shortDisplayName: 'Alabama',
                    location: 'Alabama',
                    name: 'Crimson Tide',
                  },
                },
                {
                  team: {
                    id: '99',
                    displayName: 'Alabama State Hornets',
                    shortDisplayName: 'Alabama State',
                    location: 'Alabama State',
                    name: 'Hornets',
                  },
                },
              ],
            },
          ],
        },
      ],
    });
    const result = await searchCollegeTeam('Alabama Crimson Tide', 'college');
    expect(result?.espnId).toBe('333');
    expect(result?.displayName).toBe('Alabama Crimson Tide');
  });

  it('falls back to substring match when no exact hit', async () => {
    mockFetchOnce({
      sports: [
        {
          leagues: [
            {
              teams: [
                {
                  team: {
                    id: '111',
                    displayName: 'Boise State Broncos',
                    shortDisplayName: 'Boise State',
                    location: 'Boise State',
                    name: 'Broncos',
                  },
                },
              ],
            },
          ],
        },
      ],
    });
    const result = await searchCollegeTeam('Boise', 'college');
    expect(result?.espnId).toBe('111');
  });

  it('returns null when no team matches', async () => {
    mockFetchOnce({
      sports: [{ leagues: [{ teams: [] }] }],
    });
    expect(await searchCollegeTeam('NotARealTeam', 'college')).toBeNull();
  });
});

describe('fetchCollegeOpponent', () => {
  it('refuses to operate on HS programs', async () => {
    await expect(fetchCollegeOpponent('333', 'hs')).rejects.toThrow(/restricted to college/);
  });

  it('parses team metadata + roster + coach correctly', async () => {
    mockFetchOnce({
      team: {
        id: '333',
        displayName: 'Alabama Crimson Tide',
        shortDisplayName: 'Alabama',
        location: 'Alabama',
        record: { items: [{ summary: '11-2' }] },
        groups: { conference: { name: 'SEC' } },
        logos: [{ href: 'https://logo.example/alabama.png' }],
      },
      athletes: [
        {
          position: { name: 'Offense' },
          items: [
            {
              id: '1',
              jersey: '7',
              displayName: 'Cole Adams',
              position: { abbreviation: 'WR' },
              height: 70,
              weight: 175,
              experience: { displayValue: 'Senior' },
            },
            // Player without jersey — should be skipped
            {
              id: '2',
              jersey: undefined,
              displayName: 'Mystery Player',
              position: { abbreviation: 'WR' },
            },
          ],
        },
        {
          position: { name: 'Defense' },
          items: [
            {
              id: '3',
              jersey: '24',
              displayName: 'DaShawn Jones',
              position: { abbreviation: 'CB' },
            },
          ],
        },
      ],
      coach: [{ firstName: 'Kalen', lastName: 'DeBoer', experience: 8 }],
    });

    const result = await fetchCollegeOpponent('333', 'college');
    expect(result.team.displayName).toBe('Alabama Crimson Tide');
    expect(result.team.conference).toBe('SEC');
    expect(result.team.record).toBe('11-2');
    expect(result.team.logoUrl).toContain('alabama.png');
    expect(result.headCoach?.name).toBe('Kalen DeBoer');
    expect(result.headCoach?.experience).toBe('8 years');
    expect(result.roster).toHaveLength(2); // jersey-less player skipped
    expect(result.roster[0]?.jersey).toBe('7');
    expect(result.roster[0]?.position).toBe('WR');
    expect(result.roster[0]?.heightInches).toBe(70);
    expect(result.roster[0]?.year).toBe('Senior');
    expect(result.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('throws on non-200 response', async () => {
    mockFetchOnce({}, 500);
    await expect(fetchCollegeOpponent('333', 'college')).rejects.toThrow(/returned 500/);
  });
});

describe('jerseysForPositions', () => {
  const roster: CollegeRosterPlayer[] = [
    { jersey: '7', name: 'WR Player', position: 'WR', group: 'Offense' },
    { jersey: '88', name: 'WR Other', position: 'WR', group: 'Offense' },
    { jersey: '24', name: 'CB Player', position: 'CB', group: 'Defense' },
    { jersey: '9', name: 'S Player', position: 'S', group: 'Defense' },
  ];

  it('returns only jerseys whose position is in the allowed set', () => {
    const wrJerseys = jerseysForPositions(roster, ['WR']);
    expect(wrJerseys).toEqual(new Set(['7', '88']));

    const dbJerseys = jerseysForPositions(roster, ['CB', 'S']);
    expect(dbJerseys).toEqual(new Set(['24', '9']));
  });

  it('returns empty when no player matches', () => {
    expect(jerseysForPositions(roster, ['DL'])).toEqual(new Set());
  });
});

describe('validateRosterClaim', () => {
  const roster: CollegeRosterPlayer[] = [
    { jersey: '7', name: 'QB Guy', position: 'QB', group: 'Offense' },
    { jersey: '24', name: 'CB Guy', position: 'CB', group: 'Defense' },
    { jersey: '9', name: 'Safety Guy', position: 'FS', group: 'Defense' },
    { jersey: '88', name: 'TE Guy', position: 'TE', group: 'Offense' },
    { jersey: '5', name: 'DB Generic', position: 'DB', group: 'Defense' },
  ];

  it('returns null for a valid jersey + role match', () => {
    expect(validateRosterClaim(roster, 'QB', '7')).toBeNull();
    expect(validateRosterClaim(roster, 'CB', '24')).toBeNull();
    expect(validateRosterClaim(roster, 'TE', '88')).toBeNull();
  });

  it('accepts position group equivalents (FS→S, DB→CB/S)', () => {
    expect(validateRosterClaim(roster, 'S', '9')).toBeNull(); // FS counts as S
    expect(validateRosterClaim(roster, 'CB', '5')).toBeNull(); // DB counts as CB
    expect(validateRosterClaim(roster, 'S', '5')).toBeNull(); // DB also counts as S
  });

  it('flags jerseys not on the roster', () => {
    expect(validateRosterClaim(roster, 'QB', '999')).toMatch(/not on the roster/);
  });

  it('flags role/position mismatches', () => {
    // #7 is a QB, citing him as a CB is suspicious
    expect(validateRosterClaim(roster, 'CB', '7')).toMatch(/listed as QB, not CB/);
  });
});
