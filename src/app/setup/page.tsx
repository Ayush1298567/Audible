'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ProgramProvider, useProgram } from '@/lib/auth/program-context';

// ─── Types ──────────────────────────────────────────────────────

interface ProgramData {
  id: string;
  name: string;
  seasonId: string;
}

interface RosterPlayer {
  firstName: string;
  lastName: string;
  jerseyNumber: number;
  positions: string[];
  grade?: string;
}

interface ScheduleGame {
  opponentName: string;
  date: string;
  isHome: boolean;
}

type Step = 'program' | 'roster' | 'schedule' | 'done';

const STEPS: Step[] = ['program', 'roster', 'schedule', 'done'];

const STEP_LABELS: Record<Step, string> = {
  program: 'Program',
  roster: 'Roster',
  schedule: 'Schedule',
  done: 'Ready',
};

const POSITION_OPTIONS = [
  'QB', 'RB', 'WR', 'TE', 'OL', 'OT', 'OG', 'C',
  'DL', 'DE', 'DT', 'LB', 'ILB', 'OLB', 'CB', 'S', 'FS', 'SS',
  'K', 'P', 'LS', 'ATH',
];

// ─── Wizard ─────────────────────────────────────────────────────

function SetupWizard() {
  const router = useRouter();
  const { refresh } = useProgram();
  const [step, setStep] = useState<Step>('program');
  const [program, setProgram] = useState<ProgramData | null>(null);
  const [rosterPlayers, setRosterPlayers] = useState<RosterPlayer[]>([]);
  const [scheduleGames, setScheduleGames] = useState<ScheduleGame[]>([]);

  const stepIndex = STEPS.indexOf(step);

  function goNext() {
    const next = STEPS[stepIndex + 1];
    if (next) setStep(next);
  }

  function handleProgramCreated(data: ProgramData) {
    setProgram(data);
    refresh(); // Re-resolve program from the Clerk org after creation
    goNext();
  }

  function handleRosterDone(players: RosterPlayer[]) {
    setRosterPlayers(players);
    goNext();
  }

  function handleScheduleDone(games: ScheduleGame[]) {
    setScheduleGames(games);
    goNext();
  }

  function handleFinish() {
    router.push('/hub');
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center p-4">
      {/* Background */}
      <div className="gradient-mesh noise-overlay fixed inset-0 -z-10" />
      <div className="fixed inset-0 -z-10 opacity-[0.02]" style={{
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
        backgroundSize: '60px 60px',
      }} />

      <div className="w-full max-w-lg space-y-8">
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

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`flex items-center gap-2 transition-colors ${
                i < stepIndex ? 'text-primary' : i === stepIndex ? 'text-foreground' : 'text-muted-foreground/40'
              }`}>
                <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-all ${
                  i < stepIndex
                    ? 'bg-primary text-white'
                    : i === stepIndex
                    ? 'bg-primary/20 text-primary border border-primary/30'
                    : 'bg-white/[0.03] border border-white/[0.06]'
                }`}>
                  {i < stepIndex ? (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 6l3 3 5-5"/>
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                <span className="hidden sm:inline font-display text-[10px] uppercase tracking-widest">
                  {STEP_LABELS[s]}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-8 h-px transition-colors ${
                  i < stepIndex ? 'bg-primary/50' : 'bg-white/[0.06]'
                }`} />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="animate-fade-in">
          {step === 'program' && <StepProgram onDone={handleProgramCreated} />}
          {step === 'roster' && program && <StepRoster programId={program.id} onDone={handleRosterDone} />}
          {step === 'schedule' && program && <StepSchedule programId={program.id} seasonId={program.seasonId} onDone={handleScheduleDone} />}
          {step === 'done' && <StepDone programName={program?.name ?? ''} playerCount={rosterPlayers.length} gameCount={scheduleGames.length} onFinish={handleFinish} />}
        </div>

        {/* Footer */}
        <p className="text-center font-display text-[10px] uppercase tracking-widest text-muted-foreground/50">
          Powered by AI · Built for coaches
        </p>
      </div>
    </div>
  );
}

// ─── Step 1: Program ────────────────────────────────────────────

function StepProgram({ onDone }: { onDone: (data: ProgramData) => void }) {
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
      onDone({ id: data.program.id, name: data.program.name, seasonId: data.season.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setIsSubmitting(false);
    }
  }

  return (
    <div className="glass-card rounded-2xl p-8 space-y-6">
      <div className="space-y-1">
        <h2 className="font-display text-lg font-semibold tracking-wide">Set up your program</h2>
        <p className="text-sm text-muted-foreground">Tell us about your team to get started.</p>
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
            'Continue'
          )}
        </Button>
      </form>
    </div>
  );
}

