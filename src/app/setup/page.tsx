'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ProgramProvider, useProgram } from '@/lib/auth/program-context';

function SetupForm() {
  const router = useRouter();
  const { setProgramId } = useProgram();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const body = {
      name: form.get('name') as string,
      level: form.get('level') as string,
      city: (form.get('city') as string) || undefined,
      state: (form.get('state') as string) || undefined,
      seasonYear: new Date().getFullYear(),
    };

    try {
      const res = await fetch('/api/programs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to create program');
      }

      const data = await res.json();
      setProgramId(data.program.id, data.program.name);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center p-4">
      {/* Background */}
      <div className="gradient-mesh noise-overlay fixed inset-0 -z-10" />

      {/* Decorative grid lines */}
      <div className="fixed inset-0 -z-10 opacity-[0.02]" style={{
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
        backgroundSize: '60px 60px',
      }} />

      <div className="w-full max-w-md space-y-8">
        {/* Logo */}
        <div className="text-center space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 glow-blue">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-primary">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">AUDIBLE</h1>
            <p className="font-display text-xs uppercase tracking-[0.3em] text-muted-foreground">
              Football Intelligence Platform
            </p>
          </div>
        </div>

        {/* Form card */}
        <div className="glass-card rounded-2xl p-8 space-y-6">
          <div className="space-y-1">
            <h2 className="font-display text-lg font-semibold tracking-wide">Set up your program</h2>
            <p className="text-sm text-muted-foreground">
              Tell us about your team to get started.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name" className="font-display text-xs uppercase tracking-widest text-muted-foreground">
                Program Name
              </Label>
              <Input
                id="name"
                name="name"
                placeholder="Lincoln High Football"
                required
                autoFocus
                className="h-11 bg-white/[0.03] border-border/50 focus:border-primary/50 text-foreground placeholder:text-muted-foreground/40"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="level" className="font-display text-xs uppercase tracking-widest text-muted-foreground">
                Level
              </Label>
              <select
                id="level"
                name="level"
                defaultValue="hs"
                required
                className="flex h-11 w-full rounded-lg border border-border/50 bg-white/[0.03] px-3 text-sm text-foreground focus:border-primary/50 focus:outline-none"
              >
                <option value="hs">High School</option>
                <option value="d2">Division II</option>
                <option value="d3">Division III</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city" className="font-display text-xs uppercase tracking-widest text-muted-foreground">
                  City
                </Label>
                <Input
                  id="city"
                  name="city"
                  placeholder="Springfield"
                  className="h-11 bg-white/[0.03] border-border/50 focus:border-primary/50 text-foreground placeholder:text-muted-foreground/40"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="state" className="font-display text-xs uppercase tracking-widest text-muted-foreground">
                  State
                </Label>
                <Input
                  id="state"
                  name="state"
                  placeholder="TX"
                  maxLength={2}
                  className="h-11 bg-white/[0.03] border-border/50 focus:border-primary/50 text-foreground placeholder:text-muted-foreground/40"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-11 font-display text-sm font-semibold uppercase tracking-wider bg-primary hover:bg-primary/90 transition-all glow-blue"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span className="animate-pulse">Creating program...</span>
              ) : (
                'Create Program'
              )}
            </Button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center font-display text-[10px] uppercase tracking-widest text-muted-foreground/50">
          Powered by AI · Built for coaches
        </p>
      </div>
    </div>
  );
}

export default function SetupPage() {
  return (
    <ProgramProvider>
      <SetupForm />
    </ProgramProvider>
  );
}
