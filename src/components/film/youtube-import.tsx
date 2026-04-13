'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * YouTube Film Import — mark plays from any YouTube game film.
 *
 * Flow:
 *   1. Paste a YouTube URL
 *   2. Select the game/opponent
 *   3. Watch the video and click "Mark Play" at each snap
 *   4. Tag each play (down, distance, formation, play type, result)
 *   5. Save all plays to the database
 *
 * No downloading. The YouTube embed serves as the clip source.
 * Play records store the YouTube video ID + start/end timestamps.
 */

interface MarkedPlay {
  startSeconds: number;
  endSeconds: number | null;
  down: number;
  distance: number;
  formation: string;
  playType: string;
  playDirection: string;
  gainLoss: number;
  result: string;
}

const FORMATIONS = ['Shotgun', 'Pistol', 'Under Center', 'I-Form', 'Singleback', 'Spread', 'Trips Rt', 'Trips Lt', 'Empty', 'Wildcat'];
const PLAY_TYPES = ['Run', 'Pass', 'RPO', 'Screen', 'Play Action', 'QB Run', 'Punt', 'FG', 'XP'];
const RESULTS = ['Gain', 'No Gain', 'First Down', 'Touchdown', 'Incomplete', 'Sack', 'Interception', 'Fumble', 'Penalty'];
const DIRECTIONS = ['Left', 'Right', 'Middle'];

interface YouTubeImportProps {
  programId: string;
  games: Array<{ id: string; opponentName: string | null }>;
  onComplete: () => void;
}

