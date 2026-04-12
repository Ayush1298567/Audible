'use client';

import { useCallback, useEffect, useState } from 'react';
import { useProgram } from '@/lib/auth/program-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
    const res = await fetch(`/api/plays?${params}`);
    const data = await res.json();
    setPlays(data.plays ?? []);
    setIsLoading(false);
  }, [programId, selectedGameId]);

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
      <div className="flex flex-1 flex-col space-y-4 overflow-hidden">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Film Room</h1>
            <p className="text-muted-foreground">
              {filtered.length} play{filtered.length !== 1 ? 's' : ''}
              {plays.length !== filtered.length ? ` (${plays.length} total)` : ''}
            </p>
          </div>
        </div>

        {/* Upload section */}
        {games.length > 0 && (
          <Card>
            <CardContent className="pt-4">
              <form onSubmit={handleUpload} className="flex items-end gap-3">
                <div className="space-y-1">
                  <Label htmlFor="upload-game" className="text-xs">Game</Label>
                  <select
                    id="upload-game"
                    name="gameId"
                    required
                    className="flex h-9 rounded-md border border-border bg-background px-2 py-1 text-sm"
                  >
                    <option value="">Select...</option>
                    {games.map((g) => (
                      <option key={g.id} value={g.id}>{g.opponentName ?? 'Unknown'}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="upload-csv" className="text-xs">Breakdown CSV</Label>
                  <Input id="upload-csv" name="csv" type="file" accept=".csv" required className="h-9 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="upload-xml" className="text-xs">SportsCode XML</Label>
                  <Input id="upload-xml" name="xml" type="file" accept=".xml" required className="h-9 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="upload-mp4" className="text-xs">Concatenated MP4</Label>
                  <Input id="upload-mp4" name="mp4" type="file" accept=".mp4,video/*" required className="h-9 text-xs" />
                </div>
                <Button type="submit" disabled={isUploading} className="h-9">
                  {isUploading ? 'Processing...' : 'Upload'}
                </Button>
              </form>
              {uploadProgress && (
                <p className={`mt-2 text-xs ${uploadProgress.startsWith('Error') ? 'text-red-500' : 'text-muted-foreground'}`}>
                  {uploadProgress}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        {plays.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <FilterChip label="Down" value={filterDown} onChange={setFilterDown}
              options={[{ value: 'all', label: 'All' }, { value: '1', label: '1st' }, { value: '2', label: '2nd' }, { value: '3', label: '3rd' }, { value: '4', label: '4th' }]}
            />
            <FilterChip label="Quarter" value={filterQuarter} onChange={setFilterQuarter}
              options={[{ value: 'all', label: 'All' }, { value: '1', label: 'Q1' }, { value: '2', label: 'Q2' }, { value: '3', label: 'Q3' }, { value: '4', label: 'Q4' }]}
            />
            {formations.length > 0 && (
              <FilterChip label="Formation" value={filterFormation} onChange={setFilterFormation}
                options={[{ value: 'all', label: 'All' }, ...formations.map((f) => ({ value: f, label: f }))]}
              />
            )}
            {playTypes.length > 0 && (
              <FilterChip label="Play Type" value={filterPlayType} onChange={setFilterPlayType}
                options={[{ value: 'all', label: 'All' }, ...playTypes.map((t) => ({ value: t, label: t }))]}
              />
            )}
          </div>
        )}

        {/* Play grid */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading plays...</p>
          ) : filtered.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-lg font-medium">
                  {plays.length === 0 ? 'No film uploaded yet' : 'No plays match your filters'}
                </p>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">
                  {plays.length === 0
                    ? 'Add a game in the Games tab, then upload your Hudl breakdown CSV, SportsCode XML, and concatenated MP4 above.'
                    : 'Try adjusting or clearing your filters.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((play) => (
                <PlayCard
                  key={play.id}
                  play={play}
                  isSelected={selectedPlay?.id === play.id}
                  onClick={() => setSelectedPlay(play)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right panel: video player + play details */}
      {selectedPlay && (
        <div className="w-96 shrink-0 space-y-4 overflow-y-auto border-l border-border pl-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Play #{selectedPlay.playOrder}</h2>
            <Button variant="ghost" size="sm" onClick={() => setSelectedPlay(null)}>
              Close
            </Button>
          </div>

          {/* Video player — football clips have no caption tracks */}
          {selectedPlay.clipBlobKey ? (
            // biome-ignore lint/a11y/useMediaCaption: football film clips do not have caption tracks
            <video
              key={selectedPlay.id}
              controls
              autoPlay
              className="w-full rounded-lg bg-black"
              src={selectedPlay.clipBlobKey}
            />
          ) : (
            <div className="flex h-48 items-center justify-center rounded-lg bg-muted">
              <p className="text-xs text-muted-foreground">
                {selectedPlay.status === 'awaiting_clip' ? 'Clip processing...' : 'No clip available'}
              </p>
            </div>
          )}

          {/* Play data tags */}
          <div className="space-y-3">
            <TagRow label="Down & Distance" value={
              selectedPlay.down && selectedPlay.distance
                ? `${selectedPlay.down}${ordinal(selectedPlay.down)} & ${selectedPlay.distance}`
                : '-'
            } />
            <TagRow label="Formation" value={selectedPlay.formation} />
            <TagRow label="Personnel" value={selectedPlay.personnel} />
            <TagRow label="Play Type" value={selectedPlay.playType} />
            <TagRow label="Direction" value={selectedPlay.playDirection} />
            <TagRow label="Gain/Loss" value={
              selectedPlay.gainLoss != null
                ? `${selectedPlay.gainLoss > 0 ? '+' : ''}${selectedPlay.gainLoss} yds`
                : '-'
            } />
            <TagRow label="Result" value={selectedPlay.result} />
            <TagRow label="Hash" value={selectedPlay.hash} />
            <TagRow label="Quarter" value={selectedPlay.quarter ? `Q${selectedPlay.quarter}` : null} />
            <TagRow label="Opponent" value={selectedPlay.opponentName} />
          </div>
        </div>
      )}
    </div>
  );
}

function PlayCard({ play, isSelected, onClick }: { play: Play; isSelected: boolean; onClick: () => void }) {
  const outcome = play.gainLoss != null
    ? play.gainLoss > 3 ? 'positive' : play.gainLoss < 0 ? 'negative' : 'neutral'
    : 'neutral';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border p-3 text-left transition-colors hover:bg-muted ${
        isSelected ? 'border-primary bg-muted' : 'border-border'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">#{play.playOrder}</span>
        <span className={`inline-block h-2 w-2 rounded-full ${
          outcome === 'positive' ? 'bg-green-500' : outcome === 'negative' ? 'bg-red-500' : 'bg-gray-400'
        }`} />
      </div>
      <div className="mt-1">
        <p className="text-sm font-medium">
          {play.down ? `${play.down}${ordinal(play.down)} & ${play.distance ?? '?'}` : 'No D&D'}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {play.formation ?? 'Unknown'} · {play.playType ?? '?'}
        </p>
        {play.gainLoss != null && (
          <p className={`mt-1 text-xs font-mono ${
            play.gainLoss > 0 ? 'text-green-600' : play.gainLoss < 0 ? 'text-red-600' : 'text-muted-foreground'
          }`}>
            {play.gainLoss > 0 ? '+' : ''}{play.gainLoss} yds
          </p>
        )}
      </div>
      {play.status !== 'ready' && (
        <Badge variant="outline" className="mt-2 text-xs">{play.status}</Badge>
      )}
    </button>
  );
}

function FilterChip({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? 'all')}>
      <SelectTrigger className="h-8 w-auto min-w-[100px] text-xs">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-xs">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TagRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value ?? '-'}</span>
    </div>
  );
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] ?? s[v] ?? s[0] ?? '';
}
