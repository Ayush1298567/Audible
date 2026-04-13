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

const SITUATIONS = [
  { key: 'opening_script', label: 'Opening Script' },
  { key: '1st_down', label: '1st Down' },
  { key: '2nd_short', label: '2nd & Short' },
  { key: '2nd_long', label: '2nd & Long' },
  { key: '3rd_short', label: '3rd & Short' },
  { key: '3rd_medium', label: '3rd & Medium' },
  { key: '3rd_long', label: '3rd & Long' },
  { key: 'red_zone', label: 'Red Zone' },
  { key: 'two_minute', label: 'Two Minute' },
  { key: 'backed_up', label: 'Backed Up' },
] as const;

interface GamePlan {
  id: string;
  opponentId: string;
  weekLabel: string;
  publishStatus: string;
}

interface GamePlanPlay {
  id: string;
  situation: string;
  playName: string;
  formation: string | null;
  playType: string | null;
  suggesterReasoning: string | null;
  suggesterConfidence: string | null;
  attacksTendency: string | null;
  sortOrder: number;
}

interface Suggestion {
  playName: string;
  formation: string;
  confidence: string;
  reasoning: string;
  attacksTendency: string;
}

interface Opponent {
  id: string;
  name: string;
}

export default function BoardPage() {
  const { programId } = useProgram();
  const [gamePlans, setGamePlans] = useState<GamePlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<GamePlan | null>(null);
  const [planPlays, setPlanPlays] = useState<GamePlanPlay[]>([]);
  const [opponents, setOpponents] = useState<Opponent[]>([]);
  const [suggestions, setSuggestions] = useState<Record<string, Suggestion[]>>({});
  const [loadingSuggestions, setLoadingSuggestions] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    if (!programId) return;
    const [plansRes, oppsRes] = await Promise.all([
      fetch(`/api/gameplan?programId=${programId}`),
      fetch(`/api/opponents?programId=${programId}`),
    ]);
    const plansData = await plansRes.json();
    const oppsData = await oppsRes.json();
    setGamePlans(plansData.gamePlans ?? []);
    setOpponents(oppsData.opponents ?? []);
    setIsLoading(false);
  }, [programId]);

  const loadPlanPlays = useCallback(async (planId: string) => {
    if (!programId) return;
    const res = await fetch(`/api/gameplan?programId=${programId}&gamePlanId=${planId}`);
    const data = await res.json();
    setPlanPlays(data.plays ?? []);
    setSelectedPlan(data.gamePlan ?? null);
  }, [programId]);

  useEffect(() => { void load(); }, [load]);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const res = await fetch('/api/gameplan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create',
        programId,
        opponentId: form.get('opponentId'),
        weekLabel: form.get('weekLabel'),
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setCreateOpen(false);
      void load();
      void loadPlanPlays(data.gamePlan.id);
    }
  }

  async function handleAddPlay(situation: string, playName: string, formation?: string) {
    if (!programId || !selectedPlan) return;
    await fetch('/api/gameplan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'addPlay',
        programId,
        gamePlanId: selectedPlan.id,
        situation,
        playName,
        formation,
        sortOrder: planPlays.filter(p => p.situation === situation).length,
      }),
    });
    void loadPlanPlays(selectedPlan.id);
  }

  async function handleSuggest(situation: string) {
    if (!programId || !selectedPlan) return;
    setLoadingSuggestions(situation);

    const sitConfig = SITUATIONS.find(s => s.key === situation);
    const down = situation.startsWith('1st') ? 1 : situation.startsWith('2nd') ? 2 : situation.startsWith('3rd') ? 3 : undefined;
    const bucket = situation.includes('short') ? 'short' : situation.includes('medium') ? 'medium' : situation.includes('long') ? 'long' : undefined;

    const res = await fetch('/api/gameplan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'suggest',
        programId,
        opponentId: selectedPlan.opponentId,
        situation: sitConfig?.label ?? situation,
        down,
        distanceBucket: bucket,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      setSuggestions(prev => ({ ...prev, [situation]: data.suggestions ?? [] }));
    }
    setLoadingSuggestions(null);
  }

  async function handlePublish() {
    if (!programId || !selectedPlan) return;
    await fetch('/api/gameplan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'publish',
        programId,
        gamePlanId: selectedPlan.id,
      }),
    });
    void loadPlanPlays(selectedPlan.id);
  }

  // Group plays by situation
  const playsBySituation: Record<string, GamePlanPlay[]> = {};
  for (const play of planPlays) {
    const sitKey = play.situation;
    if (!playsBySituation[sitKey]) playsBySituation[sitKey] = [];
    playsBySituation[sitKey]?.push(play);
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-wide text-foreground">
            The Board
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {selectedPlan
              ? <span className="text-accent font-medium">{selectedPlan.weekLabel}</span>
              : 'Select or create a game plan'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {selectedPlan && selectedPlan.publishStatus !== 'published' && (
            <Button onClick={handlePublish} className="glow-blue">
              Publish Game Plan
            </Button>
          )}
          {selectedPlan?.publishStatus === 'published' && (
            <span className="tag-chip tag-positive glow-success">Published</span>
          )}

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger className={`${buttonVariants({ variant: 'outline' })} border-border/50 bg-white/[0.03] hover:bg-white/[0.06]`}>
              New Game Plan
            </DialogTrigger>
            <DialogContent className="glass-card border-border/50">
              <DialogHeader>
                <DialogTitle className="font-display text-xl tracking-wide">
                  Create Game Plan
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="gp-opp" className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                    Opponent
                  </Label>
                  <select
                    id="gp-opp"
                    name="opponentId"
                    required
                    className="flex h-10 w-full rounded-md border border-border/50 bg-white/[0.03] px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
                  >
                    <option value="">Select...</option>
                    {opponents.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gp-week" className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                    Week Label
                  </Label>
                  <Input
                    id="gp-week"
                    name="weekLabel"
                    placeholder="Week 3 vs Jefferson"
                    required
                    className="bg-white/[0.03] border-border/50 focus:border-primary/50"
                  />
                </div>
                <Button type="submit" className="w-full glow-blue">Create</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Plan selector (no plan selected yet) */}
      {!selectedPlan && (
        isLoading ? (
          <div className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
            <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-primary" />
            Loading game plans...
          </div>
        ) : gamePlans.length === 0 ? (
          <div className="glass-card rounded-xl border border-dashed border-border/50 py-16 text-center animate-fade-in">
            <p className="text-sm text-muted-foreground">
              No game plans yet. Click &ldquo;New Game Plan&rdquo; to start building.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {gamePlans.map((plan, idx) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => void loadPlanPlays(plan.id)}
                className={`glass-card rounded-xl p-5 text-left transition-all hover:border-primary/30 animate-fade-in stagger-${Math.min(idx + 1, 6) as 1 | 2 | 3 | 4 | 5 | 6}`}
              >
                <p className="font-display font-bold text-base text-foreground mb-3">
                  {plan.weekLabel}
                </p>
                <span className={`tag-chip ${plan.publishStatus === 'published' ? 'tag-positive' : 'tag-neutral'}`}>
                  {plan.publishStatus}
                </span>
              </button>
            ))}
          </div>
        )
      )}

      {/* Situation columns (kanban board) */}
      {selectedPlan && (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {SITUATIONS.map((sit) => {
            const sitPlays = playsBySituation[sit.key] ?? [];
            const sitSuggestions = suggestions[sit.key] ?? [];

            return (
              <div key={sit.key} className="w-56 shrink-0 space-y-2">
                {/* Column header */}
                <div className="glass-card rounded-lg px-3 py-2 flex items-center justify-between">
                  <h3 className="font-display text-xs font-bold uppercase tracking-widest text-foreground/80">
                    {sit.label}
                  </h3>
                  <span className="text-xs font-mono text-muted-foreground/60">{sitPlays.length}</span>
                </div>

                {/* Play cards */}
                <div className="space-y-1.5">
                  {sitPlays.map((play) => (
                    <div
                      key={play.id}
                      className="rounded-lg border border-border/30 bg-surface-raised p-3 space-y-1.5 text-sm"
                    >
                      <p className="font-medium text-foreground leading-snug">{play.playName}</p>
                      {play.formation && (
                        <p className="text-xs text-muted-foreground">{play.formation}</p>
                      )}
                      {play.attacksTendency && (
                        <p className="text-xs text-cyan-400">
                          Attacks: {play.attacksTendency}
                        </p>
                      )}
                      {play.suggesterConfidence && (
                        <span className="tag-chip tag-info">
                          AI: {play.suggesterConfidence}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Suggestions */}
                {sitSuggestions.length > 0 && (
                  <div className="space-y-1.5 pt-1 border-t border-dashed border-border/30">
                    <p className="text-xs font-display font-semibold uppercase tracking-widest text-blue-400/70 px-1">
                      Suggestions
                    </p>
                    {sitSuggestions.map((sug) => (
                      <button
                        key={sug.playName}
                        type="button"
                        onClick={() => void handleAddPlay(sit.key, sug.playName, sug.formation)}
                        className="w-full rounded-lg border border-blue-500/20 bg-blue-500/5 p-2.5 text-left text-xs transition-all hover:bg-blue-500/10 hover:border-blue-500/30 space-y-1"
                      >
                        <p className="font-medium text-foreground">{sug.playName}</p>
                        <p className="italic text-blue-400 leading-snug">{sug.reasoning}</p>
                        <span className="tag-chip tag-info">{sug.confidence}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Column actions */}
                <div className="flex gap-1 pt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      const name = prompt('Play name:');
                      if (name) void handleAddPlay(sit.key, name);
                    }}
                    className="flex-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors border border-border/20 hover:border-border/40"
                  >
                    + Add
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSuggest(sit.key)}
                    disabled={loadingSuggestions === sit.key}
                    className="flex-1 rounded-md px-2 py-1.5 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 transition-colors border border-blue-500/20 hover:border-blue-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.06) 0%, rgba(6,182,212,0.04) 100%)' }}
                  >
                    {loadingSuggestions === sit.key ? (
                      <span className="pulse-dot inline-block">...</span>
                    ) : 'Suggest'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
