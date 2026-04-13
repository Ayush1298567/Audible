'use client';

import { useCallback, useEffect, useState } from 'react';
import { useProgram } from '@/lib/auth/program-context';
import Link from 'next/link';

interface Opponent {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
}

export default function ScoutingPage() {
  const { programId } = useProgram();
  const [opponents, setOpponents] = useState<Opponent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!programId) return;
    const res = await fetch(`/api/opponents?programId=${programId}`);
    const data = await res.json();
    setOpponents(data.opponents ?? []);
    setIsLoading(false);
  }, [programId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="relative min-h-full space-y-8 gradient-mesh noise-overlay">

      {/* Page header */}
      <div className="animate-fade-in">
        <p className="font-display text-xs uppercase tracking-widest text-cyan-400 mb-1">
          Intelligence Hub
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight text-white">
          Scouting Hub
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Opponent tendencies built from game film
        </p>
      </div>

      {/* Gradient divider */}
      <div className="h-px bg-gradient-to-r from-cyan-500/50 via-blue-500/30 to-transparent" />

      {/* Opponent count callout */}
      {!isLoading && opponents.length > 0 && (
        <div className="flex items-center gap-4 animate-fade-in stagger-1">
          <div className="flex items-center gap-2">
            <span className="stat-number text-3xl text-cyan-400">{opponents.length}</span>
            <span className="font-display text-xs uppercase tracking-widest text-slate-500 leading-tight">
              Opponent{opponents.length !== 1 ? 's' : ''}<br />Scouted
            </span>
          </div>
          <div className="h-8 w-px bg-slate-700/50" />
          <p className="text-xs text-slate-500">
            Select an opponent to view their play-calling tendencies and predictability analysis.
          </p>
        </div>
      )}

      {/* States */}
      {isLoading ? (
        <div className="flex items-center gap-3 py-8">
          <svg className="h-4 w-4 animate-spin text-cyan-400" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <p className="font-display text-sm text-slate-500 uppercase tracking-wider">Loading opponents...</p>
        </div>
      ) : opponents.length === 0 ? (
        <div className="glass-card rounded-xl border border-dashed border-slate-700/50 flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-800/60 border border-slate-700/50 mb-4">
            <svg className="h-6 w-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
          </div>
          <p className="font-display text-base font-semibold text-slate-300">No opponents yet</p>
          <p className="mt-2 max-w-sm text-sm text-slate-500">
            Add opponents in the Games tab to start building scouting reports.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {opponents.map((opp, i) => (
            <Link
              key={opp.id}
              href={`/scouting/${opp.id}`}
              className={`group block animate-fade-in stagger-${Math.min(i + 1, 6) as 1 | 2 | 3 | 4 | 5 | 6}`}
            >
              <div className="glass-card glow-cyan rounded-xl p-5 transition-all duration-300 hover:scale-[1.02] hover:-translate-y-0.5 hover:shadow-xl hover:shadow-cyan-500/10 relative overflow-hidden">
                {/* Hover gradient sweep */}
                <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-cyan-500/5 via-transparent to-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

                <div className="relative z-10">
                  {/* Opponent initial badge */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/20 font-display text-lg font-bold text-blue-300">
                      {opp.name.charAt(0).toUpperCase()}
                    </div>
                    <svg
                      className="h-4 w-4 text-slate-600 group-hover:text-cyan-400 transition-colors"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </div>

                  {/* Name */}
                  <h2 className="font-display text-lg font-bold text-white group-hover:text-cyan-50 transition-colors">
                    {opp.name}
                  </h2>

                  {/* Location */}
                  <p className="mt-1 text-xs text-slate-500">
                    {[opp.city, opp.state].filter(Boolean).join(', ') || 'Location unknown'}
                  </p>

                  {/* CTA */}
                  <div className="mt-4 flex items-center gap-1.5">
                    <span className="tag-chip tag-info">View Tendencies</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
