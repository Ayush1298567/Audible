'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useProgram } from '@/lib/auth/program-context';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { TendencyBreakdown } from '@/lib/tendencies/queries';

interface OverviewData {
  formation: TendencyBreakdown;
  playType: TendencyBreakdown;
  direction: TendencyBreakdown;
  personnel: TendencyBreakdown;
  success: TendencyBreakdown;
  situations: TendencyBreakdown[];
}

export default function OpponentScoutingPage() {
  const params = useParams();
  const opponentId = params.opponentId as string;
  const { programId } = useProgram();
  const [data, setData] = useState<OverviewData | null>(null);
  const [selfScout, setSelfScout] = useState<TendencyBreakdown[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!programId || !opponentId) return;
    try {
      const [overviewRes, selfScoutRes] = await Promise.all([
        fetch(`/api/tendencies?programId=${programId}&opponentId=${opponentId}&type=overview`),
        fetch(`/api/tendencies?programId=${programId}&type=selfScout`),
      ]);
      const overviewData = await overviewRes.json();
      const selfScoutData = await selfScoutRes.json();
      setData(overviewData);
      setSelfScout(selfScoutData.alerts ?? []);
    } catch {
      // handled by empty state
    } finally {
      setIsLoading(false);
    }
  }, [programId, opponentId]);

  useEffect(() => { void load(); }, [load]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 py-12">
        <svg className="h-4 w-4 animate-spin text-blue-400" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <p className="font-display text-sm uppercase tracking-widest text-slate-500">
          Computing tendencies...
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="glass-card rounded-xl border border-dashed border-slate-700/50 flex flex-col items-center justify-center py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-800/60 border border-slate-700/50 mb-4">
          <svg className="h-6 w-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="font-display text-base font-semibold text-slate-300">No film data available</p>
        <p className="mt-2 max-w-sm text-sm text-slate-500">
          Upload game film for this opponent to generate tendency reports.
        </p>
      </div>
    );
  }

  return (
    <div className="relative space-y-6 gradient-mesh noise-overlay">

      {/* Page header */}
      <div className="animate-fade-in">
        <p className="font-display text-xs uppercase tracking-widest text-blue-400 mb-1">
          Opponent Analysis
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight text-white">
          Opponent Scouting
        </h1>
        <div className="mt-2 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="stat-number text-xl text-blue-400">{data.formation.sampleSize}</span>
            <span className="text-xs text-slate-500">plays analyzed</span>
          </div>
          <div className="h-4 w-px bg-slate-700/50" />
          <ConfidenceBadge confidence={data.formation.confidence} />
        </div>
      </div>

      {/* Gradient divider */}
      <div className="h-px bg-gradient-to-r from-blue-500/50 via-cyan-500/30 to-transparent" />

      <Tabs defaultValue="tendencies">
        <TabsList className="bg-slate-900/60 border border-slate-700/50 p-1 rounded-xl gap-1">
          <TabsTrigger
            value="tendencies"
            className="font-display text-xs uppercase tracking-wider rounded-lg data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm transition-all"
          >
            Tendencies
          </TabsTrigger>
          <TabsTrigger
            value="situations"
            className="font-display text-xs uppercase tracking-wider rounded-lg data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm transition-all"
          >
            By Situation
          </TabsTrigger>
          <TabsTrigger
            value="selfscout"
            className="font-display text-xs uppercase tracking-wider rounded-lg data-[state=active]:bg-red-600 data-[state=active]:text-white data-[state=active]:shadow-sm transition-all"
          >
            Self-Scout
          </TabsTrigger>
        </TabsList>

        {/* Tendencies tab */}
        <TabsContent value="tendencies" className="space-y-6 pt-6">
          <div className="grid gap-5 lg:grid-cols-2">
            <TendencyCard breakdown={data.formation} />
            <TendencyCard breakdown={data.playType} />
            <TendencyCard breakdown={data.direction} />
            <TendencyCard breakdown={data.personnel} />
            <TendencyCard breakdown={data.success} title="Success Rate by Play Type" isRate />
          </div>
        </TabsContent>

        {/* Situation breakdown tab */}
        <TabsContent value="situations" className="space-y-4 pt-6">
          {data.situations.length === 0 ? (
            <div className="glass-card rounded-xl py-12 text-center">
              <p className="font-display text-sm text-slate-500 uppercase tracking-wider">
                No situation data — upload more film for this opponent
              </p>
            </div>
          ) : (
            data.situations.map((sit, i) => (
              <div key={sit.situation} className={`animate-fade-in stagger-${Math.min(i + 1, 6) as 1 | 2 | 3 | 4 | 5 | 6}`}>
                <SituationCard breakdown={sit} />
              </div>
            ))
          )}
        </TabsContent>

        {/* Self-scout tab */}
        <TabsContent value="selfscout" className="space-y-4 pt-6">
          {/* Alert banner */}
          <div className="rounded-xl border border-red-500/20 bg-red-500/8 backdrop-blur-sm p-4 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-red-500/5 to-transparent pointer-events-none" />
            <div className="relative flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-500/15 border border-red-500/20">
                <svg className="h-4 w-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <div>
                <h3 className="font-display text-sm font-bold text-red-300 uppercase tracking-wider">
                  Predictability Alerts
                </h3>
                <p className="mt-0.5 text-xs text-red-400/80">
                  These are your own tendencies a good defensive coordinator will find and exploit.
                </p>
              </div>
            </div>
          </div>

          {selfScout.length === 0 ? (
            <div className="glass-card rounded-xl border border-dashed border-slate-700/50 py-12 text-center">
              <p className="font-display text-sm font-semibold text-slate-300">No high-predictability patterns detected</p>
              <p className="mt-2 text-xs text-slate-500 max-w-sm mx-auto">
                Either your play-calling is well-balanced, or you need more film uploaded.
              </p>
            </div>
          ) : (
            selfScout.map((alert, i) => (
              <div key={alert.situation} className={`animate-fade-in stagger-${Math.min(i + 1, 6) as 1 | 2 | 3 | 4 | 5 | 6}`}>
                <SelfScoutAlert breakdown={alert} />
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Components ─────────────────────────────────────────────

function TendencyCard({
  breakdown,
  title,
  isRate = false,
}: {
  breakdown: TendencyBreakdown;
  title?: string;
  isRate?: boolean;
}) {
  return (
    <div className="glass-card rounded-xl p-5 animate-fade-in">
      {/* Card header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-display text-sm font-bold text-white uppercase tracking-wider">
            {title ?? breakdown.situation}
          </h3>
          <p className="mt-0.5 text-[10px] text-slate-500 font-display uppercase tracking-widest">
            {breakdown.sampleSize} plays
          </p>
        </div>
        <ConfidenceBadge confidence={breakdown.confidence} />
      </div>

      {/* Gradient divider */}
      <div className="h-px bg-gradient-to-r from-blue-500/30 via-cyan-500/15 to-transparent mb-4" />

      <div className="space-y-3">
        {breakdown.tendencies.slice(0, 8).map((t) => (
          <TendencyBar key={t.label} tendency={t} isRate={isRate} />
        ))}
        {breakdown.tendencies.length === 0 && (
          <p className="font-display text-xs text-slate-600 uppercase tracking-wider py-2">No data</p>
        )}
      </div>
    </div>
  );
}

function TendencyBar({
  tendency,
  isRate = false,
}: {
  tendency: { label: string; count: number; total: number; rate: number; playIds: string[] };
  isRate: boolean;
}) {
  const pct = Math.round(tendency.rate * 100);
  const displayValue = isRate
    ? `${pct}% success (${tendency.count}/${tendency.total})`
    : `${pct}% · ${tendency.count} plays`;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="font-display text-xs font-semibold text-slate-300 uppercase tracking-wide">
          {tendency.label}
        </span>
        <span className="font-display text-[10px] text-slate-500 uppercase tracking-wider">
          {displayValue}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800/80">
        <div
          className="h-full rounded-full animate-bar bg-gradient-to-r from-blue-500 to-cyan-400"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function SituationCard({ breakdown }: { breakdown: TendencyBreakdown }) {
  if (breakdown.sampleSize === 0) return null;

  return (
    <div className="glass-card rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-sm font-bold text-white uppercase tracking-wider">
          {breakdown.situation}
        </h3>
        <div className="flex items-center gap-2">
          <span className="font-display text-[10px] text-slate-500 uppercase tracking-widest">
            {breakdown.sampleSize} plays
          </span>
          <ConfidenceBadge confidence={breakdown.confidence} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {breakdown.tendencies.slice(0, 5).map((t) => (
          <span
            key={t.label}
            className={`tag-chip ${t.rate >= 0.4 ? 'tag-info' : 'tag-neutral'}`}
          >
            {t.label}: <span className="stat-number text-[11px] ml-1">{Math.round(t.rate * 100)}%</span>
            <span className="text-[10px] opacity-70 ml-0.5">({t.count})</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function SelfScoutAlert({ breakdown }: { breakdown: TendencyBreakdown }) {
  const top = breakdown.tendencies[0];
  if (!top) return null;

  const pct = Math.round(top.rate * 100);

  return (
    <div className="rounded-xl border border-red-500/20 bg-gradient-to-r from-red-950/40 to-slate-900/60 backdrop-blur-md p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 via-transparent to-transparent pointer-events-none" />

      <div className="relative flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="font-display text-sm font-bold text-red-300 uppercase tracking-wider">
            {breakdown.situation}
          </p>
          <p className="mt-1 text-xs text-red-400/80 leading-relaxed">
            You {top.label.toLowerCase()}{' '}
            <span className="stat-number text-base text-red-300">{pct}%</span>
            {' '}of the time ({top.count} of {top.total} plays).
            A good DC will exploit this.
          </p>
          <p className="mt-2 text-[10px] font-display uppercase tracking-widest text-red-500/60">
            Tap to watch all {top.count} plays
          </p>
        </div>
        <div className="shrink-0">
          <ConfidenceBadge confidence={breakdown.confidence} />
        </div>
      </div>
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const cssClass = confidence === 'very_high'
    ? 'confidence-very-high'
    : `confidence-${confidence}`;

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-display text-[10px] font-semibold uppercase tracking-wider ${cssClass}`}>
      {confidence.replace('_', ' ')}
    </span>
  );
}
