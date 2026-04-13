'use client';

import { useCallback, useEffect, useState } from 'react';
import { useProgram } from '@/lib/auth/program-context';

/**
 * Player Progress — accuracy trends, decision time, concept mastery.
 *
 * For coaches: see all players' progress at a glance.
 * Position group leaderboard, film grade summaries,
 * session completion tracking, and concept mastery breakdown.
 */

interface PlayerGrade {
  playerId: string;
  playerName: string;
  jerseyNumber: number;
  totalPlays: number;
  totalGrade: number;
  gradePercentage: number;
}

interface Player {
  id: string;
  firstName: string;
  lastName: string;
  jerseyNumber: number;
  positions: string[];
}

export default function ProgressPage() {
  const { programId } = useProgram();
  const [grades, setGrades] = useState<PlayerGrade[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!programId) return;
    const [gradesRes, playersRes] = await Promise.all([
      fetch(`/api/grades?programId=${programId}`),
      fetch(`/api/players?programId=${programId}`),
    ]);
    const gradesData = await gradesRes.json();
    const playersData = await playersRes.json();
    setGrades(gradesData.grades ?? []);
    setPlayers(playersData.players ?? []);
    setIsLoading(false);
  }, [programId]);

  useEffect(() => { void load(); }, [load]);

  // Group players by position for leaderboard
  const positionGroups = new Map<string, Player[]>();
  for (const player of players) {
    const pos = player.positions[0] ?? 'ATH';
    const group = positionGroups.get(pos) ?? [];
    group.push(player);
    positionGroups.set(pos, group);
  }

  // Build grade map for quick lookup
  const gradeMap = new Map(grades.map((g) => [g.playerId, g]));

  // Team average grade
  const teamGradeAvg = grades.length > 0
    ? Math.round(grades.reduce((s, g) => s + g.gradePercentage, 0) / grades.length)
    : 0;

  // Stars = players with 80%+ grade
  const stars = grades.filter((g) => g.gradePercentage >= 80);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="font-display text-xs uppercase tracking-widest text-primary mb-1">
          Analytics
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight text-white">
          Player Progress
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Film grades, session accuracy, and concept mastery
        </p>
      </div>

      {/* Gradient divider */}
      <div className="h-px bg-gradient-to-r from-blue-500/50 via-cyan-500/30 to-transparent" />

      {isLoading ? (
        <div className="flex items-center gap-3 py-8">
          <svg className="h-4 w-4 animate-spin text-blue-400" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <p className="font-display text-sm uppercase tracking-widest text-slate-500">Loading...</p>
        </div>
      ) : (
        <>
          {/* Team overview stats */}
          <div className="grid grid-cols-4 gap-4">
            <StatCard label="Team Grade" value={`${teamGradeAvg}%`} target="80%" color={teamGradeAvg >= 80 ? 'text-emerald-400' : teamGradeAvg >= 70 ? 'text-amber-400' : 'text-red-400'} />
            <StatCard label="Players Graded" value={String(grades.length)} color="text-blue-400" />
            <StatCard label="Stars (80%+)" value={String(stars.length)} color="text-amber-400" />
            <StatCard label="Roster Size" value={String(players.length)} color="text-slate-300" />
          </div>

          {/* Film grade leaderboard */}
          {grades.length > 0 && (
            <div className="glass-card rounded-xl p-5 space-y-4">
              <h2 className="font-display text-sm font-bold text-white uppercase tracking-wider">
                Film Grade Rankings
              </h2>
              <div className="space-y-1">
                {grades.map((g, i) => (
                  <div key={g.playerId} className="flex items-center gap-3 py-2 border-b border-slate-800/50 last:border-0">
                    <span className={`font-display text-xs font-bold w-6 text-center ${
                      i === 0 ? 'text-amber-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-amber-600' : 'text-slate-500'
                    }`}>
                      {i + 1}
                    </span>
                    <span className="font-display text-xs font-bold text-primary w-8 text-center">
                      #{g.jerseyNumber}
                    </span>
                    <span className="text-sm text-slate-300 flex-1">{g.playerName}</span>
                    <div className="flex items-center gap-3">
                      <span className="font-display text-[10px] uppercase tracking-widest text-slate-500">
                        {g.totalGrade}/{g.totalPlays}
                      </span>
                      <span className={`stat-number text-lg ${
                        g.gradePercentage >= 80 ? 'text-emerald-400' : g.gradePercentage >= 70 ? 'text-amber-400' : 'text-red-400'
                      }`}>
                        {g.gradePercentage}%
                      </span>
                      {/* Progress bar */}
                      <div className="w-20 h-1.5 rounded-full bg-slate-800/80 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            g.gradePercentage >= 80 ? 'bg-emerald-400' : g.gradePercentage >= 70 ? 'bg-amber-400' : 'bg-red-400'
                          }`}
                          style={{ width: `${g.gradePercentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Position group breakdown */}
          {positionGroups.size > 0 && (
            <div className="space-y-3">
              <h2 className="font-display text-sm font-bold text-white uppercase tracking-wider">
                By Position Group
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from(positionGroups.entries()).map(([pos, posPlayers]) => {
                  const posGrades = posPlayers
                    .map((p) => gradeMap.get(p.id))
                    .filter((g): g is PlayerGrade => !!g);
                  const avgGrade = posGrades.length > 0
                    ? Math.round(posGrades.reduce((s, g) => s + g.gradePercentage, 0) / posGrades.length)
                    : null;

                  return (
                    <div key={pos} className="glass-card rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-display text-xs font-bold text-white uppercase tracking-wider">
                          {pos}
                        </h3>
                        {avgGrade !== null && (
                          <span className={`stat-number text-lg ${
                            avgGrade >= 80 ? 'text-emerald-400' : avgGrade >= 70 ? 'text-amber-400' : 'text-red-400'
                          }`}>
                            {avgGrade}%
                          </span>
                        )}
                      </div>
                      <div className="space-y-1">
                        {posPlayers.map((p) => {
                          const grade = gradeMap.get(p.id);
                          return (
                            <div key={p.id} className="flex items-center justify-between text-xs">
                              <span className="text-slate-400">
                                <span className="font-bold text-primary mr-1">#{p.jerseyNumber}</span>
                                {p.firstName} {p.lastName}
                              </span>
                              {grade ? (
                                <span className={`font-medium ${
                                  grade.gradePercentage >= 80 ? 'text-emerald-400' : grade.gradePercentage >= 70 ? 'text-amber-400' : 'text-red-400'
                                }`}>
                                  {grade.gradePercentage}%
                                </span>
                              ) : (
                                <span className="text-slate-600">—</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty state */}
          {grades.length === 0 && players.length === 0 && (
            <div className="glass-card rounded-xl border border-dashed border-border/50 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-800/60 border border-slate-700/50 mx-auto mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-slate-500">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
              </div>
              <p className="font-display text-base font-semibold text-slate-300">No progress data yet</p>
              <p className="mt-2 text-sm text-slate-500">
                Add players to your roster and start grading film to see progress here.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, target, color }: { label: string; value: string; target?: string; color: string }) {
  return (
    <div className="glass-card rounded-xl p-4 text-center">
      <p className={`stat-number text-3xl ${color}`}>{value}</p>
      <p className="font-display text-[10px] uppercase tracking-widest text-slate-500 mt-1">{label}</p>
      {target && (
        <p className="text-[10px] text-slate-600 mt-0.5">Target: {target}</p>
      )}
    </div>
  );
}
