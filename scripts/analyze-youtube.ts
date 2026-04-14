#!/usr/bin/env bun
/**
 * Analyze a YouTube game film locally and upload results to Audible.
 *
 * Flow:
 *   1. yt-dlp downloads the video to /tmp
 *   2. ffmpeg samples frames at intervals
 *   3. Each frame is sent to the Audible API → Claude vision
 *   4. Detected plays are saved to your program's database
 *
 * Usage:
 *   bun scripts/analyze-youtube.ts <youtube-url> [start-minutes] [duration-minutes]
 *
 * Example:
 *   bun scripts/analyze-youtube.ts https://youtube.com/watch?v=R0vPvIgVBZo 10 5
 *   (analyzes minutes 10-15 of the video)
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, unlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

const execFileAsync = promisify(execFile);

const SITE = process.env.AUDIBLE_URL ?? 'https://audible-rosy.vercel.app';
const SAMPLE_INTERVAL = 25; // seconds between frames

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.log('Usage: bun scripts/analyze-youtube.ts <youtube-url> [start-minutes] [duration-minutes]');
    process.exit(1);
  }

  const youtubeUrl = args[0]!;
  const startMinutes = Number(args[1] ?? 0);
  const durationMinutes = Number(args[2] ?? 10);

  console.log(`\n🎬 Analyzing: ${youtubeUrl}`);
  console.log(`   Start: ${startMinutes} min, Duration: ${durationMinutes} min\n`);

  // Step 1: Get program + game from the Audible DB
  console.log('1️⃣  Fetching your program...');
  const programsRes = await fetch(`${SITE}/api/programs`);
  const programsData = await programsRes.json();
  const program = programsData.programs?.[0];
  if (!program) {
    console.error('❌ No program found. Visit /dev first to create one.');
    process.exit(1);
  }
  console.log(`   Program: ${program.name}`);

  const gamesRes = await fetch(`${SITE}/api/games?programId=${program.id}`);
  const gamesData = await gamesRes.json();
  const game = gamesData.games?.[0];
  if (!game) {
    console.error('❌ No games found. Create a game first.');
    process.exit(1);
  }
  console.log(`   Game: vs ${game.opponentName}\n`);

  // Step 2: Download video with yt-dlp
  console.log('2️⃣  Downloading video (this takes a minute)...');
  const workDir = join(tmpdir(), `audible-${randomUUID()}`);
  await execFileAsync('mkdir', ['-p', workDir]);

  const videoPath = join(workDir, 'video.mp4');
  const startSeconds = startMinutes * 60;
  const endSeconds = startSeconds + durationMinutes * 60;

  // Download only the segment we need using yt-dlp + ffmpeg
  try {
    // Get stream URL
    const { stdout: streamUrl } = await execFileAsync('yt-dlp', [
      '-g', '-f', 'best[height<=480]',
      youtubeUrl,
    ]);

    // Use ffmpeg to download just the segment we want
    await execFileAsync('ffmpeg', [
      '-y',
      '-ss', String(startSeconds),
      '-i', streamUrl.trim(),
      '-t', String(durationMinutes * 60),
      '-c', 'copy',
      videoPath,
    ], { timeout: 300000 });

    console.log(`   ✓ Downloaded ${durationMinutes}min segment to ${videoPath}\n`);
  } catch (e) {
    console.error('❌ Download failed:', e instanceof Error ? e.message.slice(0, 200) : e);
    process.exit(1);
  }

  // Step 3: Extract frames
  console.log('3️⃣  Extracting frames...');
  const timestamps: number[] = [];
  for (let t = 0; t < durationMinutes * 60; t += SAMPLE_INTERVAL) {
    timestamps.push(t);
  }

  const frames: Array<{ timestamp: number; buffer: Buffer }> = [];
  for (const t of timestamps) {
    const framePath = join(workDir, `frame-${t}.jpg`);
    try {
      await execFileAsync('ffmpeg', [
        '-y', '-ss', String(t), '-i', videoPath,
        '-frames:v', '1', '-q:v', '3', '-vf', 'scale=640:-1',
        '-update', '1', framePath,
      ]);
      const buf = await readFile(framePath);
      frames.push({ timestamp: startSeconds + t, buffer: buf });
      await unlink(framePath).catch(() => {});
    } catch {
      // skip bad frames
    }
  }
  console.log(`   ✓ Extracted ${frames.length} frames\n`);

  // Step 4: Upload frames to Audible API for AI analysis
  console.log('4️⃣  Sending frames to Claude for analysis...');
  console.log(`   This calls the /api/analyze-frames endpoint on Vercel.`);
  console.log(`   Each frame is ~$0.003 × ${frames.length} = ~$${(frames.length * 0.003).toFixed(2)}\n`);

  const framesPayload = frames.map((f) => ({
    timestamp: f.timestamp,
    base64: f.buffer.toString('base64'),
  }));

  const analyzeRes = await fetch(`${SITE}/api/analyze-frames`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      programId: program.id,
      gameId: game.id,
      youtubeUrl,
      frames: framesPayload,
    }),
  });

  if (!analyzeRes.ok) {
    const errorText = await analyzeRes.text();
    console.error(`❌ Analysis failed (${analyzeRes.status}):`, errorText.slice(0, 500));
    process.exit(1);
  }

  const result = await analyzeRes.json();
  console.log(`   ✓ Claude detected ${result.playsDetected} plays`);
  console.log(`   ✓ Saved ${result.playsSaved} plays to database\n`);

  console.log(`✅ Done! View them at: ${SITE}/film\n`);

  // Cleanup
  await rm(workDir, { recursive: true, force: true }).catch(() => {});
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
