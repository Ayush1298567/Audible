'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useProgram } from '@/lib/auth/program-context';
import { Button } from '@/components/ui/button';

// ─── Types ──────────────────────────────────────────────────

interface LivePlay {
  id: string;
  playOrder: number;
  down: number | null;
  distance: number | null;
  quarter: number | null;
  formation: string | null;
  personnel: string | null;
  motion: string | null;
  playType: string | null;
  playDirection: string | null;
  gainLoss: number | null;
  result: string | null;
  coachOverride: Record<string, unknown> | null;
}

interface TendencyStat {
  label: string;
  count: number;
  total: number;
  pct: number;
}

// ─── Quick-tap options ──────────────────────────────────────

const COVERAGES = ['Cover 0', 'Cover 1', 'Cover 2', 'Cover 3', 'Cover 4', 'Cover 6', 'Man', 'Zone'] as const;
const FORMATIONS = ['I-Form', 'Shotgun', 'Pistol', 'Singleback', 'Empty', 'Bunch', 'Trips', 'Spread'] as const;
const PLAY_TYPES = ['run', 'pass', 'screen', 'rpo'] as const;
const PRESSURES = ['None', '4-man', '5-man', 'Blitz', 'Zone blitz'] as const;
const RESULTS = ['Complete', 'Incomplete', 'Sack', 'Rush', 'Scramble', 'TD', 'INT', 'Fumble', 'Penalty'] as const;

// ─── Page ───────────────────────────────────────────────────