// ─── Step 2: Roster ─────────────────────────────────────────────

function StepRoster({ programId, onDone }: { programId: string; onDone: (players: RosterPlayer[]) => void }) {
  const [players, setPlayers] = useState<RosterPlayer[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [csvParsing, setCsvParsing] = useState(false);

  async function handleAddPlayer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsAdding(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const player: RosterPlayer = {
      firstName: form.get('firstName') as string,
      lastName: form.get('lastName') as string,
      jerseyNumber: Number(form.get('jerseyNumber')),
      positions: [form.get('position') as string],
      grade: (form.get('grade') as string) || undefined,
    };

    try {
      const res = await fetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...player, programId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to add player');
      }

      setPlayers((prev) => [...prev, player]);
      e.currentTarget.reset();
      // Re-focus first name for quick entry
      (e.currentTarget.querySelector('#firstName') as HTMLInputElement)?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsAdding(false);
    }
  }

  function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvParsing(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = parseCsvRoster(text);
        if (parsed.length === 0) {
          throw new Error('No valid players found in CSV. Expected columns: FirstName, LastName, Jersey, Position');
        }

        // Save all parsed players
        const saved: RosterPlayer[] = [];
        for (const player of parsed) {
          const res = await fetch('/api/players', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...player, programId }),
          });
          if (res.ok) saved.push(player);
        }

        setPlayers((prev) => [...prev, ...saved]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse CSV');
      } finally {
        setCsvParsing(false);
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="glass-card rounded-2xl p-8 space-y-6">
      <div className="space-y-1">
        <h2 className="font-display text-lg font-semibold tracking-wide">Add your roster</h2>
        <p className="text-sm text-muted-foreground">
          Add players one at a time or upload a CSV. You can always edit this later.
        </p>
      </div>

      {/* CSV upload */}
      <div className="rounded-xl border border-dashed border-border/50 bg-white/[0.02] p-4">
        <label className="flex cursor-pointer items-center justify-center gap-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="12" y1="18" x2="12" y2="12"/>
            <line x1="9" y1="15" x2="15" y2="15"/>
          </svg>
          <div>
            <p className="font-display text-xs uppercase tracking-widest text-muted-foreground">
              {csvParsing ? 'Importing...' : 'Upload Roster CSV'}
            </p>
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">
              Columns: FirstName, LastName, Jersey, Position, Grade (optional)
            </p>
          </div>
          <input
            type="file"
            accept=".csv"
            onChange={handleCsvUpload}
            className="hidden"
            disabled={csvParsing}
          />
        </label>
      </div>

      {/* Manual add form */}
      <form onSubmit={handleAddPlayer} className="space-y-3">
        <div className="grid grid-cols-6 gap-2">
          <div className="col-span-2">
            <Input
              id="firstName"
              name="firstName"
              placeholder="First"
              required
              className="h-10 bg-white/[0.03] border-border/50 focus:border-primary/50 text-sm placeholder:text-muted-foreground/40"
            />
          </div>
          <div className="col-span-2">
            <Input
              name="lastName"
              placeholder="Last"
              required
              className="h-10 bg-white/[0.03] border-border/50 focus:border-primary/50 text-sm placeholder:text-muted-foreground/40"
            />
          </div>
          <div className="col-span-1">
            <Input
              name="jerseyNumber"
              type="number"
              placeholder="#"
              min={0}
              max={99}
              required
              className="h-10 bg-white/[0.03] border-border/50 focus:border-primary/50 text-sm placeholder:text-muted-foreground/40"
            />
          </div>
          <div className="col-span-1">
            <select
              name="position"
              required
              className="flex h-10 w-full rounded-lg border border-border/50 bg-white/[0.03] px-2 text-xs text-foreground focus:border-primary/50 focus:outline-none"
            >
              {POSITION_OPTIONS.map((pos) => (
                <option key={pos} value={pos}>{pos}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-6 gap-2">
          <div className="col-span-2">
            <select
              name="grade"
              className="flex h-10 w-full rounded-lg border border-border/50 bg-white/[0.03] px-2 text-xs text-foreground focus:border-primary/50 focus:outline-none"
            >
              <option value="">Grade</option>
              <option value="FR">Freshman</option>
              <option value="SO">Sophomore</option>
              <option value="JR">Junior</option>
              <option value="SR">Senior</option>
            </select>
          </div>
          <div className="col-span-4">
            <Button
              type="submit"
              variant="outline"
              className="w-full h-10 font-display text-xs uppercase tracking-widest"
              disabled={isAdding}
            >
              {isAdding ? 'Adding...' : '+ Add Player'}
            </Button>
          </div>
        </div>
      </form>

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Player list */}
      {players.length > 0 && (
        <div className="space-y-2">
          <p className="font-display text-xs uppercase tracking-widest text-muted-foreground">
            {players.length} player{players.length !== 1 ? 's' : ''} added
          </p>
          <div className="max-h-40 overflow-y-auto space-y-1 rounded-lg border border-white/[0.04] bg-white/[0.02] p-2">
            {players.map((p, i) => (
              <div key={i} className="flex items-center gap-3 px-2 py-1.5 rounded text-sm">
                <span className="font-display text-xs font-bold text-primary w-6 text-center">#{p.jerseyNumber}</span>
                <span className="text-foreground">{p.firstName} {p.lastName}</span>
                <span className="text-muted-foreground text-xs ml-auto">{p.positions.join(', ')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <Button
          type="button"
          variant="ghost"
          className="flex-1 h-11 font-display text-xs uppercase tracking-widest text-muted-foreground"
          onClick={() => onDone(players)}
        >
          Skip for now
        </Button>
        <Button
          type="button"
          className="flex-1 h-11 font-display text-sm font-semibold uppercase tracking-wider bg-primary hover:bg-primary/90 transition-all glow-blue"
          disabled={players.length === 0}
          onClick={() => onDone(players)}
        >
          Continue ({players.length})
        </Button>
      </div>
    </div>
  );
}

// ─── Step 3: Schedule ───────────────────────────────────────────

function StepSchedule({ programId, seasonId, onDone }: { programId: string; seasonId: string; onDone: (games: ScheduleGame[]) => void }) {
  const [games, setGames] = useState<ScheduleGame[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAddGame(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsAdding(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const opponentName = form.get('opponentName') as string;
    const date = form.get('date') as string;
    const isHome = form.get('isHome') === 'true';

    try {
      // Create opponent first
      const oppRes = await fetch('/api/opponents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ programId, name: opponentName }),
      });

      if (!oppRes.ok) throw new Error('Failed to create opponent');
      const oppData = await oppRes.json();

      // Create game
      const gameRes = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programId,
          opponentId: oppData.opponent.id,
          seasonId,
          playedAt: date ? new Date(date).toISOString() : undefined,
          isHome,
        }),
      });

      if (!gameRes.ok) throw new Error('Failed to create game');

      setGames((prev) => [...prev, { opponentName, date, isHome }]);
      e.currentTarget.reset();
      (e.currentTarget.querySelector('#opponentName') as HTMLInputElement)?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsAdding(false);
    }
  }

  return (
    <div className="glass-card rounded-2xl p-8 space-y-6">
      <div className="space-y-1">
        <h2 className="font-display text-lg font-semibold tracking-wide">Build your schedule</h2>
        <p className="text-sm text-muted-foreground">
          Add this season's opponents. Dates are optional — you can fill those in later.
        </p>
      </div>

      <form onSubmit={handleAddGame} className="space-y-3">
        <div className="grid grid-cols-5 gap-2">
          <div className="col-span-2">
            <Input
              id="opponentName"
              name="opponentName"
              placeholder="Opponent name"
              required
              className="h-10 bg-white/[0.03] border-border/50 focus:border-primary/50 text-sm placeholder:text-muted-foreground/40"
            />
          </div>
          <div className="col-span-2">
            <Input
              name="date"
              type="date"
              className="h-10 bg-white/[0.03] border-border/50 focus:border-primary/50 text-sm text-muted-foreground"
            />
          </div>
          <div className="col-span-1">
            <select
              name="isHome"
              className="flex h-10 w-full rounded-lg border border-border/50 bg-white/[0.03] px-2 text-xs text-foreground focus:border-primary/50 focus:outline-none"
            >
              <option value="true">Home</option>
              <option value="false">Away</option>
            </select>
          </div>
        </div>
        <Button
          type="submit"
          variant="outline"
          className="w-full h-10 font-display text-xs uppercase tracking-widest"
          disabled={isAdding}
        >
          {isAdding ? 'Adding...' : '+ Add Game'}
        </Button>
      </form>

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Game list */}
      {games.length > 0 && (
        <div className="space-y-2">
          <p className="font-display text-xs uppercase tracking-widest text-muted-foreground">
            {games.length} game{games.length !== 1 ? 's' : ''} scheduled
          </p>
          <div className="max-h-40 overflow-y-auto space-y-1 rounded-lg border border-white/[0.04] bg-white/[0.02] p-2">
            {games.map((g, i) => (
              <div key={i} className="flex items-center gap-3 px-2 py-1.5 rounded text-sm">
                <span className={`font-display text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded ${
                  g.isHome ? 'bg-primary/10 text-primary' : 'bg-white/[0.05] text-muted-foreground'
                }`}>
                  {g.isHome ? 'HOME' : 'AWAY'}
                </span>
                <span className="text-foreground">vs {g.opponentName}</span>
                {g.date && (
                  <span className="text-muted-foreground text-xs ml-auto">
                    {new Date(`${g.date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <Button
          type="button"
          variant="ghost"
          className="flex-1 h-11 font-display text-xs uppercase tracking-widest text-muted-foreground"
          onClick={() => onDone(games)}
        >
          Skip for now
        </Button>
        <Button
          type="button"
          className="flex-1 h-11 font-display text-sm font-semibold uppercase tracking-wider bg-primary hover:bg-primary/90 transition-all glow-blue"
          disabled={games.length === 0}
          onClick={() => onDone(games)}
        >
          Continue ({games.length})
        </Button>
      </div>
    </div>
  );
}

// ─── Step 4: Done ───────────────────────────────────────────────

function StepDone({ programName, playerCount, gameCount, onFinish }: {
  programName: string;
  playerCount: number;
  gameCount: number;
  onFinish: () => void;
}) {
  return (
    <div className="glass-card rounded-2xl p-8 space-y-8 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-success/10">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-success">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
      </div>

      <div className="space-y-2">
        <h2 className="font-display text-xl font-bold tracking-wide">You're all set</h2>
        <p className="text-sm text-muted-foreground">
          <span className="text-foreground font-semibold">{programName}</span> is ready to go.
        </p>
      </div>

      <div className="flex justify-center gap-6">
        {playerCount > 0 && (
          <div className="text-center">
            <p className="font-display text-2xl font-bold text-primary">{playerCount}</p>
            <p className="font-display text-[10px] uppercase tracking-widest text-muted-foreground">Players</p>
          </div>
        )}
        {gameCount > 0 && (
          <div className="text-center">
            <p className="font-display text-2xl font-bold text-cyan-400">{gameCount}</p>
            <p className="font-display text-[10px] uppercase tracking-widest text-muted-foreground">Games</p>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Next step: upload your first Hudl film export in the Film Room.
        </p>
        <Button
          type="button"
          className="w-full h-12 font-display text-sm font-semibold uppercase tracking-wider bg-primary hover:bg-primary/90 transition-all glow-blue"
          onClick={onFinish}
        >
          Enter Dashboard
          <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-2">
            <path d="M2 6h8M6 2l4 4-4 4"/>
          </svg>
        </Button>
      </div>
    </div>
  );
}

// ─── CSV Parser ─────────────────────────────────────────────────

function parseCsvRoster(text: string): RosterPlayer[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  const headerLine = lines[0];
  if (!headerLine) return [];
  const header = headerLine.toLowerCase().split(',').map((h) => h.trim());
  const firstNameIdx = header.findIndex((h) => h.includes('first'));
  const lastNameIdx = header.findIndex((h) => h.includes('last'));
  const jerseyIdx = header.findIndex((h) => h.includes('jersey') || h.includes('number') || h === '#');
  const posIdx = header.findIndex((h) => h.includes('pos'));
  const gradeIdx = header.findIndex((h) => h.includes('grade') || h.includes('year') || h.includes('class'));

  if (firstNameIdx === -1 || lastNameIdx === -1 || jerseyIdx === -1) return [];

  const players: RosterPlayer[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cols = line.split(',').map((c) => c.trim());
    const firstName = cols[firstNameIdx];
    const lastName = cols[lastNameIdx];
    const jersey = Number(cols[jerseyIdx]);

    if (!firstName || !lastName || Number.isNaN(jersey)) continue;

    const position = posIdx !== -1 && cols[posIdx] ? cols[posIdx].toUpperCase() : 'ATH';

    players.push({
      firstName,
      lastName,
      jerseyNumber: jersey,
      positions: [position],
      grade: gradeIdx !== -1 ? cols[gradeIdx] || undefined : undefined,
    });
  }

  return players;
}

// ─── Page ───────────────────────────────────────────────────────

export default function SetupPage() {
  return (
    <ProgramProvider>
      <SetupWizard />
    </ProgramProvider>
  );
}
