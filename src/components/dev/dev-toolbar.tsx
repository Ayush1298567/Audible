'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useProgram } from '@/lib/auth/program-context';

/**
 * Dev-only floating toolbar at the bottom of the screen.
 *
 * Lets you:
 *   - See current programId, role, and view mode
 *   - Switch between Coach and Player views
 *   - Switch coach role (head_coach / coordinator / assistant)
 *   - Switch player position group
 *   - Quick-navigate to any page
 *
 * Only rendered when NODE_ENV=development.
 */

type ViewMode = 'coach' | 'player';
type CoachRole = 'head_coach' | 'coordinator' | 'assistant';

const POSITION_GROUPS = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S'] as const;

const COACH_PAGES = [
  { label: 'Hub', path: '/hub' },
  { label: 'Film', path: '/film' },
  { label: 'Scouting', path: '/scouting' },
  { label: 'Board', path: '/board' },
  { label: 'Live', path: '/live' },
  { label: 'Playbook', path: '/playbook' },
  { label: 'Practice', path: '/practice' },
  { label: 'Field', path: '/field' },
  { label: 'Games', path: '/games' },
  { label: 'Roster', path: '/roster' },
  { label: 'Settings', path: '/settings' },
];

const PLAYER_PAGES = [
  { label: 'My Plan', path: '/my-plan' },
  { label: 'Film', path: '/player-film' },
  { label: 'Progress', path: '/progress' },
];

export function DevToolbar() {
  const { programId, programName } = useProgram();
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('coach');
  const [coachRole, setCoachRole] = useState<CoachRole>('head_coach');
  const [playerPosition, setPlayerPosition] = useState('WR');

  // Persist dev state in localStorage
  useEffect(() => {
    const saved = localStorage.getItem('audible_dev_state');
    if (saved) {
      try {
        const state = JSON.parse(saved);
        if (state.viewMode) setViewMode(state.viewMode);
        if (state.coachRole) setCoachRole(state.coachRole);
        if (state.playerPosition) setPlayerPosition(state.playerPosition);
      } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('audible_dev_state', JSON.stringify({ viewMode, coachRole, playerPosition }));
  }, [viewMode, coachRole, playerPosition]);

  const pages = viewMode === 'coach' ? COACH_PAGES : PLAYER_PAGES;

  return (
    <>
      {/* Collapsed tab */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-3 right-3 z-[9999] h-8 px-3 rounded-full bg-yellow-500 text-black text-[10px] font-bold uppercase tracking-wider shadow-lg hover:bg-yellow-400 transition-colors"
      >
        DEV {isOpen ? '▼' : '▲'}
      </button>

      {/* Expanded toolbar */}
      {isOpen && (
        <div className="fixed bottom-12 left-0 right-0 z-[9998] bg-slate-950 border-t border-yellow-500/30 px-4 py-3 shadow-2xl">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-4 text-xs">

            {/* Program info */}
            <div className="flex items-center gap-2 border-r border-slate-700 pr-4">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <div>
                <p className="text-yellow-400 font-bold">{programName ?? 'No program'}</p>
                <p className="text-slate-500 font-mono text-[9px]">{programId?.slice(0, 8) ?? '—'}</p>
              </div>
            </div>

            {/* View mode switch */}
            <div className="flex items-center gap-1 border-r border-slate-700 pr-4">
              <span className="text-slate-500 mr-1">View:</span>
              {(['coach', 'player'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setViewMode(mode);
                    router.push(mode === 'coach' ? '/hub' : '/my-plan');
                  }}
                  className={`px-2 py-1 rounded text-[10px] font-bold uppercase transition-all ${
                    viewMode === mode
                      ? 'bg-yellow-500 text-black'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            {/* Role switch (coach mode) */}
            {viewMode === 'coach' && (
              <div className="flex items-center gap-1 border-r border-slate-700 pr-4">
                <span className="text-slate-500 mr-1">Role:</span>
                {(['head_coach', 'coordinator', 'assistant'] as const).map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setCoachRole(role)}
                    className={`px-2 py-1 rounded text-[10px] font-bold uppercase transition-all ${
                      coachRole === role
                        ? 'bg-blue-500 text-white'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {role.replace('_', ' ')}
                  </button>
                ))}
              </div>
            )}

            {/* Position switch (player mode) */}
            {viewMode === 'player' && (
              <div className="flex items-center gap-1 border-r border-slate-700 pr-4">
                <span className="text-slate-500 mr-1">Pos:</span>
                {POSITION_GROUPS.map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => setPlayerPosition(pos)}
                    className={`px-1.5 py-1 rounded text-[10px] font-bold transition-all ${
                      playerPosition === pos
                        ? 'bg-cyan-500 text-black'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            )}

            {/* Quick nav */}
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-slate-500 mr-1">Go:</span>
              {pages.map((p) => (
                <button
                  key={p.path}
                  type="button"
                  onClick={() => router.push(p.path)}
                  className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
                    pathname === p.path || pathname.startsWith(p.path + '/')
                      ? 'bg-white/10 text-white'
                      : 'text-slate-500 hover:text-white'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