export function YouTubeImport({ programId, games, onComplete }: YouTubeImportProps) {
  const [url, setUrl] = useState('');
  const [videoId, setVideoId] = useState<string | null>(null);
  const [selectedGameId, setSelectedGameId] = useState('');
  const [markedPlays, setMarkedPlays] = useState<MarkedPlay[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [isMarking, setIsMarking] = useState(false);
  const [markStart, setMarkStart] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const playerRef = useRef<HTMLIFrameElement>(null);

  // Extract YouTube video ID from URL
  function handleLoadVideo() {
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([a-zA-Z0-9_-]{11})/);
    if (match?.[1]) {
      setVideoId(match[1]);
      setError(null);
    } else {
      setError('Invalid YouTube URL. Paste a link like https://youtube.com/watch?v=...');
    }
  }

  // Start marking a play
  function handleStartMark() {
    setMarkStart(currentTime);
    setIsMarking(true);
  }

  // End marking and add play
  function handleEndMark(playData: Omit<MarkedPlay, 'startSeconds' | 'endSeconds'>) {
    if (markStart === null) return;

    setMarkedPlays((prev) => [
      ...prev,
      {
        ...playData,
        startSeconds: markStart,
        endSeconds: currentTime,
      },
    ]);
    setMarkStart(null);
    setIsMarking(false);
  }

  // Save all marked plays to the database
  async function handleSave() {
    if (!selectedGameId || markedPlays.length === 0 || !videoId) return;
    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/ingest/youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programId,
          gameId: selectedGameId,
          videoId,
          plays: markedPlays,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to save plays');
      }

      const data = await res.json();
      onComplete();
      setMarkedPlays([]);
      setVideoId(null);
      setUrl('');
      alert(`Imported ${data.playCount} plays from YouTube!`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  }

  // Update current time from the iframe (poll-based since we can't use postMessage easily)
  function handleTimeUpdate() {
    // We'll use a simple manual time input since YouTube iframe API is complex
    const input = prompt('Current video time (in seconds):');
    if (input) setCurrentTime(Number(input));
  }

  return (
    <div className="space-y-5">
      {/* Step 1: URL input */}
      {!videoId && (
        <div className="glass-card rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500/10 border border-red-500/20">
              <svg className="h-4 w-4 text-red-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z"/>
                <path d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" fill="#fff"/>
              </svg>
            </div>
            <div>
              <p className="font-display text-sm font-semibold text-white">Import from YouTube</p>
              <p className="text-xs text-slate-500">Paste any game film URL and mark plays</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="font-display text-[10px] uppercase tracking-widest text-slate-500">Game</Label>
            <select
              value={selectedGameId}
              onChange={(e) => setSelectedGameId(e.target.value)}
              required
              className="flex h-10 w-full rounded-lg border border-slate-700/50 bg-white/[0.03] px-3 text-sm text-foreground focus:outline-none focus:border-primary/50"
            >
              <option value="">Select game...</option>
              {games.map((g) => (
                <option key={g.id} value={g.id}>{g.opponentName ?? 'Unknown'}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=..."
              className="h-10 bg-white/[0.03] border-slate-700/50 focus:border-primary/50"
            />
            <Button onClick={handleLoadVideo} disabled={!url || !selectedGameId}
              className="h-10 bg-red-600 hover:bg-red-500 font-display text-xs uppercase tracking-widest">
              Load
            </Button>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-2">
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Video player + marking */}
      {videoId && (
        <div className="space-y-4">
          {/* YouTube embed */}
          <div className="relative rounded-xl overflow-hidden glow-blue">
            <iframe
              ref={playerRef}
              width="100%"
              height="400"
              src={`https://www.youtube.com/embed/${videoId}?enablejsapi=1&rel=0`}
              title="Game Film"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
              allowFullScreen
              className="rounded-xl"
            />
          </div>

          {/* Marking controls */}
          <div className="glass-card rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <p className="font-display text-[10px] uppercase tracking-widest text-slate-500">
                  {markedPlays.length} plays marked
                </p>
                <button
                  type="button"
                  onClick={handleTimeUpdate}
                  className="text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  Set time: {currentTime}s
                </button>
              </div>

              {!isMarking ? (
                <Button onClick={handleStartMark} size="sm"
                  className="bg-emerald-600 hover:bg-emerald-500 font-display text-[10px] uppercase tracking-widest">
                  Mark Play Start ({currentTime}s)
                </Button>
              ) : (
                <p className="font-display text-xs text-amber-400 animate-pulse">
                  Marking from {markStart}s... click "Set time" then tag the play below
                </p>
              )}
            </div>

            {/* Quick tag form (shown when marking) */}
            {isMarking && (
              <QuickTagForm
                onSubmit={(data) => handleEndMark(data)}
                onCancel={() => { setIsMarking(false); setMarkStart(null); }}
              />
            )}
          </div>

          {/* Marked plays list */}
          {markedPlays.length > 0 && (
            <div className="glass-card rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-display text-[10px] uppercase tracking-widest text-slate-500">
                  Marked Plays ({markedPlays.length})
                </p>
                <div className="flex gap-2">
                  <Button onClick={() => setMarkedPlays([])} variant="ghost" size="sm"
                    className="font-display text-[10px] uppercase tracking-widest text-slate-500">
                    Clear All
                  </Button>
                  <Button onClick={handleSave} disabled={isSaving} size="sm"
                    className="bg-primary hover:bg-primary/90 font-display text-[10px] uppercase tracking-widest">
                    {isSaving ? 'Saving...' : `Save ${markedPlays.length} Plays`}
                  </Button>
                </div>
              </div>

              <div className="max-h-48 overflow-y-auto space-y-1">
                {markedPlays.map((play, i) => (
                  <div key={i} className="flex items-center gap-3 px-2 py-1.5 rounded text-xs border-b border-slate-800/50 last:border-0">
                    <span className="font-display text-[10px] font-bold text-primary w-6">#{i + 1}</span>
                    <span className="text-slate-500 w-16">{play.startSeconds}s-{play.endSeconds}s</span>
                    <span className="text-slate-300">{play.down}&{play.distance}</span>
                    <span className="text-slate-400">{play.formation}</span>
                    <span className={`ml-auto ${play.playType === 'Run' ? 'text-amber-400' : 'text-blue-400'}`}>
                      {play.playType}
                    </span>
                    <span className={play.gainLoss >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                      {play.gainLoss > 0 ? '+' : ''}{play.gainLoss}
                    </span>
                  </div>
                ))}
              </div>

              {error && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-2">
                  <p className="text-xs text-destructive">{error}</p>
                </div>
              )}
            </div>
          )}

          {/* Close video */}
          <Button onClick={() => { setVideoId(null); setUrl(''); setMarkedPlays([]); }}
            variant="ghost" className="font-display text-[10px] uppercase tracking-widest text-slate-500">
            Close Video
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Quick tag form ─────────────────────────────────────────

function QuickTagForm({ onSubmit, onCancel }: {
  onSubmit: (data: Omit<MarkedPlay, 'startSeconds' | 'endSeconds'>) => void;
  onCancel: () => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        onSubmit({
          down: Number(form.get('down') ?? 1),
          distance: Number(form.get('distance') ?? 10),
          formation: (form.get('formation') as string) ?? 'Shotgun',
          playType: (form.get('playType') as string) ?? 'Run',
          playDirection: (form.get('playDirection') as string) ?? 'Middle',
          gainLoss: Number(form.get('gainLoss') ?? 0),
          result: (form.get('result') as string) ?? 'Gain',
        });
      }}
      className="grid grid-cols-4 gap-2"
    >
      <div>
        <select name="down" defaultValue="1" className="flex h-8 w-full rounded border border-slate-700/50 bg-white/[0.03] px-2 text-xs text-foreground">
          {[1, 2, 3, 4].map((d) => <option key={d} value={d}>{d}st/nd/rd/th</option>)}
        </select>
      </div>
      <div>
        <select name="distance" defaultValue="10" className="flex h-8 w-full rounded border border-slate-700/50 bg-white/[0.03] px-2 text-xs text-foreground">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 'G'].map((d) => <option key={d} value={d === 'G' ? 0 : d}>{d === 'G' ? 'Goal' : `& ${d}`}</option>)}
        </select>
      </div>
      <div>
        <select name="formation" defaultValue="Shotgun" className="flex h-8 w-full rounded border border-slate-700/50 bg-white/[0.03] px-2 text-xs text-foreground">
          {FORMATIONS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>
      <div>
        <select name="playType" defaultValue="Run" className="flex h-8 w-full rounded border border-slate-700/50 bg-white/[0.03] px-2 text-xs text-foreground">
          {PLAY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div>
        <select name="playDirection" defaultValue="Middle" className="flex h-8 w-full rounded border border-slate-700/50 bg-white/[0.03] px-2 text-xs text-foreground">
          {DIRECTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
      <div>
        <Input name="gainLoss" type="number" defaultValue={0} placeholder="Yards"
          className="h-8 text-xs bg-white/[0.03] border-slate-700/50" />
      </div>
      <div>
        <select name="result" defaultValue="Gain" className="flex h-8 w-full rounded border border-slate-700/50 bg-white/[0.03] px-2 text-xs text-foreground">
          {RESULTS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <div className="flex gap-1">
        <Button type="submit" size="sm" className="flex-1 h-8 bg-emerald-600 hover:bg-emerald-500 text-[10px]">
          Save
        </Button>
        <Button type="button" onClick={onCancel} variant="ghost" size="sm" className="h-8 text-[10px]">
          X
        </Button>
      </div>
    </form>
  );
}
