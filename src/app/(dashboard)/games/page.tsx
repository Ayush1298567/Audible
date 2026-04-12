'use client';

import { useCallback, useEffect, useState } from 'react';
import { useProgram } from '@/lib/auth/program-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Schedule & Games</h1>
          <p className="text-muted-foreground">
            {games.length} game{games.length !== 1 ? 's' : ''} · {opponents.length} opponent{opponents.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={addOpponentOpen} onOpenChange={setAddOpponentOpen}>
            <DialogTrigger className={buttonVariants({ variant: 'outline' })}>
              Add Opponent
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Opponent</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddOpponent} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="opp-name">School Name</Label>
                  <Input id="opp-name" name="name" placeholder="Jefferson High" required autoFocus />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="opp-city">City</Label>
                    <Input id="opp-city" name="city" placeholder="Springfield" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="opp-state">State</Label>
                    <Input id="opp-state" name="state" placeholder="TX" maxLength={2} />
                  </div>
                </div>
                <Button type="submit" className="w-full">Add Opponent</Button>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={addGameOpen} onOpenChange={setAddGameOpen}>
            <DialogTrigger
              className={buttonVariants()}
              disabled={opponents.length === 0}
            >
              Add Game
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Game</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddGame} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="game-opp">Opponent</Label>
                  <select
                    id="game-opp"
                    name="opponentId"
                    required
                    className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Select opponent...</option>
                    {opponents.map((opp) => (
                      <option key={opp.id} value={opp.id}>{opp.name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="game-date">Game Date</Label>
                    <Input id="game-date" name="playedAt" type="date" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="game-home">Home/Away</Label>
                    <select
                      id="game-home"
                      name="isHome"
                      className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    >
                      <option value="true">Home</option>
                      <option value="false">Away</option>
                    </select>
                  </div>
                </div>
                <Button type="submit" className="w-full">Add Game</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : games.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {opponents.length === 0
                ? 'Add opponents first, then create games to upload film against.'
                : 'No games yet. Click "Add Game" to schedule your first matchup.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((game) => (
            <Card key={game.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {game.isHome ? 'vs' : '@'} {game.opponentName ?? 'Unknown'}
                  </CardTitle>
                  <Badge variant="outline">
                    {game.ourScore != null && game.opponentScore != null
                      ? `${game.ourScore}-${game.opponentScore}`
                      : 'No score'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  {game.playedAt
                    ? new Date(game.playedAt).toLocaleDateString()
                    : 'Date TBD'}
                </p>
                <Badge variant="secondary" className="mt-2 text-xs">
                  No film uploaded
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
