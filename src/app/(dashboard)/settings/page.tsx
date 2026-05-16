'use client';

import { useCallback, useEffect, useState } from 'react';
import { useOrganization } from '@clerk/nextjs';
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
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

interface DependencyCheck {
  name: string;
  required: boolean;
  configured: boolean;
  missing: string[];
}

interface DependencyResponse {
  status: 'ok' | 'degraded' | 'error';
  runtime: 'production' | 'development';
  checks: DependencyCheck[];
  missingRequired: string[];
}

const DEPENDENCY_LABELS: Record<string, { label: string; description: string }> = {
  database: {
    label: 'Database',
    description: 'Postgres schema, RLS, and tenant data access',
  },
  clerk: {
    label: 'Clerk',
    description: 'Coach authentication and organization context',
  },
  player_sessions: {
    label: 'Player Sessions',
    description: 'Signed player tokens and revocation safety',
  },
  rate_limit: {
    label: 'Redis Rate Limits',
    description: 'Distributed join-code and abuse throttling',
  },
  blob: {
    label: 'Blob Storage',
    description: 'Film, clips, and generated PDF storage',
  },
  llm: {
    label: 'Coach AI',
    description: 'Command bar, scouting, and report generation',
  },
  video_boundary_ai: {
    label: 'Video AI',
    description: 'Boundary detection and game analysis',
  },
  vision_secondary_model: {
    label: 'Vision Ensemble',
    description: 'Secondary model for CV agreement gates',
  },
  player_detection: {
    label: 'Player Detection',
    description: 'Optional detection model integration',
  },
};

const DEPENDENCY_ORDER = [
  'database',
  'clerk',
  'rate_limit',
  'blob',
  'llm',
  'player_sessions',
  'video_boundary_ai',
  'vision_secondary_model',
  'player_detection',
];

function dependencyLabel(name: string): string {
  return DEPENDENCY_LABELS[name]?.label ?? name.replaceAll('_', ' ');
}

function dependencyDescription(name: string): string {
  return DEPENDENCY_LABELS[name]?.description ?? 'Runtime dependency readiness';
}

function dependencyDetail(check: DependencyCheck): string {
  if (check.configured) {
    return check.required ? 'Required and configured' : 'Configured';
  }

  if (check.required) {
    return `Missing ${check.missing.join(', ')}`;
  }

  return 'Optional dependency not configured';
}

export default function SettingsPage() {
  const { programId, refresh } = useProgram();
  const { organization } = useOrganization();
  const [program, setProgram] = useState<ProgramInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [dependencies, setDependencies] = useState<DependencyResponse | null>(null);
  const [isDependenciesLoading, setIsDependenciesLoading] = useState(true);
  const [dependencyError, setDependencyError] = useState<string | null>(null);

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

  const loadDependencies = useCallback(async () => {
    setIsDependenciesLoading(true);
    setDependencyError(null);
    try {
      const res = await fetch('/api/health/dependencies');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? 'Dependency check failed');
      }
      setDependencies(data);
    } catch {
      setDependencyError('Readiness check failed');
    } finally {
      setIsDependenciesLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadDependencies(); }, [loadDependencies]);

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
    <div className="max-w-4xl space-y-6">
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

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="font-display text-sm uppercase tracking-widest">
                Readiness
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {dependencies
                  ? `${dependencies.runtime} checks are ${dependencies.status}`
                  : 'Checking runtime dependencies'}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { void loadDependencies(); }}
              disabled={isDependenciesLoading}
              className="w-fit gap-2 font-display text-xs uppercase tracking-widest"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isDependenciesLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {dependencyError ? (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
              {dependencyError}
            </div>
          ) : isDependenciesLoading && !dependencies ? (
            <div className="flex items-center gap-3 py-6">
              <RefreshCw className="h-4 w-4 animate-spin text-blue-400" />
              <p className="font-display text-xs uppercase tracking-widest text-slate-500">
                Checking dependencies...
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {[...(dependencies?.checks ?? [])]
                .sort((a, b) => {
                  const aIndex = DEPENDENCY_ORDER.indexOf(a.name);
                  const bIndex = DEPENDENCY_ORDER.indexOf(b.name);
                  return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
                })
                .map((check) => (
                  <div
                    key={check.name}
                    className={`rounded-lg border px-3 py-3 ${
                      check.configured
                        ? 'border-emerald-500/20 bg-emerald-500/5'
                        : check.required
                          ? 'border-red-500/20 bg-red-500/5'
                          : 'border-slate-700/60 bg-white/[0.02]'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                          check.configured
                            ? 'bg-emerald-500/10 text-emerald-300'
                            : check.required
                              ? 'bg-red-500/10 text-red-300'
                              : 'bg-slate-700/50 text-slate-400'
                        }`}
                      >
                        {check.configured ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          <AlertTriangle className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-display text-sm font-semibold text-white">
                            {dependencyLabel(check.name)}
                          </p>
                          <span className="rounded border border-white/10 px-1.5 py-0.5 font-display text-[10px] uppercase tracking-widest text-slate-400">
                            {check.required ? 'Required' : 'Optional'}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {dependencyDescription(check.name)}
                        </p>
                        <p
                          className={`mt-2 text-xs ${
                            check.configured
                              ? 'text-emerald-300'
                              : check.required
                                ? 'text-red-300'
                                : 'text-slate-400'
                          }`}
                        >
                          {dependencyDetail(check)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
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
