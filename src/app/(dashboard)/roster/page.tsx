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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Player {
  id: string;
  firstName: string;
  lastName: string;
  jerseyNumber: number;
  positions: string[];
  grade: string | null;
  joinCode: string | null;
  status: string;
}

export default function RosterPage() {
  const { programId } = useProgram();
  const [players, setPlayers] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const loadPlayers = useCallback(async () => {
    if (!programId) return;
    try {
      const res = await fetch(`/api/players?programId=${programId}`);
      const data = await res.json();
      setPlayers(data.players ?? []);
    } catch {
      // silently fail on load — empty state handles it
    } finally {
      setIsLoading(false);
    }
  }, [programId]);

  useEffect(() => {
    void loadPlayers();
  }, [loadPlayers]);

  async function handleAddPlayer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const positionsRaw = (form.get('positions') as string) || '';

    const body = {
      programId,
      firstName: form.get('firstName') as string,
      lastName: form.get('lastName') as string,
      jerseyNumber: Number(form.get('jerseyNumber')),
      positions: positionsRaw.split(',').map((p) => p.trim()).filter(Boolean),
      grade: (form.get('grade') as string) || undefined,
    };

    const res = await fetch('/api/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      setDialogOpen(false);
      void loadPlayers();
    }
  }

  // Group players by position for the depth chart view
  const positionGroups = groupByPosition(players);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Roster</h1>
          <p className="text-muted-foreground">
            {players.length} player{players.length !== 1 ? 's' : ''}
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger className={buttonVariants()}>
            Add Player
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Player</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddPlayer} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input id="firstName" name="firstName" required autoFocus />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input id="lastName" name="lastName" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="jerseyNumber">Jersey #</Label>
                  <Input
                    id="jerseyNumber"
                    name="jerseyNumber"
                    type="number"
                    min={0}
                    max={99}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="grade">Grade/Year</Label>
                  <Input id="grade" name="grade" placeholder="Sr" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="positions">Positions (comma-separated)</Label>
                <Input
                  id="positions"
                  name="positions"
                  placeholder="QB, ATH"
                  required
                />
              </div>
              <Button type="submit" className="w-full">
                Add Player
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading roster...</p>
      ) : players.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-muted-foreground">
              No players yet. Click &quot;Add Player&quot; to build your roster.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(positionGroups).map(([position, groupPlayers]) => (
            <Card key={position}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{position}</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">#</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Positions</TableHead>
                      <TableHead>Grade</TableHead>
                      <TableHead>Join Code</TableHead>
                      <TableHead className="w-20">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupPlayers.map((player) => (
                      <TableRow key={player.id}>
                        <TableCell className="font-mono font-bold">
                          {player.jerseyNumber}
                        </TableCell>
                        <TableCell className="font-medium">
                          {player.firstName} {player.lastName}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {player.positions.map((pos) => (
                              <Badge key={pos} variant="secondary" className="text-xs">
                                {pos}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>{player.grade ?? '-'}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {player.joinCode ?? '-'}
                        </TableCell>
                        <TableCell>
                          <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function groupByPosition(playerList: Player[]): Record<string, Player[]> {
  const groups: Record<string, Player[]> = {};
  const positionOrder = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'K', 'P'];

  for (const player of playerList) {
    const primary = player.positions[0] ?? 'Other';
    if (!groups[primary]) groups[primary] = [];
    groups[primary].push(player);
  }

  // Sort groups by position order, unknown positions go last
  const sorted: Record<string, Player[]> = {};
  for (const pos of positionOrder) {
    if (groups[pos]) {
      sorted[pos] = groups[pos];
      delete groups[pos];
    }
  }
  // Remaining positions
  for (const [pos, list] of Object.entries(groups)) {
    sorted[pos] = list;
  }

  return sorted;
}
