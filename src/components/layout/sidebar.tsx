'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useProgram } from '@/lib/auth/program-context';

const NAV_ITEMS = [
  { label: 'Hub', href: '/hub', icon: HubIcon },
  { label: 'Film Room', href: '/film', icon: FilmIcon },
  { label: 'Scouting', href: '/scouting', icon: ScoutingIcon },
  { label: 'Board', href: '/board', icon: BoardIcon },
  { label: 'The Field', href: '/field', icon: FieldIcon },
  { label: 'Practice', href: '/practice', icon: PracticeIcon },
  { label: 'Games', href: '/games', icon: GamesIcon },
  { label: 'Roster', href: '/roster', icon: RosterIcon },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const { programName } = useProgram();

  return (
    <aside className="flex h-full w-60 flex-col border-r border-border/50 bg-[#0d1117]">
      {/* Logo + Program */}
      <div className="px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 glow-blue">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-primary">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <h1 className="font-display text-sm font-bold tracking-wide text-foreground">AUDIBLE</h1>
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              Intelligence
            </p>
          </div>
        </div>
      </div>

      {/* Program badge */}
      <div className="mx-4 mb-4 rounded-lg border border-border/50 bg-surface-raised px-3 py-2.5">
        <p className="font-display text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          Program
        </p>
        <p className="mt-0.5 truncate text-sm font-semibold text-foreground">
          {programName ?? 'No program'}
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/hub' && pathname.startsWith(item.href));

            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'nav-active bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-white/[0.03] hover:text-foreground',
                  )}
                >
                  <Icon className={cn(
                    'h-4 w-4 shrink-0 transition-colors',
                    isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
                  )} />
                  <span className="font-display text-[13px] tracking-wide">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t border-border/30 px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-success pulse-dot" />
          <p className="font-display text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            Audible v0.1
          </p>
        </div>
      </div>
    </aside>
  );
}

// ─── Icon components (custom SVGs, not emoji) ───────────

function HubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="1" width="6" height="6" rx="1" />
      <rect x="9" y="1" width="6" height="6" rx="1" />
      <rect x="1" y="9" width="6" height="6" rx="1" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </svg>
  );
}

function FilmIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="6,3 13,8 6,13" />
    </svg>
  );
}

function ScoutingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="7" r="5" />
      <line x1="11" y1="11" x2="15" y2="15" />
    </svg>
  );
}

function BoardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="1" width="14" height="14" rx="2" />
      <line x1="5" y1="1" x2="5" y2="15" />
      <line x1="11" y1="1" x2="11" y2="15" />
    </svg>
  );
}

function FieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="14" height="10" rx="1" />
      <line x1="8" y1="3" x2="8" y2="13" />
      <circle cx="8" cy="8" r="2" />
    </svg>
  );
}

function PracticeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="8" cy="8" rx="7" ry="4" />
      <path d="M4 8c0-1.5 1.8-3 4-3s4 1.5 4 3" />
    </svg>
  );
}

function GamesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="12" height="12" rx="2" />
      <line x1="2" y1="6" x2="14" y2="6" />
      <line x1="6" y1="2" x2="6" y2="6" />
    </svg>
  );
}

function RosterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="5" r="3" />
      <path d="M2 14c0-3 2.5-5 6-5s6 2 6 5" />
    </svg>
  );
}
