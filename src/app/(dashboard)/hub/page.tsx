'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useProgram } from '@/lib/auth/program-context';
import { Badge } from '@/components/ui/badge';
import type { TendencyBreakdown } from '@/lib/tendencies/queries';

/**
 * Hub — the coach's weekly intelligence dashboard.
 *
 * Shows at a glance: film status, game plan status, player prep completion,
 * roster size, self-scout alerts, and quick actions.
 * Self-scout runs continuously — alerts surface here automatically.
 */

interface OpponentPreview {
  id: string;
  name: string;
  playCount: number;
  topFormation?: string;
  topFormationPct?: number;
  topCoverage?: string;
  topCoveragePct?: number;
  gameDate?: string;
}

interface HubData {
  filmCount: number;
  playCount: number;
  rosterSize: number;
  gamePlanCount: number;
  sessionCount: number;
  playbookSize: number;
  selfScoutAlerts: TendencyBreakdown[];
  nextOpponent: OpponentPreview | null;
}

export default function HubPage() {
  const { programId, programName } = useProgram();
  const [data, setData] = useState<HubData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!programId) return;
    try {
      const [playsRes, playersRes, plansRes, sessionsRes, selfScoutRes, oppsRes, playbookRes] = await Promise.all([
        fetch(`/api/plays?programId=${programId}`),
        fetch(`/api/players?programId=${programId}`),
        fetch(`/api/gameplan?programId=${programId}`),
        fetch(`/api/sessions?programId=${programId}`),
        fetch(`/api/tendencies?programId=${programId}&type=selfScout`),
        fetch(`/api/opponents?programId=${programId}`),
        fetch(`/api/playbook?programId=${programId}`),
      ]);

      const playsData = await playsRes.json();
      const playersData = await playersRes.json();
      const plansData = await plansRes.json();
      const sessionsData = await sessionsRes.json();
      const selfScoutData = await selfScoutRes.json();
      const oppsData = await oppsRes.json();
      const playbookData = await playbookRes.json();

      const allPlays = playsData.plays ?? [];
      const gameIds = new Set(allPlays.map((p: { gameId?: string }) => p.gameId).filter(Boolean));
      const opps = oppsData.opponents ?? [];

      // Find the opponent with the most recent game
      let nextOpponent: OpponentPreview | null = null;
      if (opps.length > 0) {
        const gamesRes = await fetch(`/api/games?programId=${programId}`);
        const gamesData = await gamesRes.json();
        const gamesList = (gamesData.games ?? []) as Array<{ opponentId: string; opponentName: string; playedAt: string | null }>;
        const sorted = [...gamesList].sort((a, b) => {
          if (!a.playedAt) return 1;
          if (!b.playedAt) return -1;
          return new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime();
        });
        const latest = sorted[0];
        if (latest?.opponentId) {
          const oppId = latest.opponentId;
          // Get opponent-specific tendencies
          try {
            const tendRes = await fetch(`/api/tendencies?programId=${programId}&opponentId=${oppId}&type=overview`);
            const tendData = await tendRes.json();
            const formTop = tendData.formation?.tendencies?.[0];
            const covRes = await fetch(`/api/tendencies?programId=${programId}&opponentId=${oppId}&type=coverage`);
            const covData = covRes.ok ? await covRes.json() : null;
            const covTop = covData?.tendencies?.[0];
            nextOpponent = {
              id: oppId,
              name: latest.opponentName ?? 'Unknown',
              playCount: tendData.formation?.sampleSize ?? 0,
              topFormation: formTop?.label,
              topFormationPct: formTop ? Math.round(formTop.rate * 100) : undefined,
              topCoverage: covTop?.label,
              topCoveragePct: covTop ? Math.round(covTop.rate * 100) : undefined,
              gameDate: latest.playedAt ?? undefined,
            };
          } catch { /* skip opponent preview on error */ }
        }
      }

      setData({
        filmCount: gameIds.size,
        playCount: allPlays.length,
        rosterSize: (playersData.players ?? []).length,
        gamePlanCount: (plansData.gamePlans ?? []).length,
        sessionCount: (sessionsData.sessions ?? []).length,
        playbookSize: (playbookData.plays ?? []).length,
        selfScoutAlerts: selfScoutData.alerts ?? [],
        nextOpponent,
      });
    } catch {
      // fail silently, show zeros
    } finally {
      setIsLoading(false);
    }
  }, [programId]);

  useEffect(() => { void load(); }, [load]);

  const d = data ?? { filmCount: 0, playCount: 0, rosterSize: 0, gamePlanCount: 0, sessionCount: 0, playbookSize: 0, selfScoutAlerts: [], nextOpponent: null };

  return (
    <div className="relative space-y-8">
      <div className="gradient-mesh noise-overlay absolute inset-0 -z-10" />

      {/* Header */}
      <div className="space-y-1 animate-fade-in">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-3xl font-bold tracking-tight">{programName}</h1>
          <Badge className="bg-success/10 text-success border-success/20 font-display text-[10px] uppercase tracking-widest">
            Active
          </Badge>
        </div>
        <p className="font-display text-sm uppercase tracking-widest text-muted-foreground">
          Weekly Intelligence Dashboard
        </p>
      </div>

      {/* Status cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Film" value={String(d.filmCount)} unit="games" description={`${d.playCount} plays analyzed`} accentColor="primary" />
        <StatCard label="Playbook" value={String(d.playbookSize)} unit="plays" description={d.playbookSize > 0 ? 'In your playbook' : 'Add plays for AI suggestions'} accentColor="accent" />
        <StatCard label="Game Plans" value={String(d.gamePlanCount)} unit="plans" description={d.gamePlanCount > 0 ? 'Ready for game week' : 'Build on the Board'} accentColor="warning" />
        <StatCard label="Roster" value={String(d.rosterSize)} unit="players" description={d.rosterSize > 0 ? 'On your roster' : 'Add players to get started'} accentColor="info" />
      </div>

      {/* This week's opponent */}
      {d.nextOpponent && (
        <Link
          href={`/scouting/${d.nextOpponent.id}`}
          className="block rounded-xl border border-cyan-500/20 bg-gradient-to-r from-cyan-500/10 via-blue-500/5 to-transparent p-5 hover:border-cyan-500/40 transition-colors animate-fade-in"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="font-display text-[10px] uppercase tracking-widest text-cyan-400 mb-1">
                This Week&apos;s Opponent
              </p>
              <h3 className="font-display text-xl font-bold text-white">
                {d.nextOpponent.name}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {d.nextOpponent.playCount} plays of film analyzed
                {d.nextOpponent.gameDate && ` · Game ${new Date(d.nextOpponent.gameDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
              </p>
            </div>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-cyan-400 shrink-0 mt-1" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </div>
          {(d.nextOpponent.topFormation || d.nextOpponent.topCoverage) && (
            <div className="flex gap-4 mt-3 pt-3 border-t border-cyan-500/10">
              {d.nextOpponent.topFormation && (
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest">Top Formation</p>
                  <p className="text-sm font-semibold text-white">
                    {d.nextOpponent.topFormation}{' '}
                    <span className="text-cyan-400">{d.nextOpponent.topFormationPct}%</span>
                  </p>
                </div>
              )}
              {d.nextOpponent.topCoverage && (
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest">Top Coverage</p>
                  <p className="text-sm font-semibold text-white">
                    {d.nextOpponent.topCoverage}{' '}
                    <span className="text-cyan-400">{d.nextOpponent.topCoveragePct}%</span>
                  </p>
                </div>
              )}
            </div>
          )}
        </Link>
      )}

      {/* Self-scout alerts */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-lg font-semibold tracking-wide">Self-Scout Alerts</h2>
          <div className="h-px flex-1 bg-gradient-to-r from-border/50 to-transparent" />
        </div>

        {isLoading ? (
          <div className="flex items-center gap-3 py-4">
            <svg className="h-4 w-4 animate-spin text-blue-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <p className="font-display text-sm uppercase tracking-widest text-slate-500">Scanning tendencies...</p>
          </div>
        ) : d.selfScoutAlerts.length > 0 ? (
          <div className="space-y-3">
            {d.selfScoutAlerts.map((alert) => {
              const top = alert.tendencies[0];
              if (!top) return null;
              const pct = Math.round(top.rate * 100);

              return (
                <div key={alert.situation} className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 animate-fade-in">
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-500/15 border border-red-500/20">
                      <svg className="h-4 w-4 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-display text-sm font-bold text-red-300 uppercase tracking-wider">
                        {alert.situation}
                      </p>
                      <p className="text-xs text-red-400/80 mt-0.5">
                        You {top.label.toLowerCase()} <span className="stat-number text-base text-red-300">{pct}%</span> of the time ({top.count}/{top.total} plays). A good DC will exploit this.
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : d.playCount > 0 ? (
          <div className="glass-card rounded-xl p-6 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 mx-auto mb-3">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p className="font-display text-sm font-semibold text-emerald-300">No high-predictability patterns detected</p>
            <p className="text-xs text-slate-500 mt-1">Your play-calling looks balanced. Keep uploading film for continuous monitoring.</p>
          </div>
        ) : (
          <div className="glass-card rounded-2xl p-8 text-center">
            <div className="mx-auto max-w-md space-y-4">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <p className="font-display text-base font-semibold text-foreground">Upload game film to unlock intelligence</p>
              <p className="text-sm text-muted-foreground">
                Audible will find coverage tendencies, pressure patterns, pre-snap tells, and self-scout your own predictability.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-lg font-semibold tracking-wide">Quick Actions</h2>
          <div className="h-px flex-1 bg-gradient-to-r from-border/50 to-transparent" />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <ActionCard href="/film" title="Upload Film" description="Import Hudl breakdown export" icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5,3 19,12 5,21" />
            </svg>
          } />
          <ActionCard href="/roster" title="Build Roster" description="Add players with join codes" icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="5" />
              <path d="M3 21c0-4 3.5-7 9-7s9 3 9 7" />
            </svg>
          } />
          <ActionCard href="/games" title="Schedule Games" description="Add opponents to your schedule" icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <line x1="9" y1="4" x2="9" y2="10" />
            </svg>
          } />
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, unit, description, accentColor }: {
  label: string; value: string; unit: string; description: string; accentColor: string;
}) {
  const colorMap: Record<string, string> = {
    primary: 'from-primary/20 to-primary/5 border-primary/10',
    accent: 'from-cyan-500/20 to-cyan-500/5 border-cyan-500/10',
    warning: 'from-amber-500/20 to-amber-500/5 border-amber-500/10',
    info: 'from-blue-500/20 to-blue-500/5 border-blue-500/10',
  };
  const valueColorMap: Record<string, string> = {
    primary: 'text-primary',
    accent: 'text-cyan-400',
    warning: 'text-amber-400',
    info: 'text-blue-400',
  };

  return (
    <div className={`glass-card rounded-xl p-5 border bg-gradient-to-br ${colorMap[accentColor] ?? ''} animate-fade-in`}>
      <p className="font-display text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className={`stat-number text-3xl ${valueColorMap[accentColor] ?? 'text-foreground'}`}>
          {value}
        </span>
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground/70">{description}</p>
    </div>
  );
}

function ActionCard({ href, icon, title, description }: {
  href: string; icon: React.ReactNode; title: string; description: string;
}) {
  return (
    <Link
      href={href}
      className="glass-card rounded-xl p-5 flex items-start gap-4 transition-all hover:border-primary/30 group"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
        {icon}
      </div>
      <div>
        <p className="font-display text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
          {title}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
    </Link>
  );
}
