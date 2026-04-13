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

interface HubData {
  filmCount: number;
  playCount: number;
  rosterSize: number;
  gamePlanCount: number;
  sessionCount: number;
  selfScoutAlerts: TendencyBreakdown[];
}

export default function HubPage() {
  const { programId, programName } = useProgram();
  const [data, setData] = useState<HubData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!programId) return;
    try {
      const [playsRes, playersRes, plansRes, sessionsRes, selfScoutRes] = await Promise.all([
        fetch(`/api/plays?programId=${programId}`),
        fetch(`/api/players?programId=${programId}`),
        fetch(`/api/gameplan?programId=${programId}`),
        fetch(`/api/sessions?programId=${programId}`),
        fetch(`/api/tendencies?programId=${programId}&type=selfScout`),
      ]);

      const playsData = await playsRes.json();
      const playersData = await playersRes.json();
      const plansData = await plansRes.json();
      const sessionsData = await sessionsRes.json();
      const selfScoutData = await selfScoutRes.json();

      const plays = playsData.plays ?? [];
      const gameIds = new Set(plays.map((p: { gameId?: string }) => p.gameId).filter(Boolean));

      setData({
        filmCount: gameIds.size,
        playCount: plays.length,
        rosterSize: (playersData.players ?? []).length,
        gamePlanCount: (plansData.gamePlans ?? []).length,
        sessionCount: (sessionsData.sessions ?? []).length,
        selfScoutAlerts: selfScoutData.alerts ?? [],
      });
    } catch {
      // fail silently, show zeros
    } finally {
      setIsLoading(false);
    }
  }, [programId]);

  useEffect(() => { void load(); }, [load]);

  const d = data ?? { filmCount: 0, playCount: 0, rosterSize: 0, gamePlanCount: 0, sessionCount: 0, selfScoutAlerts: [] };

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
        <StatCard label="Game Plans" value={String(d.gamePlanCount)} unit="plans" description={d.gamePlanCount > 0 ? 'Ready for game week' : 'Build after uploading film'} accentColor="accent" />
        <StatCard label="Practice" value={String(d.sessionCount)} unit="sessions" description={d.sessionCount > 0 ? 'Sessions built' : 'No sessions yet'} accentColor="warning" />
        <StatCard label="Roster" value={String(d.rosterSize)} unit="players" description={d.rosterSize > 0 ? 'On your roster' : 'Add players to get started'} accentColor="info" />
      </div>

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
