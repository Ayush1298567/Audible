'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, Suspense } from 'react';
import { ProgramProvider, useProgram } from '@/lib/auth/program-context';
import { Sidebar } from '@/components/layout/sidebar';
import { CommandBar } from '@/components/layout/command-bar';

/**
 * Dev mode: add ?dev=true to any dashboard URL to auto-create a
 * test program and skip the setup flow. Standard SaaS dev pattern.
 *
 * Examples:
 *   /hub?dev=true
 *   /film?dev=true
 *   /scouting?dev=true
 *
 * This only creates a program if one doesn't already exist.
 * In production, swap this for real auth (Clerk).
 */

function DashboardGuard({ children }: { children: React.ReactNode }) {
  const { programId, isLoading, setProgramId } = useProgram();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (isLoading) return;

    // Dev mode: auto-create a test program
    const isDevMode = searchParams.get('dev') === 'true';

    if (!programId && isDevMode) {
      fetch('/api/programs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Dev Test Program',
          level: 'hs',
          city: 'Dev',
          state: 'TX',
          seasonYear: new Date().getFullYear(),
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.program) {
            setProgramId(data.program.id, data.program.name);
          }
        })
        .catch(() => {
          // If auto-create fails, fall back to setup
          router.replace('/setup');
        });
      return;
    }

    if (!programId) {
      router.replace('/setup');
    }
  }, [programId, isLoading, router, searchParams, setProgramId]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="space-y-3 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary animate-pulse">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <p className="font-display text-xs uppercase tracking-widest text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!programId) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <CommandBar />
        <main className="flex-1 overflow-y-auto px-8 py-6">{children}</main>
      </div>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProgramProvider>
      <Suspense fallback={null}>
        <DashboardGuard>{children}</DashboardGuard>
      </Suspense>
    </ProgramProvider>
  );
}
