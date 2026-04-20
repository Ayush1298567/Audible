'use client';

import { useCallback, useEffect, useState } from 'react';
import { useOrganization } from '@clerk/nextjs';
import { useProgram } from '@/lib/auth/program-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ProgramInfo {
  id: string;
  name: string;
  level: string;
  city: string | null;
  state: string | null;
  createdAt: string;
}

export default function SettingsPage() {
  const { programId, refresh } = useProgram();
  const { organization } = useOrganization();
  const [program, setProgram] = useState<ProgramInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!programId) return;
    try {
      const res = await fetch('/api/programs');
      const data = await res.json();
      const p = (data.programs ?? [])[0];
      if (p) setProgram(p);
    } catch {
      // handled by empty state
    } finally {
      setIsLoading(false);
    }
  }, [programId]);

  useEffect(() => { void load(); }, [load]);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSaving(true);
    setSaveMessage(null);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch('/api/programs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.get('name'),
          level: form.get('level'),
          city: form.get('city') || undefined,
          state: form.get('state') || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setSaveMessage(`Error: ${data.error}`);
      } else {
        setSaveMessage('Settings saved');
        refresh();
        void load();
      }
    } catch {
      setSaveMessage('Save failed');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 py-12">
        <svg className="h-4 w-4 animate-spin text-blue-400" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <p className="font-display text-sm uppercase tracking-widest text-slate-500">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <p className="font-display text-xs uppercase tracking-widest text-blue-400 mb-1">Configuration</p>
        <h1 className="font-display text-3xl font-bold tracking-tight text-white">Program Settings</h1>
      </div>

      <div className="h-px bg-gradient-to-r from-blue-500/50 via-cyan-500/30 to-transparent" />

      {/* Program info (editable) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-sm uppercase tracking-widest">Program Info</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="s-name" className="text-xs uppercase tracking-widest text-muted-foreground">Program Name</Label>
              <Input id="s-name" name="name" defaultValue={program?.name ?? ''} required className="h-10 bg-white/[0.03]" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="s-level" className="text-xs uppercase tracking-widest text-muted-foreground">Level</Label>
                <select
                  id="s-level"
                  name="level"
                  defaultValue={program?.level ?? 'hs'}
                  className="flex h-10 w-full rounded-lg border border-border/50 bg-white/[0.03] px-3 py-2 text-sm text-foreground"
                >
                  <option value="hs">High School</option>
                  <option value="d3">Division III</option>
                  <option value="d2">Division II</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-city" className="text-xs uppercase tracking-widest text-muted-foreground">City</Label>
                <Input id="s-city" name="city" defaultValue={program?.city ?? ''} className="h-10 bg-white/[0.03]" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-state" className="text-xs uppercase tracking-widest text-muted-foreground">State</Label>
                <Input id="s-state" name="state" defaultValue={program?.state ?? ''} maxLength={2} placeholder="TX" className="h-10 bg-white/[0.03]" />
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" disabled={isSaving} className="glow-blue font-display text-xs uppercase tracking-widest">
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
              {saveMessage && (
                <span className={`text-xs ${saveMessage.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
                  {saveMessage}
                </span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Organization info (read-only from Clerk) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-sm uppercase tracking-widest">Organization</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Clerk Organization</span>
            <span className="text-sm font-medium">{organization?.name ?? '-'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Org ID</span>
            <span className="font-mono text-xs text-slate-400">{organization?.id ?? '-'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Program ID</span>
            <span className="font-mono text-xs text-slate-400">{program?.id ?? '-'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Created</span>
            <span className="text-sm text-slate-400">
              {program?.createdAt ? new Date(program.createdAt).toLocaleDateString() : '-'}
            </span>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center pt-4">
        To manage team members, go to the Roster page. To manage Clerk organization settings, use your Clerk dashboard.
      </p>
    </div>
  );
}
