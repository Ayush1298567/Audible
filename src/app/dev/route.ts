import { db } from '@/lib/db/client';
import { programs, seasons, players, opponents, games, plays } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * GET /dev — instant dev bootstrap with realistic data.
 *
 * Creates a full program with opponents, games, players, and 60+ plays
 * with realistic football distributions so every page has data to show.
 *
 * Tendencies baked in:
 *   - Jefferson: Cover 3 heavy on 3rd & long (70%), runs from 12 personnel (75%)
 *   - Roosevelt: man coverage (60%), blitzes on passing downs (50%)
 */

// Weighted random pick
function pick<T>(items: T[], weights?: number[]): T {
  if (!weights) return items[Math.floor(Math.random() * items.length)]!;
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

interface PlaySeed {
  down: number;
  distance: number;
  quarter: number;
  formation: string;
  personnel: string;
  playType: string;
  playDirection: string;
  gainLoss: number;
  result: string;
  coverage: string;
  pressure: string;
  motion: string | null;
}

function generateJeffersonPlay(i: number): PlaySeed {
  const down = pick([1, 2, 3, 4], [35, 30, 30, 5]);
  const distance = down === 1 ? 10 : down === 3 ? pick([2, 5, 8, 12], [20, 30, 30, 20]) : randInt(3, 10);
  const is3rdLong = down === 3 && distance >= 7;
  const quarter = pick([1, 2, 3, 4], [25, 25, 25, 25]);

  // Jefferson tendency: Cover 3 on 3rd & long 70% of the time
  const coverage = is3rdLong
    ? pick(['Cover 3', 'Cover 1', 'Cover 2', 'Cover 4'], [70, 15, 10, 5])
    : pick(['Cover 3', 'Cover 1', 'Cover 2', 'Cover 4', 'Cover 0'], [30, 25, 20, 15, 10]);

  const personnel12 = pick(['11', '12', '21'], [40, 40, 20]);
  // Jefferson tendency: runs from 12 personnel 75%
  const isRun = personnel12 === '12'
    ? pick([true, false], [75, 25])
    : pick([true, false], [45, 55]);

  const playType = isRun ? 'run' : pick(['pass', 'screen', 'rpo'], [70, 15, 15]);
  const formation = isRun
    ? pick(['I-Form', 'Singleback', 'Pistol', 'Shotgun'], [30, 25, 25, 20])
    : pick(['Shotgun', 'Spread', 'Trips', 'Empty'], [35, 25, 25, 15]);
  const playDirection = pick(['Left', 'Right', 'Middle'], [35, 35, 30]);
  const gainLoss = isRun ? randInt(-3, 12) : randInt(-5, 25);
  const result = gainLoss > 15 ? 'TD' : gainLoss > 0 ? 'Complete' : gainLoss === 0 ? 'Incomplete' : 'Sack';
  const pressure = pick(['None', '4-man', '5-man', 'Blitz'], [50, 25, 15, 10]);

  // Motion tendency: jet motion right → run right 80%
  const hasMotion = Math.random() < 0.25;
  const motion = hasMotion ? pick(['Jet Right', 'Jet Left', 'Orbit', 'Shift'], [40, 30, 15, 15]) : null;

  return { down, distance, quarter, formation, personnel: personnel12, playType, playDirection, gainLoss, result, coverage, pressure, motion };
}

function generateRooseveltPlay(i: number): PlaySeed {
  const down = pick([1, 2, 3, 4], [35, 30, 30, 5]);
  const distance = down === 1 ? 10 : down === 3 ? pick([2, 5, 8, 12], [25, 25, 25, 25]) : randInt(3, 10);
  const quarter = pick([1, 2, 3, 4], [25, 25, 25, 25]);

  // Roosevelt tendency: man coverage 60%
  const coverage = pick(['Man', 'Cover 1', 'Cover 3', 'Cover 2'], [60, 15, 15, 10]);

  // Roosevelt tendency: blitz on passing downs 50%
  const isPassingDown = (down === 3 && distance >= 5) || down === 2 && distance >= 8;
  const pressure = isPassingDown
    ? pick(['Blitz', '5-man', '4-man', 'None'], [50, 20, 20, 10])
    : pick(['4-man', 'None', '5-man', 'Blitz'], [40, 30, 20, 10]);

  const personnel = pick(['11', '12', '21'], [50, 30, 20]);
  const isRun = pick([true, false], [48, 52]);
  const playType = isRun ? 'run' : pick(['pass', 'screen', 'rpo'], [65, 20, 15]);
  const formation = pick(['Shotgun', 'Singleback', 'I-Form', 'Spread', 'Pistol'], [25, 20, 20, 20, 15]);
  const playDirection = pick(['Left', 'Right', 'Middle'], [35, 35, 30]);
  const gainLoss = isRun ? randInt(-2, 10) : randInt(-8, 30);
  const result = gainLoss > 15 ? 'TD' : gainLoss > 0 ? (isRun ? 'Rush' : 'Complete') : gainLoss === 0 ? 'Incomplete' : (pressure.includes('Blitz') ? 'Sack' : 'Incomplete');
  const motion = Math.random() < 0.15 ? pick(['Jet Right', 'Orbit'], [60, 40]) : null;

  return { down, distance, quarter, formation, personnel, playType, playDirection, gainLoss, result, coverage, pressure, motion };
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const reset = url.searchParams.get('reset') === '1';

  // If reset, delete all plays first
  if (reset) {
    await db.delete(plays);
  }

  // Check if plays already exist (don't re-seed)
  const existingPlays = await db.select({ id: plays.id }).from(plays).limit(1);

  let programId: string;
  let programName: string;

  const existingProgram = await db.select({ id: programs.id, name: programs.name }).from(programs).limit(1);

  if (existingProgram[0] && existingPlays[0]) {
    // Already seeded — just redirect
    programId = existingProgram[0].id;
    programName = existingProgram[0].name;
  } else {
    // Get or create program
    if (existingProgram[0]) {
      programId = existingProgram[0].id;
      programName = existingProgram[0].name;
    } else {
      const [program] = await db.insert(programs).values({
        name: 'Lincoln High Football',
        level: 'hs',
        city: 'Lincoln',
        state: 'TX',
        clerkOrgId: `dev_${Date.now()}`,
      }).returning();
      if (!program) throw new Error('Failed to create program');
      programId = program.id;
      programName = program.name;

      // Season
      await db.insert(seasons).values({ programId, year: 2026 });

      // Players
      const roster = [
        { firstName: 'Marcus', lastName: 'Williams', jerseyNumber: 7, positions: ['QB'], grade: 'SR' },
        { firstName: 'Jaylen', lastName: 'Carter', jerseyNumber: 2, positions: ['RB'], grade: 'JR' },
        { firstName: 'Trevon', lastName: 'Adams', jerseyNumber: 1, positions: ['WR'], grade: 'SR' },
        { firstName: 'Kyler', lastName: 'Thompson', jerseyNumber: 11, positions: ['WR'], grade: 'JR' },
        { firstName: 'Bryce', lastName: 'Mitchell', jerseyNumber: 88, positions: ['TE'], grade: 'SR' },
        { firstName: 'Derek', lastName: 'Jones', jerseyNumber: 55, positions: ['OL'], grade: 'SR' },
        { firstName: 'Andre', lastName: 'Smith', jerseyNumber: 24, positions: ['CB'], grade: 'JR' },
        { firstName: 'Malik', lastName: 'Brown', jerseyNumber: 34, positions: ['LB'], grade: 'SR' },
        { firstName: 'Darius', lastName: 'Johnson', jerseyNumber: 9, positions: ['S'], grade: 'JR' },
        { firstName: 'Tyler', lastName: 'Davis', jerseyNumber: 44, positions: ['DL'], grade: 'SR' },
      ];
      for (const p of roster) {
        await db.insert(players).values({
          programId,
          ...p,
          joinCode: Math.random().toString(36).slice(2, 8).toUpperCase(),
          joinCodeExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        });
      }
    }

    // Create opponents if needed
    const existingOpps = await db.select({ id: opponents.id }).from(opponents).where(eq(opponents.programId, programId));
    let jeffersonId: string;
    let rooseveltId: string;

    if (existingOpps.length >= 2) {
      jeffersonId = existingOpps[0]!.id;
      rooseveltId = existingOpps[1]!.id;
    } else {
      const opps = await db.insert(opponents).values([
        { programId, name: 'Jefferson Eagles', city: 'Jefferson', state: 'TX' },
        { programId, name: 'Roosevelt Panthers', city: 'Roosevelt', state: 'TX' },
      ]).returning();
      jeffersonId = opps[0]!.id;
      rooseveltId = opps[1]!.id;
    }

    // Create games if needed
    const existingGames = await db.select({ id: games.id, opponentId: games.opponentId }).from(games).where(eq(games.programId, programId));
    let jeffersonGames: string[] = [];
    let rooseveltGames: string[] = [];

    if (existingGames.length >= 3) {
      for (const g of existingGames) {
        if (g.opponentId === jeffersonId) jeffersonGames.push(g.id);
        else if (g.opponentId === rooseveltId) rooseveltGames.push(g.id);
      }
    } else {
      // 2 games vs Jefferson, 1 vs Roosevelt
      const g1 = await db.insert(games).values([
        { programId, opponentId: jeffersonId, playedAt: new Date(2026, 8, 5), isHome: true, ourScore: 28, opponentScore: 21 },
        { programId, opponentId: jeffersonId, playedAt: new Date(2026, 8, 12), isHome: false, ourScore: 14, opponentScore: 17 },
        { programId, opponentId: rooseveltId, playedAt: new Date(2026, 8, 19), isHome: true, ourScore: 35, opponentScore: 14 },
      ]).returning();
      jeffersonGames = [g1[0]!.id, g1[1]!.id];
      rooseveltGames = [g1[2]!.id];
    }

    // Seed plays — 35 vs Jefferson (across 2 games), 30 vs Roosevelt
    const playValues: Array<Record<string, unknown>> = [];

    for (let i = 0; i < 35; i++) {
      const p = generateJeffersonPlay(i);
      const gameId = i < 18 ? jeffersonGames[0] : jeffersonGames[1] ?? jeffersonGames[0];
      const distBucket = p.distance <= 3 ? 'short' : p.distance <= 6 ? 'medium' : 'long';
      playValues.push({
        programId,
        gameId,
        playOrder: (i % 18) + 1,
        down: p.down,
        distance: p.distance,
        distanceBucket: distBucket,
        hash: pick(['Left', 'Middle', 'Right'], [33, 34, 33]),
        quarter: p.quarter,
        formation: p.formation,
        personnel: p.personnel,
        motion: p.motion,
        playType: p.playType,
        playDirection: p.playDirection,
        gainLoss: p.gainLoss,
        result: p.result,
        status: 'ready',
        coachOverride: {
          aiCoverage: p.coverage,
          aiPressure: p.pressure,
          aiDefensiveFront: pick(['4-3', '3-4', 'Nickel'], [40, 35, 25]),
          aiRouteConcept: p.playType === 'pass' ? pick(['Mesh', 'Curl-Flat', 'Post-Wheel', 'Slants', 'Four Verts', 'Dig'], [20, 20, 15, 20, 10, 15]) : null,
          seeded: true,
        },
      });
    }

    for (let i = 0; i < 30; i++) {
      const p = generateRooseveltPlay(i);
      const gameId = rooseveltGames[0];
      const distBucket = p.distance <= 3 ? 'short' : p.distance <= 6 ? 'medium' : 'long';
      playValues.push({
        programId,
        gameId,
        playOrder: i + 1,
        down: p.down,
        distance: p.distance,
        distanceBucket: distBucket,
        hash: pick(['Left', 'Middle', 'Right'], [33, 34, 33]),
        quarter: p.quarter,
        formation: p.formation,
        personnel: p.personnel,
        motion: p.motion,
        playType: p.playType,
        playDirection: p.playDirection,
        gainLoss: p.gainLoss,
        result: p.result,
        status: 'ready',
        coachOverride: {
          aiCoverage: p.coverage,
          aiPressure: p.pressure,
          aiDefensiveFront: pick(['4-3', '3-4', 'Nickel', 'Bear'], [30, 30, 25, 15]),
          aiRouteConcept: p.playType === 'pass' ? pick(['Mesh', 'Curl-Flat', 'Post-Wheel', 'Slants', 'Screen', 'Y-Cross'], [15, 20, 15, 20, 15, 15]) : null,
          seeded: true,
        },
      });
    }

    // Insert all plays
    for (const pv of playValues) {
      await db.insert(plays).values(pv as typeof plays.$inferInsert);
    }
  }

  const html = `<!DOCTYPE html>
<html><head><title>Dev Bypass</title></head>
<body style="background:#0a0e17;color:white;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<div style="text-align:center">
<p style="font-size:14px;opacity:0.6;text-transform:uppercase;letter-spacing:3px">Setting up dev environment...</p>
<p style="font-size:12px;opacity:0.4;margin-top:8px">65 plays seeded across 3 games</p>
<script>
localStorage.setItem('audible_program_id','${programId}');
localStorage.setItem('audible_program_name','${programName}');
localStorage.setItem('audible_program_level','hs');
window.location.href='/hub';
</script>
</div>
</body></html>`;

  return new Response(html, { headers: { 'Content-Type': 'text/html' } });
}
