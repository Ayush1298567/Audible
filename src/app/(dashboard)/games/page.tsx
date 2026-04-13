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

interface Opponent {
  id: string;
  name: string;
}

interface Game {
  id: string;
  opponentName: string | null;
  opponentId: string | null;
  playedAt: string | null;
  isHome: boolean | null;
  ourScore: number | null;
  opponentScore: number | null;
}

export default function GamesPage() {
  const { programId } = useProgram();
  const [games, setGames] = useState<Game[]>([]);
  const [opponents, setOpponents] = useState<Opponent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [addOpponentOpen, setAddOpponentOpen] = useState(false);
  const [addGameOpen, setAddGameOpen] = useState(false);

  const load = useCallback(async () => {
    if (!programId) return;
    try {
      const [gamesRes, oppsRes] = await Promise.all([
        fetch(`/api/games?programId=${programId}`),
        fetch(`/api/opponents?programId=${programId}`),
      ]);
      const gamesData = await gamesRes.json();
      const oppsData = await oppsRes.json();
      setGames(gamesData.games ?? []);
      setOpponents(oppsData.opponents ?? []);
    } catch {
      // empty state handles failure
    } finally {
      setIsLoading(false);
    }
  }, [programId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleAddOpponent(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await fetch('/api/opponents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        programId,
        name: form.get('name'),
        city: form.get('city') || undefined,
        state: form.get('state') || undefined,
      }),
    });
    setAddOpponentOpen(false);
    void load();
  }

  async function handleAddGame(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await fetch('/api/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        programId,
        opponentId: form.get('opponentId'),
        playedAt: form.get('playedAt')
          ? new Date(form.get('playedAt') as string).toISOString()
          : undefined,
        isHome: form.get('isHome') === 'true',
      }),
    });
    setAddGameOpen(false);
    void load();
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-wide text-foreground">
            Schedule &amp; Games
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="stat-number text-base text-primary">{games.length}</span>
            {' '}game{games.length !== 1 ? 's' : ''} &middot;{' '}
            <span className="stat-number text-base text-accent">{opponents.length}</span>
            {' '}opponent{opponents.length !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="flex gap-2">
          {/* Add Opponent dialog */}
          <Dialog open={addOpponentOpen} onOpenChange={setAddOpponentOpen}>
            <DialogTrigger className={`${buttonVariants({ variant: 'outline' })} border-border/50 bg-white/[0.03] hover:bg-white/[0.06]`}>
              Add Opponent
            </DialogTrigger>
            <DialogContent className="glass-card border-border/50">
              <DialogHeader>
                <DialogTitle className="font-display text-xl tracking-wide">
                  Add Opponent
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddOpponent} className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="opp-name" className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                    School Name
                  </Label>
                  <Input
                    id="opp-name"
                    name="name"
                    placeholder="Jefferson High"
                    required
                    autoFocus
                    className="bg-white/[0.03] border-border/50 focus:border-primary/50"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="opp-city" className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                      City
                    </Label>
                    <Input
                      id="opp-city"
                      name="city"
                      placeholder="Springfield"
                      className="bg-white/[0.03] border-border/50 focus:border-primary/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="opp-state" className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                      State
                    </Label>
                    <Input
                      id="opp-state"
                      name="state"
                      placeholder="TX"
                      maxLength={2}
                      className="bg-white/[0.03] border-border/50 focus:border-primary/50"
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full glow-blue">
                  Add Opponent
                </Button>
              </form>
            </DialogContent>
          </Dialog>

          {/* Add Game dialog */}
          <Dialog open={addGameOpen} onOpenChange={setAddGameOpen}>
            <DialogTrigger
              className={`${buttonVariants()} glow-blue`}
              disabled={opponents.length === 0}
            >
              Add Game
            </DialogTrigger>
            <DialogContent className="glass-card border-border/50">
              <DialogHeader>
                <DialogTitle className="font-display text-xl tracking-wide">
                  Add Game
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddGame} className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="game-opp" className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                    Opponent
                  </Label>
                  <select
                    id="game-opp"
                    name="opponentId"
                    required
                    className="flex h-10 w-full rounded-md border border-border/50 bg-white/[0.03] px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
                  >
                    <option value="">Select opponent...</option>
                    {opponents.map((opp) => (
                      <option key={opp.id} value={opp.id}>{opp.name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="game-date" className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                      Game Date
                    </Label>
                    <Input
                      id="game-date"
                      name="playedAt"
                      type="date"
                      className="bg-white/[0.03] border-border/50 focus:border-primary/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="game-home" className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                      Home / Away
                    </Label>
                    <select
                      id="game-home"
                      name="isHome"
                      className="flex h-10 w-full rounded-md border border-border/50 bg-white/[0.03] px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
                    >
                      <option value="true">Home</option>
                      <option value="false">Away</option>
                    </select>
                  </div>
                </div>
                <Button type="submit" className="w-full glow-blue">
                  Add Game
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
          <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-primary" />
          Loading schedule...
        </div>
      ) : games.length === 0 ? (
        <div className="glass-card rounded-xl border border-dashed border-border/50 py-16 text-center animate-fade-in">
          <p className="text-sm text-muted-foreground">
            {opponents.length === 0
              ? 'Add opponents first, then create games to upload film against.'
              : 'No games yet. Click \u201cAdd Game\u201d to schedule your first matchup.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((game, idx) => {
            const hasScore = game.ourScore != null && game.opponentScore != null;
            const won = hasScore && ((game.ourScore ?? 0) > (game.opponentScore ?? 0));
            const lost = hasScore && ((game.ourScore ?? 0) < (game.opponentScore ?? 0));

            return (
              <div
                key={game.id}
                className={`glass-card rounded-xl p-5 space-y-4 animate-fade-in stagger-${Math.min(idx + 1, 6) as 1 | 2 | 3 | 4 | 5 | 6} transition-all hover:border-primary/30`}
              >
                {/* Top row: location badge + date */}
                <div className="flex items-center justify-between">
                  <span className={`tag-chip ${game.isHome ? 'tag-positive' : 'tag-neutral'}`}>
                    {game.isHome ? 'Home' : 'Away'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {game.playedAt
                      ? new Date(game.playedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : 'Date TBD'}
                  </span>
                </div>

                {/* Opponent name */}
                <div>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground/60 mb-1">
                    {game.isHome ? 'vs' : '@'}
                  </p>
                  <h3 className="font-display text-lg font-bold text-foreground leading-tight">
                    {game.opponentName ?? 'Unknown Opponent'}
                  </h3>
                </div>

                {/* Score or status */}
                <div className="flex items-end justify-between pt-1 border-t border-border/20">
                  {hasScore ? (
                    <div className="flex items-baseline gap-2">
                      <span className={`stat-number text-3xl ${won ? 'text-success' : lost ? 'text-destructive' : 'text-foreground'}`}>
                        {game.ourScore}
                      </span>
                      <span className="text-muted-foreground/40 text-lg">–</span>
                      <span className="stat-number text-3xl text-muted-foreground/70">
                        {game.opponentScore}
                      </span>
                      {won && <span className="tag-chip tag-positive ml-1">W</span>}
                      {lost && <span className="tag-chip tag-negative ml-1">L</span>}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground/50 italic">No score recorded</span>
                  )}
                  <span className="tag-chip tag-warning">No film</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
