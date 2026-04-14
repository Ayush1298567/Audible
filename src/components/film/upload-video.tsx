'use client';

import { useState, useRef } from 'react';
import { upload } from '@vercel/blob/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

/**
 * Upload Video — drag and drop a game film MP4, AI analyzes it.
 *
 * Flow:
 *   1. Drag & drop or click to select
 *   2. Video uploads directly to Vercel Blob (client-side, no 4.5MB limit)
 *   3. Trigger AI analysis on the uploaded blob
 *   4. Claude detects plays and saves them to DB
 */

interface Props {
  programId: string;
  games: Array<{ id: string; opponentName: string | null }>;
  onComplete: () => void;
}

type Phase = 'idle' | 'uploading' | 'analyzing' | 'done' | 'error';

export function UploadVideo({ programId, games, onComplete }: Props) {
  const [gameId, setGameId] = useState(games[0]?.id ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [startMin, setStartMin] = useState(0);
  const [durMin, setDurMin] = useState(5);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit() {
    if (!file || !gameId) return;
    setError(null);
    setPhase('uploading');
    setProgress(0);
    setStatus('Uploading video to Vercel Blob...');

    try {
      // Step 1: Upload to Blob via client-side upload
      const blob = await upload(file.name, file, {
        access: 'public',
        handleUploadUrl: '/api/upload-video',
        clientPayload: JSON.stringify({ programId, gameId }),
        onUploadProgress: ({ percentage }) => {
          setProgress(percentage);
        },
      });

      setPhase('analyzing');
      setProgress(0);
      setStatus('Gemini is watching the full film and detecting plays...');

      // Step 2: Start the durable workflow
      const kickoffRes = await fetch('/api/analyze-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programId,
          gameId,
          blobUrl: blob.url,
        }),
      });

      if (!kickoffRes.ok) {
        const data = await kickoffRes.json();
        throw new Error(data.error ?? 'Failed to start analysis');
      }

      const { runId } = await kickoffRes.json();
      const startedAt = new Date().toISOString();

      // Step 3: Poll status until workflow completes
      const pollInterval = 5000; // 5s
      let done = false;

      while (!done) {
        await new Promise((r) => setTimeout(r, pollInterval));

        const statusRes = await fetch(
          `/api/analyze-video/status?runId=${encodeURIComponent(runId)}&programId=${programId}&gameId=${gameId}&since=${encodeURIComponent(startedAt)}`,
        );

        if (!statusRes.ok) continue;

        const s = await statusRes.json();
        setStatus(`Workflow ${s.status} · ${s.playsSaved ?? 0} plays saved so far`);

        // Refresh the play list as plays come in
        onComplete();

        if (s.status === 'completed') {
          setPhase('done');
          setStatus(`Analysis complete — ${s.playsSaved ?? 0} plays detected and saved.`);
          done = true;
        } else if (s.status === 'failed' || s.status === 'cancelled') {
          throw new Error(`Workflow ${s.status}`);
        }
      }
    } catch (err) {
      setPhase('error');
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  }

  function handleReset() {
    setFile(null);
    setPhase('idle');
    setProgress(0);
    setStatus('');
    setError(null);
  }

  const isBusy = phase === 'uploading' || phase === 'analyzing';

  return (
    <div className="glass-card rounded-xl p-5 space-y-4 border-l-2 border-l-cyan-500/50">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10 border border-cyan-500/20">
          <svg className="h-4 w-4 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <div>
          <p className="font-display text-sm font-semibold text-white">Upload & AI Analyze</p>
          <p className="text-xs text-slate-500">Drop a game film video. Claude auto-detects every play.</p>
        </div>
      </div>

      {/* Game selector */}
      <div className="space-y-2">
        <Label className="font-display text-[10px] uppercase tracking-widest text-slate-500">Game</Label>
        <select value={gameId} onChange={(e) => setGameId(e.target.value)}
          disabled={isBusy}
          className="flex h-10 w-full rounded-lg border border-slate-700/50 bg-white/[0.03] px-3 text-sm text-foreground focus:outline-none focus:border-cyan-500/50 disabled:opacity-50">
          <option value="">Select game...</option>
          {games.map((g) => <option key={g.id} value={g.id}>{g.opponentName ?? 'Unknown'}</option>)}
        </select>
      </div>

      {/* Drop zone */}
      {phase === 'idle' && (
        <>
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: drag and drop area */}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: drag and drop area */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`relative rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all ${
              dragActive
                ? 'border-cyan-500/60 bg-cyan-500/10'
                : file
                  ? 'border-emerald-500/40 bg-emerald-500/5'
                  : 'border-slate-700/50 bg-white/[0.02] hover:border-slate-600/60 hover:bg-white/[0.04]'
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept="video/mp4,video/quicktime,video/x-matroska,video/webm"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <div className="space-y-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/15 mx-auto">
                  <svg className="h-4 w-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <p className="text-sm text-emerald-300 font-medium">{file.name}</p>
                <p className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(1)} MB · click or drop another to replace</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800/60 border border-slate-700/50 mx-auto">
                  <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="23 7 16 12 23 17 23 7" />
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                  </svg>
                </div>
                <p className="text-sm text-slate-300 font-medium">Drop video here or click to select</p>
                <p className="text-xs text-slate-500">MP4, MOV, MKV, WebM · Max 500MB</p>
              </div>
            )}
          </div>

          {/* Analysis settings */}
          {file && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="font-display text-[10px] uppercase tracking-widest text-slate-500">Start (min)</Label>
                <Input type="number" value={startMin} onChange={(e) => setStartMin(Number(e.target.value))}
                  min={0} className="h-10 bg-white/[0.03] border-slate-700/50" />
              </div>
              <div className="space-y-2">
                <Label className="font-display text-[10px] uppercase tracking-widest text-slate-500">Analyze (min)</Label>
                <Input type="number" value={durMin} onChange={(e) => setDurMin(Number(e.target.value))}
                  min={1} max={10} className="h-10 bg-white/[0.03] border-slate-700/50" />
              </div>
            </div>
          )}

          {file && (
            <p className="text-[10px] text-slate-500">
              {durMin} min × ~2.4 frames/min = ~{Math.ceil(durMin * 60 / 25)} frames × $0.003 = ~${(Math.ceil(durMin * 60 / 25) * 0.003).toFixed(2)}.
              Takes ~{Math.ceil(durMin * 60 / 25 * 4 / 60)} minutes.
            </p>
          )}
        </>
      )}

      {/* Progress UI */}
      {isBusy && (
        <div className="rounded-xl bg-slate-900/50 border border-slate-700/50 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <svg className="h-4 w-4 animate-spin text-cyan-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <p className="font-display text-xs uppercase tracking-widest text-cyan-400">
              {phase === 'uploading' ? 'Uploading' : 'Analyzing with Claude'}
            </p>
          </div>
          <p className="text-sm text-slate-300">{status}</p>
          {phase === 'uploading' && (
            <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full bg-cyan-400 transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>
      )}

      {/* Done */}
      {phase === 'done' && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 flex items-start gap-3">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
            <svg className="h-3 w-3 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-sm text-emerald-300 font-medium">Analysis Complete</p>
            <p className="text-xs text-emerald-400/80 mt-0.5">{status}</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {/* Buttons */}
      <div className="flex gap-2">
        {phase === 'idle' && (
          <Button
            onClick={handleSubmit}
            disabled={!file || !gameId}
            className="flex-1 h-11 bg-cyan-600 hover:bg-cyan-500 text-white font-display text-xs uppercase tracking-widest"
          >
            Upload & Analyze
          </Button>
        )}
        {(phase === 'done' || phase === 'error') && (
          <Button
            onClick={handleReset}
            variant="outline"
            className="flex-1 h-11 font-display text-xs uppercase tracking-widest"
          >
            Upload Another
          </Button>
        )}
      </div>
    </div>
  );
}
