/**
 * Seed script — populates the database with realistic football data.
 *
 * Creates:
 *   - 1 program (Lincoln High Football)
 *   - 1 season (2025)
 *   - 25 players with realistic positions/jerseys
 *   - 3 opponents
 *   - 4 games (2 home, 2 away)
 *   - ~240 plays with realistic formations, personnel, D&D, results
 *
 * Run: bun scripts/seed.ts
 */

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import {
  programs,
  seasons,
  players,
  opponents,
  games,
  plays,
} from '../src/lib/db/schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL required. Run: export $(grep DATABASE_URL .env.local | xargs)');
}

const client = postgres(process.env.DATABASE_URL, { prepare: false });
const db = drizzle(client);

// ─── Data ───────────────────────────────────────────────────

const FORMATIONS = [
  { name: 'Shotgun Spread', weight: 25 },
  { name: 'Shotgun Trips Rt', weight: 15 },
  { name: 'Shotgun Trips Lt', weight: 10 },
  { name: 'Pistol', weight: 12 },
  { name: 'Under Center', weight: 8 },
  { name: 'I-Form', weight: 8 },
  { name: 'Singleback', weight: 10 },
  { name: 'Empty', weight: 5 },
  { name: 'Shotgun Bunch Rt', weight: 4 },
  { name: 'Wildcat', weight: 3 },
];

const PERSONNEL = [
  { name: '11', weight: 45 },  // 1 RB, 1 TE, 3 WR
  { name: '12', weight: 20 },  // 1 RB, 2 TE, 2 WR
  { name: '21', weight: 15 },  // 2 RB, 1 TE, 2 WR
  { name: '10', weight: 10 },  // 1 RB, 0 TE, 4 WR
  { name: '22', weight: 5 },   // 2 RB, 2 TE, 1 WR
  { name: '13', weight: 5 },   // 1 RB, 3 TE, 1 WR
];

const PLAY_TYPES = [
  { name: 'Run', weight: 48 },
  { name: 'Pass', weight: 38 },
  { name: 'RPO', weight: 8 },
  { name: 'Screen', weight: 4 },
  { name: 'Play Action', weight: 2 },
];

const PLAY_DIRECTIONS = ['Left', 'Right', 'Middle'];

const RESULTS = [
  'Gain', 'Gain', 'Gain', 'Gain', 'No Gain', 'Gain',
  'First Down', 'First Down', 'Incomplete', 'Complete',
  'Touchdown', 'Sack', 'Penalty', 'Fumble',
];

const ROSTER = [
  { first: 'Marcus', last: 'Williams', jersey: 7, pos: ['QB'], grade: 'SR' },
  { first: 'Jaylen', last: 'Carter', jersey: 2, pos: ['RB'], grade: 'JR' },
  { first: 'DeShawn', last: 'Johnson', jersey: 22, pos: ['RB'], grade: 'SO' },
  { first: 'Trevon', last: 'Adams', jersey: 1, pos: ['WR'], grade: 'SR' },
  { first: 'Kyler', last: 'Thompson', jersey: 11, pos: ['WR'], grade: 'JR' },
  { first: 'Malik', last: 'Brown', jersey: 5, pos: ['WR'], grade: 'SR' },
  { first: 'Jaxon', last: 'Davis', jersey: 80, pos: ['WR', 'TE'], grade: 'JR' },
  { first: 'Bryce', last: 'Mitchell', jersey: 88, pos: ['TE'], grade: 'SR' },
  { first: 'Andre', last: 'Robinson', jersey: 72, pos: ['OL', 'OT'], grade: 'SR' },
  { first: 'Cameron', last: 'Lee', jersey: 66, pos: ['OL', 'OG'], grade: 'JR' },
  { first: 'Xavier', last: 'Garcia', jersey: 52, pos: ['OL', 'C'], grade: 'SR' },
  { first: 'Darius', last: 'White', jersey: 64, pos: ['OL', 'OG'], grade: 'JR' },
  { first: 'Isaiah', last: 'Martinez', jersey: 76, pos: ['OL', 'OT'], grade: 'SO' },
  { first: 'Khalil', last: 'Harris', jersey: 91, pos: ['DL', 'DE'], grade: 'SR' },
  { first: 'Terrance', last: 'Jackson', jersey: 93, pos: ['DL', 'DT'], grade: 'JR' },
  { first: 'Jamal', last: 'Thomas', jersey: 95, pos: ['DL', 'DT'], grade: 'SR' },
  { first: 'Rashad', last: 'Wilson', jersey: 97, pos: ['DL', 'DE'], grade: 'JR' },
  { first: 'Devon', last: 'Moore', jersey: 54, pos: ['LB', 'ILB'], grade: 'SR' },
  { first: 'Tyrese', last: 'Clark', jersey: 56, pos: ['LB', 'OLB'], grade: 'JR' },
  { first: 'Keenan', last: 'Wright', jersey: 50, pos: ['LB', 'OLB'], grade: 'SO' },
  { first: 'Jalen', last: 'King', jersey: 4, pos: ['CB'], grade: 'SR' },
  { first: 'Aiden', last: 'Scott', jersey: 24, pos: ['CB'], grade: 'JR' },
  { first: 'Micah', last: 'Taylor', jersey: 21, pos: ['S', 'FS'], grade: 'SR' },
  { first: 'Ezekiel', last: 'Anderson', jersey: 8, pos: ['S', 'SS'], grade: 'JR' },
  { first: 'Noah', last: 'Hernandez', jersey: 18, pos: ['K', 'P'], grade: 'JR' },
];

