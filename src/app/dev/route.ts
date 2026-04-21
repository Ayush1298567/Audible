import { db } from '@/lib/db/client';
import { programs, seasons, players, opponents, games } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';

/**
 * GET /dev — instant dev bypass.
 *
 * Creates a program + opponents + games if none exist,
 * sets a cookie with the program ID, and redirects to /hub.
 * Skips sign-up, setup wizard, everything.
 */
export async function GET(): Promise<Response> {
  // Check if a program exists
  const existing = await db.select({ id: programs.id, name: programs.name }).from(programs).limit(1);

  let programId: string;
  let programName: string;

  const first = existing[0];
  if (first) {
    programId = first.id;
    programName = first.name;
  } else {
    // Create program
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

    // Create season
    await db.insert(seasons).values({ programId, year: 2025 });

    // Create opponents
    const opps = await db.insert(opponents).values([
      { programId, name: 'Jefferson Eagles', city: 'Jefferson', state: 'TX' },
      { programId, name: 'Roosevelt Panthers', city: 'Roosevelt', state: 'TX' },
    ]).returning();

    // Create games
    if (opps[0]) {
      await db.insert(games).values({
        programId,
        opponentId: opps[0].id,
        playedAt: new Date(2025, 8, 12),
        isHome: true,
      });
    }
    if (opps[1]) {
      await db.insert(games).values({
        programId,
        opponentId: opps[1].id,
        playedAt: new Date(2025, 8, 19),
        isHome: false,
      });
    }

    // Create a few players
    const roster = [
      { firstName: 'Marcus', lastName: 'Williams', jerseyNumber: 7, positions: ['QB'], grade: 'SR' },
      { firstName: 'Jaylen', lastName: 'Carter', jerseyNumber: 2, positions: ['RB'], grade: 'JR' },
      { firstName: 'Trevon', lastName: 'Adams', jerseyNumber: 1, positions: ['WR'], grade: 'SR' },
      { firstName: 'Kyler', lastName: 'Thompson', jerseyNumber: 11, positions: ['WR'], grade: 'JR' },
      { firstName: 'Bryce', lastName: 'Mitchell', jerseyNumber: 88, positions: ['TE'], grade: 'SR' },
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

  // Return HTML that sets localStorage and redirects
  const html = `<!DOCTYPE html>
<html><head><title>Dev Bypass</title></head>
<body style="background:#0a0e17;color:white;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<div style="text-align:center">
<p style="font-size:14px;opacity:0.6;text-transform:uppercase;letter-spacing:3px">Setting up dev environment...</p>
<script>
localStorage.setItem('audible_program_id','${programId}');
localStorage.setItem('audible_program_name','${programName}');
window.location.href='/hub';
</script>
</div>
</body></html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html' },
  });
}
