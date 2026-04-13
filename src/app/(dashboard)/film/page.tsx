'use client';

import { useCallback, useEffect, useState } from 'react';
import { useProgram } from '@/lib/auth/program-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlayCard } from '@/components/ui/play-card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DrawingCanvas } from '@/components/film/drawing-canvas';
import { CorrectableTag } from '@/components/film/tag-correction';
import { CollectionsPanel } from '@/components/film/collections-panel';
import { YouTubeImport } from '@/components/film/youtube-import';

interface Play {
  id: string;
  playOrder: number;
  down: number | null;
  distance: number | null;
  distanceBucket: string | null;
  hash: string | null;
  quarter: number | null;
  formation: string | null;
  personnel: string | null;
  playType: string | null;
  playDirection: string | null;
  gainLoss: number | null;
  result: string | null;
  clipBlobKey: string | null;
  status: string;
  coachOverride: Record<string, string> | null;
  opponentName: string | null;
}

interface Game {
  id: string;
  opponentName: string | null;
}

export default function FilmRoomPage() {
  const { programId } = useProgram();
  const [plays, setPlays] = useState<Play[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [selectedPlay, setSelectedPlay] = useState<Play | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  // Collections
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<'hudl' | 'youtube'>('youtube');

  // Filters
  const [filterDown, setFilterDown] = useState<string>('all');
  const [filterFormation, setFilterFormation] = useState<string>('all');
  const [filterPlayType, setFilterPlayType] = useState<string>('all');
  const [filterQuarter, setFilterQuarter] = useState<string>('all');

  const loadGames = useCallback(async () => {
    if (!programId) return;
    const res = await fetch(`/api/games?programId=${programId}`);
    const data = await res.json();
    setGames(data.games ?? []);
  }, [programId]);

  const loadPlays = useCallback(async () => {
    if (!programId) return;
    setIsLoading(true);
    const params = new URLSearchParams({ programId });
    if (selectedGameId) params.set('gameId', selectedGameId);
    if (activeCollectionId) params.set('collectionId', activeCollectionId);
    const res = await fetch(`/api/plays?${params}`);
    const data = await res.json();
    setPlays(data.plays ?? []);
    setIsLoading(false);
  }, [programId, selectedGameId, activeCollectionId]);

  useEffect(() => { void loadGames(); }, [loadGames]);
  useEffect(() => { void loadPlays(); }, [loadPlays]);

  // Upload handler
  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!programId) return;

    const form = new FormData(e.currentTarget);
    const gameId = form.get('gameId') as string;
    if (!gameId) return;

    form.set('programId', programId);

    setIsUploading(true);
    setUploadProgress('Uploading files...');

    try {
      const res = await fetch('/api/ingest', {
        method: 'POST',
        body: form,
      });

      if (!res.ok) {
        const data = await res.json();
        setUploadProgress(`Error: ${data.message ?? data.error}`);
        return;
      }

      const data = await res.json();
      setUploadProgress(
        `Done! ${data.playCount} plays imported, ${data.clipCount} clips created.` +
        (data.warnings?.length > 0 ? ` Warnings: ${data.warnings.join(', ')}` : ''),
      );

      // Reload plays
      setSelectedGameId(gameId);
      void loadPlays();
    } catch (err) {
      setUploadProgress(`Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsUploading(false);
    }
  }

  // Tag correction handler
  async function handleTagCorrection(field: string, value: string) {
    if (!programId || !selectedPlay) return;
    const res = await fetch('/api/plays', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ programId, playId: selectedPlay.id, field, value }),
    });
    if (res.ok) {
      const data = await res.json();
      // Update local state with new override
      setSelectedPlay((prev) =>
        prev ? { ...prev, coachOverride: data.play.coachOverride } : prev,
      );
      // Also update in the plays list
      setPlays((prev) =>
        prev.map((p) =>
          p.id === selectedPlay.id ? { ...p, coachOverride: data.play.coachOverride } : p,
        ),
      );
    }
  }

  // Apply filters
  const filtered = plays.filter((p) => {
    if (filterDown !== 'all' && String(p.down) !== filterDown) return false;
    if (filterFormation !== 'all' && p.formation !== filterFormation) return false;
    if (filterPlayType !== 'all' && p.playType !== filterPlayType) return false;
    if (filterQuarter !== 'all' && String(p.quarter) !== filterQuarter) return false;
    return true;
  });

  // Unique values for filter dropdowns
  const formations = [...new Set(plays.map((p) => p.formation).filter(Boolean))] as string[];
  const playTypes = [...new Set(plays.map((p) => p.playType).filter(Boolean))] as string[];

  return (
    <div className="flex h-full gap-6">
      {/* Left panel: play grid + filters */}
      <div className="flex flex-1 flex-col space-y-5 overflow-hidden">

        {/* Page header */}
        <div className="flex items-end justify-between">
          <div>
            <p className="font-display text-xs uppercase tracking-widest text-blue-400 mb-1">
              Analysis Suite
            </p>
            <h1 className="font-display text-3xl font-bold tracking-tight text-white">
              Film Room
            </h1>
          </div>
          <div className="text-right">
            <span className="stat-number text-2xl text-blue-400">{filtered.length}</span>
            <p className="text-xs text-slate-500 mt-0.5">
              {filtered.length !== 1 ? 'plays' : 'play'}
              {plays.length !== filtered.length ? ` of ${plays.length}` : ' total'}
            </p>
          </div>
        </div>

        {/* Gradient divider */}
        <div className="h-px bg-gradient-to-r from-blue-500/50 via-cyan-500/30 to-transparent" />

        {/* Import section */}
        {/* Import mode toggle */}
        <div className="flex gap-1 rounded-lg border border-slate-700/50 bg-slate-900/60 p-0.5 w-fit">
          <button type="button" onClick={() => setImportMode('youtube')}
            className={`px-3 py-1.5 rounded-md font-display text-[10px] uppercase tracking-wider transition-all ${importMode === 'youtube' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}>
            YouTube Import
          </button>
          <button type="button" onClick={() => setImportMode('hudl')}
            className={`px-3 py-1.5 rounded-md font-display text-[10px] uppercase tracking-wider transition-all ${importMode === 'hudl' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}>
            Hudl Upload
          </button>
        </div>

        {/* YouTube import */}
        {importMode === 'youtube' && programId && (
          <YouTubeImport
            programId={programId}
            games={games.map(g => ({ id: g.id, opponentName: g.opponentName }))}
            onComplete={() => void loadPlays()}
          />
        )}

        {/* Hudl upload section */}
        {importMode === 'hudl' && games.length > 0 && (
          <div className="glass-card rounded-xl p-5 relative overflow-hidden noise-overlay">
            <div className="absolute inset-2 rounded-lg border border-dashed border-blue-500/20 pointer-events-none" />

            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <svg className="h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                </div>
                <div>
                  <p className="font-display text-sm font-semibold text-white">Import Game Film</p>
                  <p className="text-xs text-slate-500">Hudl CSV + SportsCode XML + MP4</p>
                </div>
              </div>

              <form onSubmit={handleUpload} className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="upload-game" className="font-display text-[10px] uppercase tracking-widest text-slate-400">
                    Game
                  </Label>
                  <select
                    id="upload-game"
                    name="gameId"
                    required
                    className="flex h-9 rounded-lg border border-slate-700/50 bg-slate-900/60 px-3 py-1 text-sm text-slate-200 focus:outline-none focus:border-blue-500/50 transition-colors"
                  >
                    <option value="">Select game...</option>
                    {games.map((g) => (
                      <option key={g.id} value={g.id}>{g.opponentName ?? 'Unknown'}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="upload-csv" className="font-display text-[10px] uppercase tracking-widest text-slate-400">
                    Breakdown CSV
                  </Label>
                  <Input
                    id="upload-csv"
                    name="csv"
                    type="file"
                    accept=".csv"
                    required
                    className="h-9 text-xs border-slate-700/50 bg-slate-900/60 text-slate-300 file:text-slate-400 file:bg-transparent"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="upload-xml" className="font-display text-[10px] uppercase tracking-widest text-slate-400">
                    SportsCode XML
                  </Label>
                  <Input
                    id="upload-xml"
                    name="xml"
                    type="file"
                    accept=".xml"
                    required
                    className="h-9 text-xs border-slate-700/50 bg-slate-900/60 text-slate-300 file:text-slate-400 file:bg-transparent"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="upload-mp4" className="font-display text-[10px] uppercase tracking-widest text-slate-400">
                    Concatenated MP4
                  </Label>
                  <Input
                    id="upload-mp4"
                    name="mp4"
                    type="file"
                    accept=".mp4,video/*"
                    required
                    className="h-9 text-xs border-slate-700/50 bg-slate-900/60 text-slate-300 file:text-slate-400 file:bg-transparent"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={isUploading}
                  className="h-9 bg-blue-600 hover:bg-blue-500 text-white font-display text-xs uppercase tracking-wider border-0 transition-all"
                >
                  {isUploading ? (
                    <span className="flex items-center gap-2">
                      <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Processing...
                    </span>
                  ) : 'Upload'}
                </Button>
              </form>

              {uploadProgress && (
                <div className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
                  uploadProgress.startsWith('Error')
                    ? 'bg-red-500/10 border border-red-500/20 text-red-400'
                    : uploadProgress.startsWith('Done')
                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                    : 'bg-blue-500/10 border border-blue-500/20 text-blue-400'
                }`}>
                  {uploadProgress}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Filter chips */}
        {plays.length > 0 && (
          <div className="space-y-2">
            <p className="font-display text-[10px] uppercase tracking-widest text-slate-500">Filters</p>
            <div className="flex flex-wrap gap-2">
              <FilterChip
                label="Down"
                value={filterDown}
                onChange={setFilterDown}
                options={[
                  { value: 'all', label: 'All Downs' },
                  { value: '1', label: '1st' },
                  { value: '2', label: '2nd' },
                  { value: '3', label: '3rd' },
                  { value: '4', label: '4th' },
                ]}
              />
              <FilterChip
                label="Quarter"
                value={filterQuarter}
                onChange={setFilterQuarter}
                options={[
                  { value: 'all', label: 'All Quarters' },
                  { value: '1', label: 'Q1' },
                  { value: '2', label: 'Q2' },
                  { value: '3', label: 'Q3' },
                  { value: '4', label: 'Q4' },
                ]}
              />
              {formations.length > 0 && (
                <FilterChip
                  label="Formation"
                  value={filterFormation}
                  onChange={setFilterFormation}
                  options={[{ value: 'all', label: 'All Formations' }, ...formations.map((f) => ({ value: f, label: f }))]}
                />
              )}
              {playTypes.length > 0 && (
                <FilterChip
                  label="Play Type"
                  value={filterPlayType}
                  onChange={setFilterPlayType}
                  options={[{ value: 'all', label: 'All Types' }, ...playTypes.map((t) => ({ value: t, label: t }))]}
                />
              )}
            </div>
          </div>
        )}

        {/* Collections */}
        {programId && (
          <CollectionsPanel
            programId={programId}
            selectedPlayId={selectedPlay?.id ?? null}
            onFilterByCollection={(id) => {
              setActiveCollectionId(id);
            }}
            activeCollectionId={activeCollectionId}
          />
        )}

        {/* Play grid */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center gap-3 py-8">
              <svg className="h-4 w-4 animate-spin text-blue-400" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <p className="font-display text-sm text-slate-500 uppercase tracking-wider">Loading plays...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="glass-card rounded-xl border border-dashed border-slate-700/50 flex flex-col items-center justify-center py-20 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-800/60 border border-slate-700/50 mb-4">
                <svg className="h-6 w-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75.125V8.25m0 0A2.25 2.25 0 012.25 6V3.375C2.25 2.339 3.09 1.5 4.125 1.5h15.75c1.035 0 1.875.84 1.875 1.875V6a2.25 2.25 0 01-.375 1.25M2.25 8.25H21.75" />
                </svg>
              </div>
              <p className="font-display text-base font-semibold text-slate-300">
                {plays.length === 0 ? 'No film uploaded yet' : 'No plays match your filters'}
              </p>
              <p className="mt-2 max-w-sm text-sm text-slate-500">
                {plays.length === 0
                  ? 'Add a game in the Games tab, then upload your Hudl breakdown CSV, SportsCode XML, and concatenated MP4 above.'
                  : 'Try adjusting or clearing your filters.'}
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((play, i) => (
                <div
                  key={play.id}
                  className={`animate-fade-in stagger-${Math.min((i % 6) + 1, 6) as 1 | 2 | 3 | 4 | 5 | 6}`}
                >
                  <PlayCard
                    playOrder={play.playOrder}
                    down={play.down}
                    distance={play.distance}
                    formation={play.formation}
                    playType={play.playType}
                    gainLoss={play.gainLoss}
                    isSelected={selectedPlay?.id === play.id}
                    status={play.status}
                    onClick={() => setSelectedPlay(play)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right panel: video player + play details */}
      {selectedPlay && (
        <div className="w-96 shrink-0 overflow-y-auto border-l border-slate-800/60 pl-6 space-y-5">
          {/* Panel header */}
          <div className="flex items-center justify-between pt-1">
            <div>
              <p className="font-display text-[10px] uppercase tracking-widest text-slate-500">Now Viewing</p>
              <h2 className="font-display text-lg font-bold text-white mt-0.5">
                Play #{selectedPlay.playOrder}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setSelectedPlay(null)}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-700/50 text-slate-500 hover:border-slate-600 hover:text-slate-300 transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Gradient divider */}
          <div className="h-px bg-gradient-to-r from-blue-500/40 via-cyan-500/20 to-transparent" />

          {/* Video player with drawing overlay */}
          {selectedPlay.clipBlobKey ? (
            selectedPlay.clipBlobKey.includes('youtube.com') ? (
              <div className="video-container glow-blue relative rounded-xl overflow-hidden">
                <iframe
                  key={selectedPlay.id}
                  width="100%"
                  height="240"
                  src={selectedPlay.clipBlobKey}
                  title={`Play #${selectedPlay.playOrder}`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
                  allowFullScreen
                  className="rounded-xl"
                />
                <DrawingCanvas width={640} height={360} />
              </div>
            ) : (
              <div className="video-container glow-blue relative">
                {/* biome-ignore lint/a11y/useMediaCaption: football film clips do not have caption tracks */}
                <video
                  key={selectedPlay.id}
                  controls
                  autoPlay
                  src={selectedPlay.clipBlobKey}
                />
                <DrawingCanvas width={640} height={360} />
              </div>
            )
          ) : (
            <div className="flex h-44 items-center justify-center rounded-xl bg-slate-900/60 border border-slate-700/30">
              <div className="text-center">
                <svg className="h-8 w-8 text-slate-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                </svg>
                <p className="text-xs text-slate-500">
                  {selectedPlay.status === 'awaiting_clip' ? 'Clip processing...' : 'No clip available'}
                </p>
              </div>
            </div>
          )}

          {/* Play data tags — correctable fields use 2-tap correction */}
          <div className="glass-card rounded-xl p-4 space-y-1">
            <div className="flex items-center justify-between mb-3">
              <p className="font-display text-[10px] uppercase tracking-widest text-slate-500">Play Details</p>
              {selectedPlay.coachOverride && Object.keys(selectedPlay.coachOverride).length > 0 && (
                <span className="flex items-center gap-1 text-[10px] text-amber-400">
                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-amber-400" />
                  Corrected
                </span>
              )}
            </div>

            <TagRow
              label="Down & Distance"
              value={
                selectedPlay.down && selectedPlay.distance
                  ? `${selectedPlay.down}${ordinal(selectedPlay.down)} & ${selectedPlay.distance}`
                  : '-'
              }
              highlight
            />
            <CorrectableTag field="formation" label="Formation" value={selectedPlay.formation} coachOverride={selectedPlay.coachOverride} onCorrect={handleTagCorrection} />
            <CorrectableTag field="personnel" label="Personnel" value={selectedPlay.personnel} coachOverride={selectedPlay.coachOverride} onCorrect={handleTagCorrection} />
            <CorrectableTag field="playType" label="Play Type" value={selectedPlay.playType} coachOverride={selectedPlay.coachOverride} onCorrect={handleTagCorrection} />
            <CorrectableTag field="playDirection" label="Direction" value={selectedPlay.playDirection} coachOverride={selectedPlay.coachOverride} onCorrect={handleTagCorrection} />
            <TagRow
              label="Gain / Loss"
              value={
                selectedPlay.gainLoss != null
                  ? `${selectedPlay.gainLoss > 0 ? '+' : ''}${selectedPlay.gainLoss} yds`
                  : '-'
              }
              gainLoss={selectedPlay.gainLoss}
            />
            <CorrectableTag field="result" label="Result" value={selectedPlay.result} coachOverride={selectedPlay.coachOverride} onCorrect={handleTagCorrection} />
            <CorrectableTag field="hash" label="Hash" value={selectedPlay.hash} coachOverride={selectedPlay.coachOverride} onCorrect={handleTagCorrection} />
            <TagRow label="Quarter" value={selectedPlay.quarter ? `Q${selectedPlay.quarter}` : null} />
            <TagRow label="Opponent" value={selectedPlay.opponentName} />
          </div>

          {/* AI Analysis (shown when AI has analyzed this play) */}
          {selectedPlay.coachOverride?.aiCoverage && (
            <div className="glass-card rounded-xl p-4 space-y-2 border-l-2 border-l-cyan-500/50">
              <div className="flex items-center justify-between">
                <p className="font-display text-[10px] uppercase tracking-widest text-cyan-400">
                  AI Film Analysis
                </p>
                <span className={`tag-chip text-[10px] ${
                  Number(selectedPlay.coachOverride.aiConfidence ?? 0) >= 0.7 ? 'tag-positive' : 'tag-warning'
                }`}>
                  {Math.round(Number(selectedPlay.coachOverride.aiConfidence ?? 0) * 100)}% confidence
                </span>
              </div>

              <TagRow label="Coverage" value={selectedPlay.coachOverride.aiCoverage?.replace(/_/g, ' ')} highlight />
              {selectedPlay.coachOverride.aiDefenseFormation && (
                <TagRow label="Defense" value={selectedPlay.coachOverride.aiDefenseFormation} />
              )}
              {selectedPlay.coachOverride.aiPersonnel && (
                <TagRow label="Personnel" value={selectedPlay.coachOverride.aiPersonnel} />
              )}
              {selectedPlay.coachOverride.aiPressure && (
                <TagRow label="Pressure" value={selectedPlay.coachOverride.aiPressure?.replace(/_/g, ' ')} />
              )}

              {selectedPlay.coachOverride.aiReasoning && (
                <div className="pt-2 border-t border-slate-800/50">
                  <p className="text-[10px] text-cyan-400/70 leading-relaxed">
                    {selectedPlay.coachOverride.aiReasoning}
                  </p>
                </div>
              )}

              {selectedPlay.coachOverride.aiObservations && (
                <div className="pt-2 border-t border-slate-800/50">
                  <p className="font-display text-[10px] uppercase tracking-widest text-slate-500 mb-1">Key Observations</p>
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    {selectedPlay.coachOverride.aiObservations}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? 'all')}>
      <SelectTrigger
        className={`h-8 w-auto min-w-[110px] rounded-full border text-xs font-display uppercase tracking-wider transition-all ${
          value !== 'all'
            ? 'border-blue-500/50 bg-blue-500/10 text-blue-300 shadow-sm shadow-blue-500/10'
            : 'border-slate-700/50 bg-slate-900/40 text-slate-400 hover:border-slate-600/60 hover:text-slate-300'
        }`}
      >
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent className="bg-slate-900 border-slate-700/50">
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-xs font-display">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TagRow({
  label,
  value,
  highlight = false,
  gainLoss,
}: {
  label: string;
  value: string | number | null | undefined;
  highlight?: boolean;
  gainLoss?: number | null;
}) {
  const valueColor = gainLoss != null
    ? gainLoss > 0
      ? 'text-emerald-400'
      : gainLoss < 0
      ? 'text-red-400'
      : 'text-slate-400'
    : highlight
    ? 'text-white font-semibold'
    : 'text-slate-300';

  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-800/50 last:border-0">
      <span className="font-display text-[10px] uppercase tracking-widest text-slate-500">{label}</span>
      <span className={`text-xs ${valueColor}`}>{value ?? '—'}</span>
    </div>
  );
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] ?? s[v] ?? s[0] ?? '';
}