const OPPONENTS = [
  { name: 'Jefferson Eagles', city: 'Jefferson', state: 'TX' },
  { name: 'Roosevelt Panthers', city: 'Roosevelt', state: 'TX' },
  { name: 'Washington Wolves', city: 'Washington', state: 'TX' },
];

// ─── Helpers ────────────────────────────────────────────────

function weightedPick<T extends { weight: number }>(options: T[]): T {
  const total = options.reduce((s, o) => s + o.weight, 0);
  let r = Math.random() * total;
  for (const opt of options) {
    r -= opt.weight;
    if (r <= 0) return opt;
  }
  return options[options.length - 1]!;
}

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function generateGainLoss(playType: string, down: number, distance: number): number {
  if (playType === 'Run') {
    // Run plays: -3 to +15, clustered around 3-5
    const base = Math.random() * 18 - 3;
    return Math.round(Math.min(base, 15));
  }
  if (playType === 'Pass' || playType === 'Play Action') {
    // Pass: -8 (sack) to +40, more variance
    if (Math.random() < 0.15) return Math.round(-1 * (Math.random() * 8)); // sack
    if (Math.random() < 0.3) return 0; // incomplete
    return Math.round(Math.random() * 25 + 2);
  }
  if (playType === 'Screen') {
    return Math.round(Math.random() * 12 - 2);
  }
  if (playType === 'RPO') {
    return Math.round(Math.random() * 15);
  }
  return Math.round(Math.random() * 10);
}

function distanceBucket(distance: number): string {
  if (distance <= 3) return 'short';
  if (distance <= 6) return 'medium';
  return 'long';
}

function fieldZone(yardLine: number): string {
  if (yardLine >= 80) return 'red_zone';
  if (yardLine >= 60) return 'scoring_territory';
  if (yardLine <= 20) return 'backed_up';
  return 'midfield';
}

// ─── Generate plays for a game ──────────────────────────────

interface PlayData {
  playOrder: number;
  down: number;
  distance: number;
  distanceBucket: string;
  hash: string;
  yardLine: number;
  fieldZone: string;
  quarter: number;
  scoreDiff: number;
  formation: string;
  personnel: string;
  playType: string;
  playDirection: string;
  gainLoss: number;
  result: string;
  odk: string;
}

function generateGamePlays(playsPerGame: number): PlayData[] {
  const gamePlays: PlayData[] = [];
  let yardLine = 25; // start at own 25
  let down = 1;
  let distance = 10;
  let quarter = 1;
  let scoreDiff = 0;
  let playsInQuarter = 0;
  const playsPerQuarter = Math.floor(playsPerGame / 4);

  for (let i = 0; i < playsPerGame; i++) {
    // Quarter transitions
    if (playsInQuarter >= playsPerQuarter && quarter < 4) {
      quarter++;
      playsInQuarter = 0;
      // Halftime adjustment — slight score change
      if (quarter === 3) scoreDiff += randomPick([-7, -3, 0, 0, 3, 7]);
    }

    const formation = weightedPick(FORMATIONS).name;
    const personnel = weightedPick(PERSONNEL).name;
    const playType = weightedPick(PLAY_TYPES).name;
    const playDirection = randomPick(PLAY_DIRECTIONS);
    const hash = randomPick(['Left', 'Middle', 'Right']);
    const gainLoss = generateGainLoss(playType, down, distance);

    // Determine result
    let result: string;
    if (gainLoss >= distance) {
      result = yardLine + gainLoss >= 100 ? 'Touchdown' : 'First Down';
    } else if (gainLoss <= 0 && playType === 'Pass') {
      result = gainLoss < -2 ? 'Sack' : 'Incomplete';
    } else if (Math.random() < 0.02) {
      result = 'Fumble';
    } else if (Math.random() < 0.03) {
      result = 'Penalty';
    } else {
      result = gainLoss > 0 ? 'Gain' : 'No Gain';
    }

    // Alternate offense/defense (60% offense for variety)
    const odk = Math.random() < 0.6 ? 'O' : 'D';

    gamePlays.push({
      playOrder: i + 1,
      down,
      distance,
      distanceBucket: distanceBucket(distance),
      hash,
      yardLine,
      fieldZone: fieldZone(yardLine),
      quarter,
      scoreDiff,
      formation,
      personnel,
      playType,
      playDirection,
      gainLoss,
      result,
      odk,
    });

    // Advance game state
    yardLine = Math.max(1, Math.min(99, yardLine + gainLoss));

    if (result === 'Touchdown') {
      scoreDiff += 7;
      yardLine = 25;
      down = 1;
      distance = 10;
    } else if (result === 'First Down') {
      down = 1;
      distance = 10;
    } else if (result === 'Fumble' || result === 'Interception') {
      yardLine = 100 - yardLine; // turnover
      down = 1;
      distance = 10;
    } else {
      down++;
      distance = Math.max(1, distance - Math.max(0, gainLoss));
      if (down > 4) {
        // Turnover on downs or punt
        yardLine = Math.min(80, 100 - yardLine);
        down = 1;
        distance = 10;
      }
    }

    playsInQuarter++;
  }

  return gamePlays;
}

