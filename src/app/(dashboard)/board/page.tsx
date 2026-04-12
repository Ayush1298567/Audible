'use client';

import { useCallback, useEffect, useState } from 'react';
import { useProgram } from '@/lib/auth/program-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, } from '@/components/ui/card';
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">The Board</h1>
          <p className="text-muted-foreground">
            {selectedPlan ? `Game plan: ${selectedPlan.weekLabel}` : 'Build your game plan'}
          </p>
        </div>
        <div className="flex gap-2">
          {selectedPlan && selectedPlan.publishStatus !== 'published' && (
            <Button onClick={handlePublish} variant="default">
              Publish Game Plan
            </Button>
          )}
          {selectedPlan?.publishStatus === 'published' && (
            <Badge className="bg-green-100 text-green-800">Published</Badge>
          )}
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger className={buttonVariants({ variant: 'outline' })}>
              New Game Plan
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Game Plan</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="gp-opp">Opponent</Label>
                  <select id="gp-opp" name="opponentId" required
                    className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                    <option value="">Select...</option>
                    {opponents.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gp-week">Week Label</Label>
                  <Input id="gp-week" name="weekLabel" placeholder="Week 3 vs Jefferson" required />
                </div>
                <Button type="submit" className="w-full">Create</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Plan selector */}
      {!selectedPlan && (
        isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : gamePlans.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <p className="text-sm text-muted-foreground">
                No game plans yet. Click &quot;New Game Plan&quot; to start building.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {gamePlans.map(plan => (
              <button key={plan.id} type="button" onClick={() => void loadPlanPlays(plan.id)}
                className="rounded-lg border border-border p-4 text-left transition-colors hover:bg-muted">
                <p className="font-medium">{plan.weekLabel}</p>
                <Badge variant={plan.publishStatus === 'published' ? 'default' : 'secondary'} className="mt-2 text-xs">
                  {plan.publishStatus}
                </Badge>
              </button>
            ))}
          </div>
        )
      )}

      {/* Situation columns */}
      {selectedPlan && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {SITUATIONS.map(sit => {
            const sitPlays = playsBySituation[sit.key] ?? [];
            const sitSuggestions = suggestions[sit.key] ?? [];

            return (
              <div key={sit.key} className="w-64 shrink-0 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{sit.label}</h3>
                  <span className="text-xs text-muted-foreground">{sitPlays.length}</span>
                </div>

                {/* Play cards in this situation */}
                <div className="space-y-2">
                  {sitPlays.map(play => (
                    <Card key={play.id} className="text-sm">
                      <CardContent className="p-3">
                        <p className="font-medium">{play.playName}</p>
                        {play.formation && (
                          <p className="text-xs text-muted-foreground">{play.formation}</p>
                        )}
                        {play.attacksTendency && (
                          <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                            Attacks: {play.attacksTendency}
                          </p>
                        )}
                        {play.suggesterConfidence && (
                          <Badge variant="outline" className="mt-1 text-xs">
                            AI: {play.suggesterConfidence}
                          </Badge>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Suggestions */}
                {sitSuggestions.length > 0 && (
                  <div className="space-y-1 border-t border-dashed border-border pt-2">
                    <p className="text-xs font-medium text-blue-600">Suggestions:</p>
                    {sitSuggestions.map(sug => (
                      <button key={sug.playName} type="button"
                        onClick={() => void handleAddPlay(sit.key, sug.playName, sug.formation)}
                        className="w-full rounded border border-blue-200 bg-blue-50 p-2 text-left text-xs transition-colors hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950 dark:hover:bg-blue-900">
                        <p className="font-medium">{sug.playName}</p>
                        <p className="mt-0.5 text-blue-700 dark:text-blue-400">{sug.reasoning}</p>
                        <Badge variant="outline" className="mt-1 text-xs">{sug.confidence}</Badge>
                      </button>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="flex-1 text-xs"
                    onClick={() => {
                      const name = prompt('Play name:');
                      if (name) void handleAddPlay(sit.key, name);
                    }}>
                    + Add
                  </Button>
                  <Button variant="ghost" size="sm" className="flex-1 text-xs"
                    onClick={() => void handleSuggest(sit.key)}
                    disabled={loadingSuggestions === sit.key}>
                    {loadingSuggestions === sit.key ? '...' : 'Suggest'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
