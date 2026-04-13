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

interface Session {
  id: string;
  name: string;
  sessionType: string;
  positionGroup: string;
  scheduledFor: string | null;
  estimatedMinutes: number;
  isPublished: boolean;
}

interface Play {
  id: string;
  playOrder: number;
  down: number | null;
  distance: number | null;
  formation: string | null;
  playType: string | null;
  opponentName: string | null;
}

export default function PracticeBuilderPage() {
  const { programId } = useProgram();
  const [sessionsList, setSessionsList] = useState<Session[]>([]);
  const [availablePlays, setAvailablePlays] = useState<Play[]>([]);
  const [selectedPlays, setSelectedPlays] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    if (!programId) return;
    const [sessionsRes, playsRes] = await Promise.all([
      fetch(`/api/sessions?programId=${programId}`),
      fetch(`/api/plays?programId=${programId}`),
    ]);
    const sessionsData = await sessionsRes.json();
    const playsData = await playsRes.json();
    setSessionsList(sessionsData.sessions ?? []);
    setAvailablePlays(playsData.plays ?? []);
    setIsLoading(false);
  }, [programId]);

  useEffect(() => { void load(); }, [load]);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (selectedPlays.length === 0) return;

    const form = new FormData(e.currentTarget);
    await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create',
        programId,
        name: form.get('name'),
        sessionType: form.get('sessionType'),
        positionGroup: form.get('positionGroup'),
        estimatedMinutes: Number(form.get('estimatedMinutes') || 10),
        playIds: selectedPlays,
      }),
    });
    setCreateOpen(false);
    setSelectedPlays([]);
    void load();
  }

  async function handlePublish(sessionId: string) {
    await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'publish', programId, sessionId }),
    });
    void load();
  }

  function togglePlay(playId: string) {
    setSelectedPlays((prev) =>
      prev.includes(playId) ? prev.filter((id) => id !== playId) : [...prev, playId],
    );
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-wide text-foreground">
            Practice Builder
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="stat-number text-base text-primary">{sessionsList.length}</span>
            {' '}session{sessionsList.length !== 1 ? 's' : ''} built
          </p>
        </div>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger className={`${buttonVariants()} glow-blue`}>
            New Session
          </DialogTrigger>
          <DialogContent className="glass-card border-border/50 max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display text-xl tracking-wide">
                Create Practice Session
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sess-name" className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                    Session Name
                  </Label>
                  <Input
                    id="sess-name"
                    name="name"
                    placeholder="Coverage Recognition vs Jefferson"
                    required
                    className="bg-white/[0.03] border-border/50 focus:border-primary/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sess-type" className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                    Type
                  </Label>
                  <select
                    id="sess-type"
                    name="sessionType"
                    required
                    className="flex h-10 w-full rounded-md border border-border/50 bg-white/[0.03] px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
                  >
                    <option value="film_review">Film Review</option>
                    <option value="recognition_challenge">Recognition Challenge</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sess-pos" className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                    Position Group
                  </Label>
                  <select
                    id="sess-pos"
                    name="positionGroup"
                    required
                    className="flex h-10 w-full rounded-md border border-border/50 bg-white/[0.03] px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
                  >
                    {['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'ALL'].map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sess-min" className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                    Estimated Minutes
                  </Label>
                  <Input
                    id="sess-min"
                    name="estimatedMinutes"
                    type="number"
                    defaultValue={10}
                    min={1}
                    max={30}
                    className="bg-white/[0.03] border-border/50 focus:border-primary/50"
                  />
                </div>
              </div>

              {/* Play selector */}
              <div className="space-y-2">
                <Label className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  Select Plays{' '}
                  {selectedPlays.length > 0 && (
                    <span className="ml-1 tag-chip tag-info normal-case">
                      {selectedPlays.length} selected
                    </span>
                  )}
                </Label>
                <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg border border-border/40 bg-white/[0.02] p-2">
                  {availablePlays.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">
                      No plays available. Upload film first.
                    </p>
                  ) : (
                    availablePlays.map((play) => {
                      const isSelected = selectedPlays.includes(play.id);
                      return (
                        <button
                          key={play.id}
                          type="button"
                          onClick={() => togglePlay(play.id)}
                          className={`w-full rounded-md px-3 py-2 text-left text-xs transition-all ${
                            isSelected
                              ? 'bg-primary/20 border border-primary/30 text-primary-foreground'
                              : 'hover:bg-white/[0.04] border border-transparent text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <span className="font-display font-bold text-foreground/70 mr-2">#{play.playOrder}</span>
                          {play.down ? `${play.down}&${play.distance}` : '—'} ·{' '}
                          {play.formation ?? '?'} · {play.playType ?? '?'}
                          {play.opponentName ? (
                            <span className="ml-1 text-muted-foreground/50">({play.opponentName})</span>
                          ) : null}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <Button type="submit" className="w-full glow-blue" disabled={selectedPlays.length === 0}>
                Create Session ({selectedPlays.length} plays)
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Sessions list */}
      {isLoading ? (
        <div className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
          <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-primary" />
          Loading sessions...
        </div>
      ) : sessionsList.length === 0 ? (
        <div className="glass-card rounded-xl border border-dashed border-border/50 py-16 text-center animate-fade-in">
          <p className="text-sm text-muted-foreground">
            No practice sessions yet. Click &ldquo;New Session&rdquo; to build one.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sessionsList.map((session, idx) => (
            <div
              key={session.id}
              className={`glass-card rounded-xl p-5 space-y-4 animate-fade-in stagger-${Math.min(idx + 1, 6) as 1 | 2 | 3 | 4 | 5 | 6} transition-all hover:border-primary/30`}
            >
              {/* Top: published badge */}
              <div className="flex items-center justify-between">
                {session.isPublished ? (
                  <span className="tag-chip tag-positive glow-success">Published</span>
                ) : (
                  <span className="tag-chip tag-neutral">Draft</span>
                )}
                <span className="text-xs text-muted-foreground">
                  ~{session.estimatedMinutes} min
                </span>
              </div>

              {/* Session name */}
              <div>
                <h3 className="font-display text-base font-bold text-foreground leading-snug">
                  {session.name}
                </h3>
              </div>

              {/* Meta row */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`tag-chip ${session.sessionType === 'film_review' ? 'tag-info' : 'tag-warning'}`}>
                  {session.sessionType === 'film_review' ? 'Film Review' : 'Recognition'}
                </span>
                <span className="font-display text-xs font-bold uppercase tracking-widest text-muted-foreground/70">
                  {session.positionGroup}
                </span>
              </div>

              {/* Scheduled date */}
              {session.scheduledFor && (
                <p className="text-xs text-muted-foreground border-t border-border/20 pt-2">
                  Scheduled: {new Date(session.scheduledFor).toLocaleDateString()}
                </p>
              )}

              {/* Publish button */}
              {!session.isPublished && (
                <Button
                  size="sm"
                  onClick={() => void handlePublish(session.id)}
                  className="w-full glow-blue"
                >
                  Publish to Players
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