// ─── Main ───────────────────────────────────────────────────

async function seed() {
  console.log('Seeding database...\n');

  // Create program
  const [program] = await db.insert(programs).values({
    name: 'Lincoln High Football',
    level: 'hs',
    city: 'Lincoln',
    state: 'TX',
    clerkOrgId: `seed_${Date.now()}`,
  }).returning();

  if (!program) throw new Error('Failed to create program');
  console.log(`Program: ${program.name} (${program.id})`);

  // Create season
  const [season] = await db.insert(seasons).values({
    programId: program.id,
    year: 2025,
  }).returning();
  console.log(`Season: 2025 (${season?.id})`);

  // Create players (no RLS for seed — using db directly)
  // We need to bypass RLS for seed data
  await db.execute(sql.raw(`SET LOCAL app.program_id = '${program.id}'`));

  const insertedPlayers = [];
  for (const p of ROSTER) {
    const [player] = await db.insert(players).values({
      programId: program.id,
      firstName: p.first,
      lastName: p.last,
      jerseyNumber: p.jersey,
      positions: p.pos,
      grade: p.grade,
      joinCode: Math.random().toString(36).slice(2, 8).toUpperCase(),
      joinCodeExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    }).returning();
    if (player) insertedPlayers.push(player);
  }
  console.log(`Players: ${insertedPlayers.length} added`);

  // Create opponents
  const insertedOpponents = [];
  for (const o of OPPONENTS) {
    const [opp] = await db.insert(opponents).values({
      programId: program.id,
      name: o.name,
      city: o.city,
      state: o.state,
    }).returning();
    if (opp) insertedOpponents.push(opp);
  }
  console.log(`Opponents: ${insertedOpponents.length} added`);

  // Create games (4 total — more plays vs Jefferson for richer scouting data)
  const gameConfigs = [
    { opponent: insertedOpponents[0]!, isHome: true, playsCount: 65 },
    { opponent: insertedOpponents[0]!, isHome: false, playsCount: 60 },
    { opponent: insertedOpponents[1]!, isHome: true, playsCount: 58 },
    { opponent: insertedOpponents[2]!, isHome: false, playsCount: 55 },
  ];

  let totalPlays = 0;

  for (const gc of gameConfigs) {
    const weekNum = gameConfigs.indexOf(gc) + 1;
    const playedAt = new Date(2025, 8, 5 + weekNum * 7); // September Fridays

    const [game] = await db.insert(games).values({
      programId: program.id,
      seasonId: season?.id ?? null,
      opponentId: gc.opponent.id,
      playedAt,
      isHome: gc.isHome,
      ourScore: Math.floor(Math.random() * 28) + 7,
      opponentScore: Math.floor(Math.random() * 28) + 7,
    }).returning();

    if (!game) continue;

    // Generate and insert plays
    const gamePlays = generateGamePlays(gc.playsCount);

    for (const p of gamePlays) {
      await db.insert(plays).values({
        programId: program.id,
        gameId: game.id,
        playOrder: p.playOrder,
        down: p.down,
        distance: p.distance,
        distanceBucket: p.distanceBucket,
        hash: p.hash,
        yardLine: p.yardLine,
        fieldZone: p.fieldZone,
        quarter: p.quarter,
        scoreDiff: p.scoreDiff,
        formation: p.formation,
        personnel: p.personnel,
        odk: p.odk,
        playType: p.playType,
        playDirection: p.playDirection,
        gainLoss: p.gainLoss,
        result: p.result,
        status: 'ready', // Skip CV pipeline for seed data
      });
    }

    totalPlays += gamePlays.length;
    console.log(`Game ${weekNum}: vs ${gc.opponent.name} (${gc.isHome ? 'home' : 'away'}) — ${gamePlays.length} plays`);
  }

  console.log(`\nTotal: ${totalPlays} plays seeded`);
  console.log(`\nProgram ID: ${program.id}`);
  console.log(`\nTo use this program, set it in your browser:`);
  console.log(`  localStorage.setItem('audible_program_id', '${program.id}')`);
  console.log(`  localStorage.setItem('audible_program_name', '${program.name}')`);
  console.log(`  Then refresh the page.`);

  await client.end();
}

seed().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
