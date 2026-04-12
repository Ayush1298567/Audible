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
      <div className="flex h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!programId) {
    return null;
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <CommandBar />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
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
