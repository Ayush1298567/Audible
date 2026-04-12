'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ProgramProvider, useProgram } from '@/lib/auth/program-context';
import { Sidebar } from '@/components/layout/sidebar';
import { CommandBar } from '@/components/layout/command-bar';

function DashboardGuard({ children }: { children: React.ReactNode }) {
  const { programId, isLoading } = useProgram();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !programId) {
      router.replace('/setup');
    }
  }, [programId, isLoading, router]);

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
      <DashboardGuard>{children}</DashboardGuard>
    </ProgramProvider>
  );
}