export default function LiveGamePage() {
  const { programId } = useProgram();
  const searchParams = useSearchParams();
  const gameId = searchParams.get('gameId');

  const [plays, setPlays] = useState<LivePlay[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Current play form state
  const [quarter, setQuarter] = useState(1);
  const [down, setDown] = useState(1);
  const [distance, setDistance] = useState(10);
  const [formation, setFormation] = useState<string>('');
  const [personnel, setPersonnel] = useState<string>('');
  const [playType, setPlayType] = useState<string>('');
  const [coverage, setCoverage] = useState<string>('');
  const [pressure, setPressure] = useState<string>('');
  const [playDirection, setPlayDirection] = useState<string>('');
  const [gainLoss, setGainLoss] = useState<string>('');
  const [result, setResult] = useState<string>('');

  const load = useCallback(async () => {
    if (!programId || !gameId) return;
    try {
      const res = await fetch(`/api/live-game?programId=${programId}&gameId=${gameId}`);
      const data = await res.json();
      setPlays(data.plays ?? []);
    } catch {
      // handled by empty state
    } finally {
      setIsLoading(false);
    }
  }, [programId, gameId]);

  useEffect(() => { void load(); }, [load]);

  async function logPlay() {
    if (!programId || !gameId || isSaving) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/live-game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programId,
          gameId,
          quarter,
          down,
          distance,
          formation: formation || undefined,
          personnel: personnel || undefined,
          playType: playType || undefined,
          coverage: coverage || undefined,
          pressure: pressure || undefined,
          playDirection: playDirection || undefined,
          gainLoss: gainLoss ? Number(gainLoss) : undefined,
          result: result || undefined,
        }),
      });
      if (res.ok) {
        void load();
        // Auto-advance down/distance
        const yards = gainLoss ? Number(gainLoss) : 0;
        const newDist = distance - yards;
        if (newDist <= 0 || down === 4) {
          setDown(1);
          setDistance(10);
        } else {
          setDown(Math.min(down + 1, 4));
          setDistance(newDist);
        }
        // Clear per-play fields
        setFormation('');
        setPlayType('');
        setCoverage('');
        setPressure('');
        setPlayDirection('');
        setGainLoss('');
        setResult('');
      }
    } finally {
      setIsSaving(false);
    }
  }

  // ─── Live tendency computation ────────────────────────────

  const tendencies = useMemo(() => {
    if (plays.length === 0) return { coverage: [], formation: [], playType: [], situational: [] };

    const coverageCounts = new Map<string, number>();
    const formationCounts = new Map<string, number>();
    const playTypeCounts = new Map<string, number>();

    for (const p of plays) {
      const cov = (p.coachOverride as Record<string, string> | null)?.aiCoverage;
      if (cov) coverageCounts.set(cov, (coverageCounts.get(cov) ?? 0) + 1);
      if (p.formation) formationCounts.set(p.formation, (formationCounts.get(p.formation) ?? 0) + 1);
      if (p.playType) playTypeCounts.set(p.playType, (playTypeCounts.get(p.playType) ?? 0) + 1);
    }

    const toStats = (m: Map<string, number>, total: number): TendencyStat[] =>
      [...m.entries()]
        .map(([label, count]) => ({ label, count, total, pct: Math.round((count / total) * 100) }))
        .sort((a, b) => b.count - a.count);

    // Situational: 3rd down tendencies
    const thirdDownPlays = plays.filter((p) => p.down === 3);
    const thirdDownCov = new Map<string, number>();
    for (const p of thirdDownPlays) {
      const cov = (p.coachOverride as Record<string, string> | null)?.aiCoverage;
      if (cov) thirdDownCov.set(cov, (thirdDownCov.get(cov) ?? 0) + 1);
    }

    return {
      coverage: toStats(coverageCounts, plays.length),
      formation: toStats(formationCounts, plays.length),
      playType: toStats(playTypeCounts, plays.length),
      situational: thirdDownPlays.length > 0
        ? toStats(thirdDownCov, thirdDownPlays.length).map((s) => ({
            ...s,
            label: `3rd down: ${s.label}`,
            total: thirdDownPlays.length,
          }))
        : [],
    };
  }, [plays]);

  if (!gameId) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-slate-400">Add <code>?gameId=...</code> to the URL to start tracking.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 py-12">
        <svg className="h-4 w-4 animate-spin text-blue-400" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <p className="font-display text-sm uppercase tracking-widest text-slate-500">Loading game...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
            <p className="font-display text-xs uppercase tracking-widest text-red-400">Live Game</p>
          </div>
          <h1 className="font-display text-2xl font-bold text-white mt-1">
            Q{quarter} · {plays.length} plays logged
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4].map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setQuarter(q)}
              className={`h-10 w-10 rounded-lg font-display text-sm font-bold transition-all ${
                quarter === q
                  ? 'bg-red-600 text-white shadow-lg'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Q{q}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Play logger (2 cols on lg) */}
        <div className="lg:col-span-2 space-y-4">
          {/* Down & Distance */}
          <div className="glass-card rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="font-display text-[10px] uppercase tracking-widest text-slate-500">Down</span>
                {[1, 2, 3, 4].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDown(d)}
                    className={`h-10 w-10 rounded-lg font-bold text-sm transition-all ${
                      down === d ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-display text-[10px] uppercase tracking-widest text-slate-500">Dist</span>
                <input
                  type="number"
                  value={distance}
                  onChange={(e) => setDistance(Number(e.target.value))}
                  className="h-10 w-16 rounded-lg bg-slate-800 text-center font-mono text-white border-none"
                  min={1}
                  max={99}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-display text-[10px] uppercase tracking-widest text-slate-500">Yards</span>
                <input
                  type="number"
                  value={gainLoss}
                  onChange={(e) => setGainLoss(e.target.value)}
                  placeholder="0"
                  className="h-10 w-16 rounded-lg bg-slate-800 text-center font-mono text-white border-none"
                  min={-99}
                  max={99}
                />
              </div>
            </div>

            {/* Quick-tap rows */}
            <TapRow label="Coverage" options={COVERAGES} value={coverage} onChange={setCoverage} />
            <TapRow label="Formation" options={FORMATIONS} value={formation} onChange={setFormation} />
            <TapRow label="Play Type" options={PLAY_TYPES} value={playType} onChange={setPlayType} />
            <TapRow label="Pressure" options={PRESSURES} value={pressure} onChange={setPressure} />
            <TapRow label="Result" options={RESULTS} value={result} onChange={setResult} />

            <Button
              onClick={logPlay}
              disabled={isSaving}
              className="w-full h-14 bg-red-600 hover:bg-red-500 text-white font-display text-sm uppercase tracking-widest"
            >
              {isSaving ? 'Logging...' : `Log Play · ${down}&${distance}`}
            </Button>
          </div>

          {/* Recent play log */}
          <div className="glass-card rounded-xl p-4">
            <p className="font-display text-[10px] uppercase tracking-widest text-slate-500 mb-3">Play Log</p>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {[...plays].reverse().slice(0, 20).map((p) => {
                const cov = (p.coachOverride as Record<string, string> | null)?.aiCoverage;
                return (
                  <div key={p.id} className="flex items-center gap-3 text-xs py-1.5 border-b border-slate-800/50">
                    <span className="text-slate-500 font-mono w-6 shrink-0">#{p.playOrder}</span>
                    <span className="text-slate-400 w-12 shrink-0">
                      {p.down}&{p.distance}
                    </span>
                    <span className="text-white font-medium w-16 shrink-0">{p.playType ?? '-'}</span>
                    <span className="text-cyan-400 w-20 shrink-0">{cov ?? '-'}</span>
                    <span className="text-slate-300">{p.formation ?? ''}</span>
                    <span className={`ml-auto font-mono ${(p.gainLoss ?? 0) > 0 ? 'text-green-400' : (p.gainLoss ?? 0) < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                      {p.gainLoss != null ? `${p.gainLoss > 0 ? '+' : ''}${p.gainLoss}` : ''}
                    </span>
                  </div>
                );
              })}
              {plays.length === 0 && (
                <p className="text-slate-500 text-xs text-center py-4">No plays logged yet</p>
              )}
            </div>
          </div>
        </div>

        {/* Right: Live tendencies */}
        <div className="space-y-4">
          <TendencyCard title="Coverage" stats={tendencies.coverage} color="cyan" />
          <TendencyCard title="Play Type" stats={tendencies.playType} color="blue" />
          <TendencyCard title="Formation" stats={tendencies.formation} color="purple" />
          {tendencies.situational.length > 0 && (
            <TendencyCard title="3rd Down" stats={tendencies.situational} color="red" />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Quick-tap row ──────────────────────────────────────────

function TapRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="font-display text-[10px] uppercase tracking-widest text-slate-500 w-16 shrink-0">
        {label}
      </span>
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(value === opt ? '' : opt)}
          className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
            value === opt
              ? 'bg-blue-600 text-white'
              : 'bg-slate-800/80 text-slate-400 hover:text-white'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

// ─── Tendency card ──────────────────────────────────────────

function TendencyCard({
  title,
  stats,
  color,
}: {
  title: string;
  stats: TendencyStat[];
  color: 'cyan' | 'blue' | 'purple' | 'red';
}) {
  const barColor = {
    cyan: 'bg-cyan-500',
    blue: 'bg-blue-500',
    purple: 'bg-purple-500',
    red: 'bg-red-500',
  }[color];

  return (
    <div className="glass-card rounded-xl p-4 space-y-2">
      <p className="font-display text-[10px] uppercase tracking-widest text-slate-500">{title}</p>
      {stats.length === 0 ? (
        <p className="text-xs text-slate-600">No data yet</p>
      ) : (
        stats.slice(0, 6).map((s) => (
          <div key={s.label} className="space-y-1">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-slate-300">{s.label}</span>
              <span className="font-mono text-white font-bold">
                {s.pct}%
                <span className="text-slate-500 font-normal ml-1">({s.count}/{s.total})</span>
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full ${barColor} transition-all`}
                style={{ width: `${s.pct}%` }}
              />
            </div>
          </div>
        ))
      )}
    </div>
  );
}
