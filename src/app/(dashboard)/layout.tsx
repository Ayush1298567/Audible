'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import { useUser } from '@clerk/nextjs';
import { ProgramProvider, useProgram } from '@/lib/auth/program-context';
import { Sidebar } from '@/components/layout/sidebar';
import { CommandBar } from '@/components/layout/command-bar';
import { ErrorBoundary } from '@/components/shared/error-boundary';

/**
 * Dashboard guard — requires Clerk authentication AND a linked program.
 *
 * Flow:
 *   1. Clerk middleware handles auth — unauthenticated users never
 *      reach this layout.
 *   2. ProgramProvider resolves the Clerk org → programId via
 *      /api/programs (server-validated).
 *   3. If no program → redirect to /setup.
 */

function DashboardGuard({ children }: { children: React.ReactNode }) {
  const { programId, isLoading } = useProgram();
  const { isLoaded: isUserLoaded } = useUser();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (isLoading || !isUserLoaded) return;
    if (!programId) {
      router.replace('/setup');
    }
  }, [isLoading, isUserLoaded, programId, router]);

  if (isLoading || !isUserLoaded) {
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
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header with hamburger */}
        <div className="flex items-center gap-3 border-b border-border/50 px-4 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.05] transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="font-display text-sm font-bold tracking-wide text-foreground">AUDIBLE</span>
        </div>
        <CommandBar />
        <main className="flex-1 overflow-y-auto px-4 py-4 lg:px-8 lg:py-6">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
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
