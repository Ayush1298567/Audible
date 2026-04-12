'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useProgram } from '@/lib/auth/program-context';

const NAV_ITEMS = [
  { label: 'Hub', href: '/', icon: '⌂' },
  { label: 'Film Room', href: '/film', icon: '▶' },
  { label: 'Scouting', href: '/scouting', icon: '🔍' },
  { label: 'Board', href: '/board', icon: '📋' },
  { label: 'The Field', href: '/field', icon: '🏟' },
  { label: 'Practice', href: '/practice', icon: '🏈' },
  { label: 'Games', href: '/games', icon: '📅' },
  { label: 'Roster', href: '/roster', icon: '👥' },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const { programName } = useProgram();

  return (
    <aside className="flex h-full w-56 flex-col border-r border-border bg-muted/30">
      {/* Program name */}
      <div className="border-b border-border px-4 py-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Program
        </p>
        <p className="mt-1 truncate text-sm font-semibold">
          {programName ?? 'No program'}
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href);

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <span className="text-base">{item.icon}</span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t border-border px-4 py-3">
        <p className="text-xs text-muted-foreground">Audible v0.1.0</p>
      </div>
    </aside>
  );
}
