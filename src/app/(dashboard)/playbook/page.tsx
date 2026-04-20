'use client';

import { useCallback, useEffect, useState } from 'react';
import { useProgram } from '@/lib/auth/program-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { buttonVariants } from '@/components/ui/button';

// ─── Types ──────────────────────────────────────────────────

interface PlaybookPlay {
  id: string;
  name: string;
  formation: string;
  playType: string;
  personnel: string | null;
  situationTags: string[];
  createdAt: string;
}

const PLAY_TYPES = ['run', 'pass', 'screen', 'rpo', 'trick', 'special'] as const;

const SITUATION_TAG_OPTIONS = [
  '1st down', '2nd & short', '2nd & long',
  '3rd & short', '3rd & medium', '3rd & long',
  'red zone', 'goal line', 'two minute', 'backed up',
] as const;

// ─── Page ───────────────────────────────────────────────────

export default function PlaybookPage() {
  const { programId } = useProgram();
  const [plays, setPlays] = useState<PlaybookPlay[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!programId) return;
    try {
      const res = await fetch(`/api/playbook?programId=${programId}`);
      const data = await res.json();
      setPlays(data.plays ?? []);
    } catch {
      // handled by empty state
    } finally {
      setIsLoading(false);
    }
  }, [programId]);

  useEffect(() => { void load(); }, [load]);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!programId) return;
    const form = new FormData(e.currentTarget);
    const checkboxes = e.currentTarget.querySelectorAll<HTMLInputElement>('input[name="situationTag"]:checked');
    const tags = Array.from(checkboxes).map((cb) => cb.value);

    const res = await fetch('/api/playbook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        programId,
        name: form.get('name'),
        formation: form.get('formation'),
        playType: form.get('playType'),
        personnel: form.get('personnel') || undefined,
        situationTags: tags.length > 0 ? tags : undefined,
      }),
    });
    if (res.ok) {
      setCreateOpen(false);
      void load();
    }
  }

  async function handleDelete(id: string) {
    if (!programId) return;
    await fetch('/api/playbook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', programId, id }),
    });
    void load();
  }

  const filtered = plays.filter((p) => {
    if (filter !== 'all' && p.playType !== filter) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) &&
        !p.formation.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Group by formation for the card layout
  const byFormation = new Map<string, PlaybookPlay[]>();
  for (const p of filtered) {
    const group = byFormation.get(p.formation) ?? [];
    group.push(p);
    byFormation.set(p.formation, group);
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 py-12">
        <svg className="h-4 w-4 animate-spin text-blue-400" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <p className="font-display text-sm uppercase tracking-widest text-slate-500">
          Loading playbook...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-display text-xs uppercase tracking-widest text-blue-400 mb-1">
            Play Library
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight text-white">
            Playbook
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {plays.length} play{plays.length === 1 ? '' : 's'} ·{' '}
            {new Set(plays.map((p) => p.formation)).size} formation{new Set(plays.map((p) => p.formation)).size === 1 ? '' : 's'}
          </p>
        </div>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger
            className={`${buttonVariants({ variant: 'default' })} glow-blue font-display text-xs uppercase tracking-widest`}
          >
            + Add Play
          </DialogTrigger>
          <DialogContent className="glass-card border-border/50 sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-display text-xl tracking-wide">
                Add Play to Playbook
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pb-name" className="font-display text-[10px] uppercase tracking-widest text-muted-foreground">
                    Play Name
                  </Label>
                  <Input id="pb-name" name="name" placeholder="Mesh vs Trips Rt" required className="h-10 bg-white/[0.03]" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pb-formation" className="font-display text-[10px] uppercase tracking-widest text-muted-foreground">
                    Formation
                  </Label>
                  <Input id="pb-formation" name="formation" placeholder="Trips Right" required className="h-10 bg-white/[0.03]" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pb-type" className="font-display text-[10px] uppercase tracking-widest text-muted-foreground">
                    Play Type
                  </Label>
                  <select
                    id="pb-type"
                    name="playType"
                    required
                    className="flex h-10 w-full rounded-lg border border-border/50 bg-white/[0.03] px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
                  >
                    {PLAY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pb-personnel" className="font-display text-[10px] uppercase tracking-widest text-muted-foreground">
                    Personnel
                  </Label>
                  <Input id="pb-personnel" name="personnel" placeholder="11, 12, 21" className="h-10 bg-white/[0.03]" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="font-display text-[10px] uppercase tracking-widest text-muted-foreground">
                  Situation Tags
                </Label>
                <div className="flex flex-wrap gap-2">
                  {SITUATION_TAG_OPTIONS.map((tag) => (
                    <label key={tag} className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                      <input type="checkbox" name="situationTag" value={tag} className="rounded border-slate-600" />
                      {tag}
                    </label>
                  ))}
                </div>
              </div>

              <Button type="submit" className="w-full glow-blue font-display text-xs uppercase tracking-widest">
                Add to Playbook
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Input
          placeholder="Search plays..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-64 bg-white/[0.03] border-border/50 text-sm"
        />
        <div className="flex items-center gap-1 rounded-lg bg-slate-900/60 border border-slate-700/50 p-1">
          {['all', ...PLAY_TYPES].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFilter(t)}
              className={`px-2.5 py-1 rounded-md font-display text-[10px] uppercase tracking-wider transition-all ${
                filter === t
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {t === 'all' ? 'All' : t}
            </button>
          ))}
        </div>
      </div>

      <div className="h-px bg-gradient-to-r from-blue-500/50 via-cyan-500/30 to-transparent" />

      {/* Empty state */}
      {plays.length === 0 && (
        <div className="glass-card rounded-xl border border-dashed border-slate-700/50 flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-800/60 border border-slate-700/50 mb-4">
            <svg className="h-6 w-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
            </svg>
          </div>
          <p className="font-display text-base font-semibold text-slate-300">No plays in the playbook yet</p>
          <p className="mt-2 max-w-sm text-sm text-slate-500">
            Add your plays so the Board&apos;s AI can recommend from YOUR playbook, not generic concepts.
          </p>
        </div>
      )}

      {/* Formation groups */}
      {[...byFormation.entries()].map(([formation, formPlays]) => (
        <div key={formation} className="space-y-2">
          <h3 className="font-display text-sm font-bold text-slate-300 uppercase tracking-wider">
            {formation}
            <span className="ml-2 text-[10px] text-slate-500 tabular-nums">
              {formPlays.length} play{formPlays.length === 1 ? '' : 's'}
            </span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {formPlays.map((play) => (
              <div
                key={play.id}
                className="glass-card rounded-xl border border-slate-700/50 p-4 space-y-2 group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-white text-sm">{play.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {play.playType}{play.personnel ? ` · ${play.personnel}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDelete(play.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-300 text-xs"
                    title="Remove from playbook"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
                {play.situationTags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {play.situationTags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-display uppercase tracking-widest text-blue-400"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
