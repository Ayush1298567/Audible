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

interface Coach {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  clerkUserId: string;
}

export default function RosterPage() {
  const { programId } = useProgram();
  const [players, setPlayers] = useState<Player[]>([]);
  const [staff, setStaff] = useState<Coach[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [staffDialogOpen, setStaffDialogOpen] = useState(false);

  const loadPlayers = useCallback(async () => {
    if (!programId) return;
    try {
      const [playersRes, staffRes] = await Promise.all([
        fetch(`/api/players?programId=${programId}`),
        fetch(`/api/coaches?programId=${programId}`),
      ]);
      const playersData = await playersRes.json();
      const staffData = await staffRes.json();
      setPlayers(playersData.players ?? []);
      setStaff(staffData.coaches ?? []);
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
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-wide text-foreground">
            Roster
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="stat-number text-base text-primary">{players.length}</span>
            {' '}player{players.length !== 1 ? 's' : ''} on the depth chart
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger className={`${buttonVariants()} glow-blue`}>
            + Add Player
          </DialogTrigger>
          <DialogContent className="glass-card border-border/50">
            <DialogHeader>
              <DialogTitle className="font-display text-xl tracking-wide">
                Add Player
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddPlayer} className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName" className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                    First Name
                  </Label>
                  <Input
                    id="firstName"
                    name="firstName"
                    required
                    autoFocus
                    className="bg-white/[0.03] border-border/50 focus:border-primary/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName" className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                    Last Name
                  </Label>
                  <Input
                    id="lastName"
                    name="lastName"
                    required
                    className="bg-white/[0.03] border-border/50 focus:border-primary/50"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="jerseyNumber" className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                    Jersey #
                  </Label>
                  <Input
                    id="jerseyNumber"
                    name="jerseyNumber"
                    type="number"
                    min={0}
                    max={99}
                    required
                    className="bg-white/[0.03] border-border/50 focus:border-primary/50 font-display font-bold"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="grade" className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                    Grade / Year
                  </Label>
                  <Input
                    id="grade"
                    name="grade"
                    placeholder="Sr"
                    className="bg-white/[0.03] border-border/50 focus:border-primary/50"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="positions" className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  Positions (comma-separated)
                </Label>
                <Input
                  id="positions"
                  name="positions"
                  placeholder="QB, ATH"
                  required
                  className="bg-white/[0.03] border-border/50 focus:border-primary/50"
                />
              </div>
              <Button type="submit" className="w-full glow-blue">
                Add Player
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
          <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-primary" />
          Loading roster...
        </div>
      ) : players.length === 0 ? (
        <div className="glass-card rounded-xl border border-dashed border-border/50 py-16 text-center animate-fade-in">
          <p className="text-sm text-muted-foreground">
            No players yet. Click &ldquo;Add Player&rdquo; to build your roster.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(positionGroups).map(([position, groupPlayers], groupIndex) => (
            <div
              key={position}
              className={`glass-card rounded-xl overflow-hidden animate-fade-in stagger-${Math.min(groupIndex + 1, 6) as 1 | 2 | 3 | 4 | 5 | 6}`}
            >
              {/* Section header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-border/30 bg-white/[0.02]">
                <h2 className="font-display text-sm font-bold uppercase tracking-widest text-primary">
                  {position}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {groupPlayers.length} player{groupPlayers.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Table */}
              <Table>
                <TableHeader>
                  <TableRow className="border-border/30 hover:bg-transparent">
                    <TableHead className="w-16 text-xs font-medium uppercase tracking-widest text-muted-foreground/70">#</TableHead>
                    <TableHead className="text-xs font-medium uppercase tracking-widest text-muted-foreground/70">Name</TableHead>
                    <TableHead className="text-xs font-medium uppercase tracking-widest text-muted-foreground/70">Positions</TableHead>
                    <TableHead className="text-xs font-medium uppercase tracking-widest text-muted-foreground/70">Grade</TableHead>
                    <TableHead className="text-xs font-medium uppercase tracking-widest text-muted-foreground/70">Join Code</TableHead>
                    <TableHead className="w-20 text-xs font-medium uppercase tracking-widest text-muted-foreground/70">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupPlayers.map((player) => (
                    <TableRow
                      key={player.id}
                      className="border-border/20 hover:bg-white/[0.03] transition-colors"
                    >
                      <TableCell>
                        <span className="font-display font-bold text-lg text-foreground/90">
                          {player.jerseyNumber}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-foreground">
                          {player.firstName} {player.lastName}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {player.positions.map((pos) => (
                            <span key={pos} className="tag-chip tag-info">
                              {pos}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {player.grade ?? <span className="text-muted-foreground/40">—</span>}
                      </TableCell>
                      <TableCell>
                        {player.joinCode ? (
                          <span className="font-mono text-xs rounded px-2 py-0.5 bg-white/[0.04] border border-border/40 text-cyan-400 tracking-wider">
                            {player.joinCode}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40 text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-success" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))}
        </div>
      )}

      {/* Coaching Staff section */}
      <div className="space-y-4 pt-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl font-bold tracking-wide text-foreground">
              Coaching Staff
            </h2>
            <p className="text-xs text-muted-foreground">
              {staff.length} coach{staff.length !== 1 ? 'es' : ''}
            </p>
          </div>
          <Dialog open={staffDialogOpen} onOpenChange={setStaffDialogOpen}>
            <DialogTrigger className={`${buttonVariants({ variant: 'outline' })} border-border/50 bg-white/[0.03]`}>
              + Add Coach
            </DialogTrigger>
            <DialogContent className="glass-card border-border/50">
              <DialogHeader>
                <DialogTitle className="font-display text-xl tracking-wide">Add Coach</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = new FormData(e.currentTarget);
                  await fetch('/api/coaches', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      programId,
                      clerkUserId: form.get('clerkUserId'),
                      email: form.get('email'),
                      firstName: form.get('firstName') || undefined,
                      lastName: form.get('lastName') || undefined,
                      role: form.get('role'),
                    }),
                  });
                  setStaffDialogOpen(false);
                  void loadPlayers();
                }}
                className="space-y-4 pt-2"
              >
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="coach-first" className="text-xs uppercase tracking-widest text-muted-foreground">First Name</Label>
                    <Input id="coach-first" name="firstName" className="h-10 bg-white/[0.03]" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="coach-last" className="text-xs uppercase tracking-widest text-muted-foreground">Last Name</Label>
                    <Input id="coach-last" name="lastName" className="h-10 bg-white/[0.03]" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="coach-email" className="text-xs uppercase tracking-widest text-muted-foreground">Email</Label>
                  <Input id="coach-email" name="email" type="email" required className="h-10 bg-white/[0.03]" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="coach-clerk" className="text-xs uppercase tracking-widest text-muted-foreground">Clerk User ID</Label>
                  <Input id="coach-clerk" name="clerkUserId" required placeholder="user_..." className="h-10 bg-white/[0.03] font-mono text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="coach-role" className="text-xs uppercase tracking-widest text-muted-foreground">Role</Label>
                  <select id="coach-role" name="role" required className="flex h-10 w-full rounded-md border border-border/50 bg-white/[0.03] px-3 py-2 text-sm">
                    <option value="coordinator">Coordinator</option>
                    <option value="assistant">Assistant</option>
                  </select>
                </div>
                <Button type="submit" className="w-full glow-blue">Add Coach</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {staff.length === 0 ? (
          <div className="glass-card rounded-xl border border-dashed border-border/50 py-8 text-center">
            <p className="text-sm text-muted-foreground">No coaching staff yet.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {staff.map((c) => (
              <div key={c.id} className="glass-card rounded-xl p-4 space-y-2 group">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {[c.firstName, c.lastName].filter(Boolean).join(' ') || c.email}
                    </p>
                    <p className="text-xs text-muted-foreground">{c.email}</p>
                  </div>
                  <span className={`tag-chip ${c.role === 'head_coach' ? 'tag-positive' : c.role === 'coordinator' ? 'tag-info' : 'tag-neutral'}`}>
                    {c.role.replace('_', ' ')}
                  </span>
                </div>
                {c.role !== 'head_coach' && (
                  <div className="flex gap-2 pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={async () => {
                        const newRole = c.role === 'coordinator' ? 'assistant' : 'coordinator';
                        await fetch('/api/coaches', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            action: 'updateRole',
                            programId,
                            coachId: c.id,
                            role: newRole,
                          }),
                        });
                        void loadPlayers();
                      }}
                      className="text-[10px] text-blue-400 hover:text-blue-300 uppercase tracking-wider"
                    >
                      {c.role === 'coordinator' ? 'Demote to assistant' : 'Promote to coordinator'}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await fetch('/api/coaches', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            action: 'remove',
                            programId,
                            coachId: c.id,
                          }),
                        });
                        void loadPlayers();
                      }}
                      className="text-[10px] text-red-400 hover:text-red-300 uppercase tracking-wider"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
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
