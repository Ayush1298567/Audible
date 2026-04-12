'use client';

import { useEffect, useRef } from 'react';
import type { PlayState, } from '@/lib/simulation/engine';

/**
 * 2D top-down football field canvas renderer.
 *
 * Draws:
 *   - Green turf with white yard lines and hash marks
 *   - All 22 players as colored circles with jersey numbers
 *   - Line of scrimmage
 *   - First down marker
 *   - Route trails for receivers during play phase
 *
 * The canvas maps football coordinates (0-100 x 0-53.3 yards)
 * to pixel coordinates on the canvas.
 */

interface FieldCanvasProps {
  state: PlayState;
  width?: number;
  height?: number;
}

// Yards to show on screen (zoomed to play area, not full 100)
const VIEW_YARDS_X = 40;
const VIEW_YARDS_Y = 53.3;

export function FieldCanvas({ state, width = 800, height = 500 }: FieldCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trailsRef = useRef<Map<string, Array<{ x: number; y: number }>>>(new Map());

  // Track player trails
  useEffect(() => {
    if (state.phase === 'pre_snap') {
      trailsRef.current = new Map();
    }
    if (state.phase === 'play') {
      for (const player of state.players) {
        if (player.team === 'offense' && player.position === 'WR') {
          const trail = trailsRef.current.get(player.id) ?? [];
          trail.push({ x: player.x, y: player.y });
          trailsRef.current.set(player.id, trail);
        }
      }
    }
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set up coordinate transform: football yards → canvas pixels
    const viewStartX = state.losX - 15; // center the LOS with some backfield view
    const scaleX = width / VIEW_YARDS_X;
    const scaleY = height / VIEW_YARDS_Y;

    function toPixelX(yards: number): number {
      return (yards - viewStartX) * scaleX;
    }
    function toPixelY(yards: number): number {
      return (VIEW_YARDS_Y - yards) * scaleY; // flip Y (top = far sideline)
    }

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Draw field (green turf)
    ctx.fillStyle = '#2d5a27';
    ctx.fillRect(0, 0, width, height);

    // Draw yard lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    for (let yard = 0; yard <= 100; yard += 5) {
      const x = toPixelX(yard);
      if (x < 0 || x > width) continue;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();

      // Yard numbers
      if (yard % 10 === 0 && yard > 0 && yard < 100) {
        const label = yard <= 50 ? yard : 100 - yard;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(label), x, height / 2 - 15);
        ctx.fillText(String(label), x, height / 2 + 25);
      }
    }

    // Draw hash marks
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    const hashY1 = toPixelY(23.58); // college hash
    const hashY2 = toPixelY(29.72);
    for (let yard = 0; yard <= 100; yard += 1) {
      const x = toPixelX(yard);
      if (x < 0 || x > width) continue;
      ctx.beginPath();
      ctx.moveTo(x - 2, hashY1);
      ctx.lineTo(x + 2, hashY1);
      ctx.moveTo(x - 2, hashY2);
      ctx.lineTo(x + 2, hashY2);
      ctx.stroke();
    }

    // Draw LOS
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    const losPixelX = toPixelX(state.losX);
    ctx.beginPath();
    ctx.moveTo(losPixelX, 0);
    ctx.lineTo(losPixelX, height);
    ctx.stroke();

    // Draw first down line
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 2;
    const firstDownX = toPixelX(state.losX + state.distance);
    ctx.beginPath();
    ctx.moveTo(firstDownX, 0);
    ctx.lineTo(firstDownX, height);
    ctx.stroke();

    // Draw route trails
    ctx.lineWidth = 1.5;
    for (const [playerId, trail] of trailsRef.current) {
      if (trail.length < 2) continue;
      const player = state.players.find((p) => p.id === playerId);
      ctx.strokeStyle = player?.color ? `${player.color}88` : '#2563eb88';
      ctx.beginPath();
      ctx.moveTo(toPixelX(trail[0]?.x ?? 0), toPixelY(trail[0]?.y ?? 0));
      for (let i = 1; i < trail.length; i++) {
        ctx.lineTo(toPixelX(trail[i]?.x ?? 0), toPixelY(trail[i]?.y ?? 0));
      }
      ctx.stroke();
    }

    // Draw players
    for (const player of state.players) {
      const px = toPixelX(player.x);
      const py = toPixelY(player.y);

      // Skip if off screen
      if (px < -20 || px > width + 20 || py < -20 || py > height + 20) continue;

      // Circle
      const radius = 12;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fillStyle = player.color;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Jersey number
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(player.jerseyNumber), px, py);
    }

    // Phase indicator
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const phaseLabel = {
      pre_snap: 'PRE-SNAP',
      snap: 'SNAP',
      play: 'LIVE',
      result: 'RESULT',
    }[state.phase];
    ctx.fillText(
      `${phaseLabel} | ${state.down}${ordinal(state.down)} & ${state.distance} | ${state.coverageShell.replace('_', ' ').toUpperCase()}`,
      10,
      10,
    );
  }, [state, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="w-full rounded-lg border border-border"
      style={{ imageRendering: 'auto' }}
    />
  );
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] ?? s[v] ?? s[0] ?? '';
}
