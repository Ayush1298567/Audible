'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Auto-Analyze YouTube — one button, zero manual work.
 *
 * Paste a URL, pick a game, click a button. Claude watches the film
 * and auto-detects plays with full tagging.
 */

interface AutoAnalyzeProps {
  programId: string;
  games: Array<{ id: string; opponentName: string | null }>;
  onComplete: () => void;
}

export function AutoAnalyze({ programId, games, onComplete }: AutoAnalyzeProps) {
  const [url, setUrl] = useState('');
  const [gameId, setGameId] = useState('');
  const [startSeconds, setStartSeconds] = useState(0);
  const [durationMinutes, setDurationMinutes] = useState(5);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAnalyze() {
    if (!url || !gameId) return;
    setIsAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/auto-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programId,
          gameId,
          youtubeUrl: url,
          startSeconds,
          durationSeconds: durationMinutes * 60,
          sampleInterval: 25,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Analysis failed');
      }

      const data = await res.json();
      setResult(data.message);
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsAnalyzing(false);
    }
  }

  return (
    <div className="glass-card rounded-xl p-5 space-y-4 border-l-2 border-l-cyan-500/50">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10 border border-cyan-500/20">
          <svg className="h-4 w-4 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
        </div>
        <div>
          <p className="font-display text-sm font-semibold text-white">AI Auto-Analyze</p>
          <p className="text-xs text-slate-500">Claude watches the film and tags every play. Zero manual work.</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="font-display text-[10px] uppercase tracking-widest text-slate-500">Game</Label>
        <select
          value={gameId}
          onChange={(e) => setGameId(e.target.value)}
          className="flex h-10 w-full rounded-lg border border-slate-700/50 bg-white/[0.03] px-3 text-sm text-foreground focus:outline-none focus:border-cyan-500/50"
        >
          <option value="">Select game...</option>
          {games.map((g) => (
            <option key={g.id} value={g.id}>{g.opponentName ?? 'Unknown'}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label className="font-display text-[10px] uppercase tracking-widest text-slate-500">YouTube URL</Label>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://youtube.com/watch?v=..."
          className="h-10 bg-white/[0.03] border-slate-700/50 focus:border-cyan-500/50"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="font-display text-[10px] uppercase tracking-widest text-slate-500">Start at (min)</Label>
          <Input
            type="number"
            value={Math.floor(startSeconds / 60)}
            onChange={(e) => setStartSeconds(Number(e.target.value) * 60)}
            min={0}
            className="h-10 bg-white/[0.03] border-slate-700/50"
          />
        </div>
        <div className="space-y-2">
          <Label className="font-display text-[10px] uppercase tracking-widest text-slate-500">Analyze (min)</Label>
          <Input
            type="number"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value))}
            min={1}
            max={30}
            className="h-10 bg-white/[0.03] border-slate-700/50"
          />
        </div>
      </div>

      <p className="text-[10px] text-slate-500">
        Sampling a frame every 25s. {durationMinutes} min = ~{Math.ceil(durationMinutes * 60 / 25)} frames. Cost: ~${(Math.ceil(durationMinutes * 60 / 25) * 0.003).toFixed(2)}. Takes ~{Math.ceil(durationMinutes * 60 / 25 * 5 / 60)} min.
      </p>

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-2">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {result && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-2">
          <p className="text-xs text-emerald-400">{result}</p>
        </div>
      )}

      <Button
        onClick={handleAnalyze}
        disabled={isAnalyzing || !url || !gameId}
        className="w-full h-11 bg-cyan-600 hover:bg-cyan-500 text-white font-display text-xs uppercase tracking-widest"
      >
        {isAnalyzing ? (
          <span className="flex items-center gap-2">
            <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Claude is analyzing the game film...
          </span>
        ) : (
          'Start AI Auto-Analysis'
        )}
      </Button>
    </div>
  );
}
