'use client';

import { useCallback, useEffect, useState } from 'react';
import { useProgram } from '@/lib/auth/program-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Practice Builder</h1>
          <p className="text-muted-foreground">
            {sessionsList.length} session{sessionsList.length !== 1 ? 's' : ''}
          </p>
        </div>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger className={buttonVariants()}>
            New Session
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Practice Session</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sess-name">Session Name</Label>
                  <Input id="sess-name" name="name" placeholder="Coverage Recognition vs Jefferson" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sess-type">Type</Label>
                  <select id="sess-type" name="sessionType" required
                    className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                    <option value="film_review">Film Review</option>
                    <option value="recognition_challenge">Recognition Challenge</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sess-pos">Position Group</Label>
                  <select id="sess-pos" name="positionGroup" required
                    className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                    {['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'ALL'].map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sess-min">Estimated Minutes</Label>
                  <Input id="sess-min" name="estimatedMinutes" type="number" defaultValue={10} min={1} max={30} />
                </div>
              </div>

              {/* Play selector */}
              <div className="space-y-2">
                <Label>Select Plays ({selectedPlays.length} selected)</Label>
                <div className="max-h-48 overflow-y-auto space-y-1 rounded border border-border p-2">
                  {availablePlays.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">
                      No plays available. Upload film first.
                    </p>
                  ) : (
                    availablePlays.map((play) => (
                      <button
                        key={play.id}
                        type="button"
                        onClick={() => togglePlay(play.id)}
                        className={`w-full rounded px-2 py-1.5 text-left text-xs transition-colors ${
                          selectedPlays.includes(play.id)
                            ? 'bg-primary text-primary-foreground'
                            : 'hover:bg-muted'
                        }`}
                      >
                        #{play.playOrder} — {play.down ? `${play.down}&${play.distance}` : '-'} — {play.formation ?? '?'} — {play.playType ?? '?'}
                        {play.opponentName ? ` (${play.opponentName})` : ''}
                      </button>
                    ))
                  )}
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={selectedPlays.length === 0}>
                Create Session ({selectedPlays.length} plays)
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Sessions list */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading sessions...</p>
      ) : sessionsList.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              No practice sessions yet. Click &quot;New Session&quot; to build one.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sessionsList.map((session) => (
            <Card key={session.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{session.name}</CardTitle>
                  <Badge variant={session.isPublished ? 'default' : 'secondary'}>
                    {session.isPublished ? 'Published' : 'Draft'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">{session.sessionType === 'film_review' ? 'Film Review' : 'Recognition'}</Badge>
                  <span>{session.positionGroup}</span>
                  <span>~{session.estimatedMinutes} min</span>
                </div>
                {session.scheduledFor && (
                  <p className="text-xs text-muted-foreground">
                    Scheduled: {new Date(session.scheduledFor).toLocaleDateString()}
                  </p>
                )}
                {!session.isPublished && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handlePublish(session.id)}
                    className="w-full"
                  >
                    Publish to Players
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
