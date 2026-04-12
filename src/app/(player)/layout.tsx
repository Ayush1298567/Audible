'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { PlayerSessionProvider, usePlayerSession } from '@/lib/auth/player-session';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const PLAYER_NAV = [
  { label: 'Film', href: '/player-film', icon: '▶' },
  { label: 'Game Plan', href: '/my-plan', icon: '📋' },
  { label: 'Progress', href: '/progress', icon: '📈' },
] as const;

function PlayerGuard({ children }: { children: React.ReactNode }) {
  const { session, isLoading, logout } = usePlayerSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !session) {
      router.replace('/join');
    }
  }, [session, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="flex min-h-screen flex-col">
      {/* Player header */}
      <header className="border-b border-border bg-background px-4 py-3">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <div>
            <p className="text-sm font-semibold">
              #{session.jerseyNumber} {session.firstName} {session.lastName}
            </p>
            <p className="text-xs text-muted-foreground">
              {session.positions.join(' / ')}
            </p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto w-full max-w-lg flex-1 p-4">
        {children}
      </main>

      {/* Bottom tab bar */}
      <nav className="border-t border-border bg-background">
        <div className="mx-auto flex max-w-lg">
          {PLAYER_NAV.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-1 flex-col items-center gap-1 py-3 text-xs transition-colors',
                  isActive
                    ? 'text-primary font-medium'
                    : 'text-muted-foreground',
                )}
              >
                <span className="text-lg">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export default function PlayerLayout({ children }: { children: React.ReactNode }) {
  return (
    <PlayerSessionProvider>
      <PlayerGuard>{children}</PlayerGuard>
    </PlayerSessionProvider>
  );
}
