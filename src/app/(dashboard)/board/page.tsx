'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useProgram } from '@/lib/auth/program-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const LazyPublishDownloads = dynamic(
  () => import('@/components/gameplan/publish-downloads').then((mod) => mod.PublishDownloads),
  { ssr: false },
);
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { buttonVariants } from '@/components/ui/button';

// ─── Situation configs ──────────────────────────────────────

type Side = 'offense' | 'defense';

const OFFENSE_SITUATIONS = [
  { key: 'opening_script', label: 'Opening Script', isScript: true },
  { key: '1st_down', label: '1st Down' },
  { key: '2nd_short', label: '2nd & Short' },
  { key: '2nd_long', label: '2nd & Long' },
  { key: '3rd_short', label: '3rd & Short' },
  { key: '3rd_medium', label: '3rd & Medium' },
  { key: '3rd_long', label: '3rd & Long' },
  { key: 'red_zone', label: 'Red Zone' },
  { key: 'two_minute', label: 'Two Minute' },
  { key: 'goal_line', label: 'Goal Line' },
  { key: 'backed_up', label: 'Backed Up' },
  { key: 'two_point', label: 'Two-Point' },
] as const;

const DEFENSE_SITUATIONS = [
  { key: 'def_1st_down', label: '1st Down' },
  { key: 'def_2nd_short', label: '2nd & Short' },
  { key: 'def_2nd_long', label: '2nd & Long' },
  { key: 'def_3rd_short', label: '3rd & Short' },
  { key: 'def_3rd_medium', label: '3rd & Medium' },
  { key: 'def_3rd_long', label: '3rd & Long' },
  { key: 'def_red_zone', label: 'Red Zone' },
  { key: 'def_two_minute', label: 'Two Minute' },
  { key: 'def_goal_line', label: 'Goal Line' },
  { key: 'def_backed_up', label: 'Backed Up' },
] as const;

// ─── Types ──────────────────────────────────────────────────

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

interface GamePlanAssignment {
  id: string;
  positionGroup: string;
  situation: string;
  assignmentText: string;
  relatedPlayIds: unknown;
  createdAt: string;
}

const INSTALL_POSITION_GROUPS = [
  'QB',
  'RB',
  'WR',
  'TE',
  'OL',
  'DL',
  'LB',
  'DB',
  'CB',
  'S',
  'ST',
] as const;

// ─── Board Page ─────────────────────────────────────────────

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
  const [side, setSide] = useState<Side>('offense');
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);
  const [assignments, setAssignments] = useState<GamePlanAssignment[]>([]);
  const [installPositionGroup, setInstallPositionGroup] = useState<string>('WR');
  const [installSituation, setInstallSituation] = useState('player_install');
  const [installNotes, setInstallNotes] = useState('');
  const [installBusy, setInstallBusy] = useState(false);
  const [installFeedback, setInstallFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const situations = side === 'offense' ? OFFENSE_SITUATIONS : DEFENSE_SITUATIONS;

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
    setAssignments(data.assignments ?? []);
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

  async function handleAddPlay(situation: string, playName: string, formation?: string, suggesterData?: Partial<Suggestion>) {
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
        ...suggesterData,
      }),
    });
    void loadPlanPlays(selectedPlan.id);
  }

  async function handleSuggest(situation: string) {
    if (!programId || !selectedPlan) return;
    setLoadingSuggestions(situation);

    const sitConfig = situations.find(s => s.key === situation);
    const down = situation.includes('1st') ? 1 : situation.includes('2nd') ? 2 : situation.includes('3rd') ? 3 : undefined;
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

  async function handleAutoGenerate() {
    if (!programId || !selectedPlan) return;
    setIsAutoGenerating(true);

    // Generate suggestions for each situation in parallel (batched)
    const nonScriptSituations = situations.filter(s => !('isScript' in s && s.isScript));
    const results: Array<{ key: string; suggestions: Suggestion[] }> = [];

    // Batch 3 at a time to avoid overwhelming the API
    for (let i = 0; i < nonScriptSituations.length; i += 3) {
      const batch = nonScriptSituations.slice(i, i + 3);
      const batchResults = await Promise.all(
        batch.map(async (sit) => {
          const down = sit.key.includes('1st') ? 1 : sit.key.includes('2nd') ? 2 : sit.key.includes('3rd') ? 3 : undefined;
          const bucket = sit.key.includes('short') ? 'short' : sit.key.includes('medium') ? 'medium' : sit.key.includes('long') ? 'long' : undefined;

          const res = await fetch('/api/gameplan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'suggest',
              programId,
              opponentId: selectedPlan.opponentId,
              situation: sit.label,
              down,
              distanceBucket: bucket,
            }),
          });

          if (res.ok) {
            const data = await res.json();
            return { key: sit.key, suggestions: data.suggestions ?? [] };
          }
          return { key: sit.key, suggestions: [] };
        }),
      );
      results.push(...batchResults);
    }

    // Add the top suggestion for each situation as a play
    for (const { key, suggestions: sugs } of results) {
      const top = sugs[0];
      if (top) {
        await handleAddPlay(key, top.playName, top.formation, {
          reasoning: top.reasoning,
          confidence: top.confidence,
          attacksTendency: top.attacksTendency,
        });
      }
      // Store remaining suggestions for display
      setSuggestions(prev => ({ ...prev, [key]: sugs.slice(1) }));
    }

    setIsAutoGenerating(false);
  }

  async function handleDismiss(situation: string, suggestion: Suggestion) {
    if (!programId || !selectedPlan) return;
    // Remove from local suggestions
    setSuggestions(prev => ({
      ...prev,
      [situation]: (prev[situation] ?? []).filter(s => s.playName !== suggestion.playName),
    }));

    // Track dismissal in API
    await fetch('/api/gameplan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'dismiss',
        programId,
        opponentId: selectedPlan.opponentId,
        situation,
        playName: suggestion.playName,
        formation: suggestion.formation,
      }),
    });
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

  async function handlePushInstallToPlayers() {
    if (!programId || !selectedPlan) return;
    const trimmed = installNotes.trim();
    if (!trimmed) {
      setInstallFeedback({ kind: 'err', text: 'Add install notes for players.' });
      return;
    }
    setInstallBusy(true);
    setInstallFeedback(null);
    const res = await fetch('/api/gameplan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'pushInstallToPlayers',
        programId,
        gamePlanId: selectedPlan.id,
        positionGroup: installPositionGroup,
        situation: installSituation.trim() || 'player_install',
        assignmentText: trimmed,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setInstallBusy(false);
    if (!res.ok) {
      setInstallFeedback({
        kind: 'err',
        text: typeof body.error === 'string' ? body.error : 'Could not push install.',
      });
      return;
    }
    setInstallFeedback({
      kind: 'ok',
      text: `Pushed ${body.linkedCardCount ?? 0} board cards to ${body.positionGroup ?? installPositionGroup}.`,
    });
    void loadPlanPlays(selectedPlan.id);
  }

  // Group plays by situation
  const playsBySituation: Record<string, GamePlanPlay[]> = {};
  for (const play of planPlays) {
    if (!playsBySituation[play.situation]) playsBySituation[play.situation] = [];
    playsBySituation[play.situation]?.push(play);
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="font-display text-xs uppercase tracking-widest text-primary mb-1">
            Game Planning
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight text-white">
            The Board
          </h1>
          {selectedPlan && (
            <p className="mt-1 text-sm text-slate-500">
              <span className="text-cyan-400 font-medium">{selectedPlan.weekLabel}</span>
              {selectedPlan.publishStatus === 'published' && (
                <span className="ml-2 tag-chip tag-positive">Published</span>
              )}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Offense/Defense toggle */}
          {selectedPlan && (
            <div className="flex rounded-lg border border-slate-700/50 bg-slate-900/60 p-0.5">
              <button
                type="button"
                onClick={() => setSide('offense')}
                className={`px-3 py-1.5 rounded-md font-display text-xs uppercase tracking-wider transition-all ${
                  side === 'offense'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Offense
              </button>
              <button
                type="button"
                onClick={() => setSide('defense')}
                className={`px-3 py-1.5 rounded-md font-display text-xs uppercase tracking-wider transition-all ${
                  side === 'defense'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Defense
              </button>
            </div>
          )}

          {/* Auto-generate */}
          {selectedPlan && selectedPlan.publishStatus !== 'published' && (
            <Button
              onClick={handleAutoGenerate}
              disabled={isAutoGenerating}
              variant="outline"
              className="font-display text-xs uppercase tracking-widest border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
            >
              {isAutoGenerating ? (
                <span className="flex items-center gap-2">
                  <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Generating...
                </span>
              ) : (
                'Auto-Generate'
              )}
            </Button>
          )}

          {/* Publish */}
          {selectedPlan && selectedPlan.publishStatus !== 'published' && (
            <Button onClick={handlePublish} className="bg-primary hover:bg-primary/90 glow-blue font-display text-xs uppercase tracking-widest">
              Publish
            </Button>
          )}

          {/* Download PDFs (after publish) */}
          {selectedPlan && selectedPlan.publishStatus === 'published' && (
            <LazyPublishDownloads
              weekLabel={selectedPlan.weekLabel}
              opponentName={opponents.find(o => o.id === selectedPlan.opponentId)?.name ?? 'Unknown'}
              playsBySituation={playsBySituation}
              situations={[...OFFENSE_SITUATIONS, ...DEFENSE_SITUATIONS].map(s => ({ key: s.key, label: s.label }))}
            />
          )}

          {/* Create new */}
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger className={`${buttonVariants({ variant: 'outline' })} border-border/50 bg-white/[0.03] hover:bg-white/[0.06] font-display text-xs uppercase tracking-widest`}>
              + New Plan
            </DialogTrigger>
            <DialogContent className="glass-card border-border/50">
              <DialogHeader>
                <DialogTitle className="font-display text-xl tracking-wide">
                  Create Game Plan
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="gp-opp" className="font-display text-[10px] uppercase tracking-widest text-muted-foreground">
                    Opponent
                  </Label>
                  <select
                    id="gp-opp"
                    name="opponentId"
                    required
                    className="flex h-10 w-full rounded-lg border border-border/50 bg-white/[0.03] px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
                  >
                    <option value="">Select...</option>
                    {opponents.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gp-week" className="font-display text-[10px] uppercase tracking-widest text-muted-foreground">
                    Week Label
                  </Label>
                  <Input
                    id="gp-week"
                    name="weekLabel"
                    placeholder="Week 3 vs Jefferson"
                    required
                    className="h-10 bg-white/[0.03] border-border/50 focus:border-primary/50"
                  />
                </div>
                <Button type="submit" className="w-full glow-blue font-display text-xs uppercase tracking-widest">
                  Create
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Gradient divider */}
      <div className="h-px bg-gradient-to-r from-blue-500/50 via-cyan-500/30 to-transparent" />

      {selectedPlan && (
        <div className="glass-card rounded-xl border border-border/50 p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-display text-[10px] uppercase tracking-widest text-primary mb-1">
                Player app
              </p>
              <h2 className="font-display text-lg font-semibold text-foreground tracking-tight">
                Push install to players
              </h2>
              <p className="mt-1 text-xs text-muted-foreground max-w-xl">
                Links every card on this board to the chosen position group. Players only see installs after you publish this plan (head coach) and they match that group.
              </p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label className="font-display text-[10px] uppercase tracking-widest text-muted-foreground">
                Position group
              </Label>
              <select
                value={installPositionGroup}
                onChange={(e) => setInstallPositionGroup(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-border/50 bg-white/[0.03] px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
              >
                {INSTALL_POSITION_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label className="font-display text-[10px] uppercase tracking-widest text-muted-foreground">
                Situation key
              </Label>
              <Input
                value={installSituation}
                onChange={(e) => setInstallSituation(e.target.value)}
                placeholder="player_install"
                maxLength={30}
                className="h-10 bg-white/[0.03] border-border/50 focus:border-primary/50 font-mono text-xs"
              />
            </div>
            <div className="space-y-2 sm:col-span-2 lg:col-span-2">
              <Label className="font-display text-[10px] uppercase tracking-widest text-muted-foreground">
                Install notes
              </Label>
              <Textarea
                value={installNotes}
                onChange={(e) => setInstallNotes(e.target.value)}
                placeholder="What you want this group to study (alignments, keys, etc.)"
                maxLength={2000}
                className="min-h-[4.5rem] bg-white/[0.03] border-border/50 focus:border-primary/50 text-sm"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={() => void handlePushInstallToPlayers()}
              disabled={installBusy || planPlays.length === 0}
              className="glow-blue font-display text-xs uppercase tracking-widest"
            >
              {installBusy ? 'Pushing…' : 'Push to players'}
            </Button>
            {planPlays.length === 0 && (
              <span className="text-xs text-amber-400/90">Add at least one board card first.</span>
            )}
            {installFeedback && (
              <span
                className={`text-xs ${installFeedback.kind === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}
              >
                {installFeedback.text}
              </span>
            )}
          </div>
          {assignments.length > 0 && (
            <div className="border-t border-border/30 pt-4 space-y-2">
              <p className="font-display text-[10px] uppercase tracking-widest text-muted-foreground">
                Active installs on this plan
              </p>
              <ul className="space-y-2 text-sm">
                {assignments.map((a) => (
                  <li
                    key={a.id}
                    className="rounded-lg border border-border/20 bg-white/[0.02] px-3 py-2"
                  >
                    <span className="font-mono text-cyan-400/90 text-xs">{a.positionGroup}</span>
                    <span className="text-muted-foreground text-xs mx-2">·</span>
                    <span className="text-muted-foreground text-xs">{a.situation}</span>
                    <p className="mt-1 text-foreground/90 leading-snug">{a.assignmentText}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Plan selector */}
      {!selectedPlan && (
        isLoading ? (
          <div className="flex items-center gap-3 py-8">
            <svg className="h-4 w-4 animate-spin text-blue-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <p className="font-display text-sm uppercase tracking-widest text-slate-500">Loading...</p>
          </div>
        ) : gamePlans.length === 0 ? (
          <div className="glass-card rounded-xl border border-dashed border-border/50 py-16 text-center animate-fade-in">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-800/60 border border-slate-700/50 mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-slate-500">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V19.5a2.25 2.25 0 002.25 2.25h.75" />
              </svg>
            </div>
            <p className="font-display text-base font-semibold text-slate-300">No game plans yet</p>
            <p className="mt-2 text-sm text-slate-500">Click "+ New Plan" to start building.</p>
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
          {situations.map((sit) => {
            const sitPlays = playsBySituation[sit.key] ?? [];
            const sitSuggestions = suggestions[sit.key] ?? [];
            const isScript = 'isScript' in sit && sit.isScript;

            return (
              <div key={sit.key} className={`shrink-0 space-y-2 ${isScript ? 'w-72' : 'w-56'}`}>
                {/* Column header */}
                <div className={`glass-card rounded-lg px-3 py-2 flex items-center justify-between ${
                  isScript ? 'border-l-2 border-l-amber-500/50' : ''
                }`}>
                  <h3 className="font-display text-xs font-bold uppercase tracking-widest text-foreground/80">
                    {sit.label}
                  </h3>
                  <span className="text-xs font-mono text-muted-foreground/60">
                    {sitPlays.length}{isScript ? '/15' : ''}
                  </span>
                </div>

                {/* Play cards */}
                <div className="space-y-1.5">
                  {sitPlays.map((play, i) => (
                    <div
                      key={play.id}
                      className="rounded-lg border border-border/30 bg-white/[0.02] p-3 space-y-1.5 text-sm"
                    >
                      {isScript && (
                        <span className="font-display text-[10px] font-bold text-amber-400/70">
                          #{i + 1}
                        </span>
                      )}
                      <p className="font-medium text-foreground leading-snug">{play.playName}</p>
                      {play.formation && (
                        <p className="text-xs text-muted-foreground">{play.formation}</p>
                      )}
                      {play.attacksTendency && (
                        <p className="text-[10px] text-cyan-400">
                          Attacks: {play.attacksTendency}
                        </p>
                      )}
                      {play.suggesterConfidence && (
                        <span className="tag-chip tag-info text-[10px]">
                          AI: {play.suggesterConfidence}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Suggestions */}
                {sitSuggestions.length > 0 && (
                  <div className="space-y-1.5 pt-1 border-t border-dashed border-border/30">
                    <p className="font-display text-[10px] font-semibold uppercase tracking-widest text-blue-400/70 px-1">
                      Suggestions
                    </p>
                    {sitSuggestions.map((sug) => {
                      const fromScouting = sug.attacksTendency?.startsWith('from scouting walkthrough');
                      return (
                      <div key={sug.playName} className={`rounded-lg border p-2.5 text-xs space-y-1 ${fromScouting ? 'border-cyan-500/30 bg-cyan-500/5' : 'border-blue-500/20 bg-blue-500/5'}`}>
                        <div className="flex items-baseline gap-2">
                          <p className="font-medium text-foreground">{sug.playName}</p>
                          {fromScouting && (
                            <span className="shrink-0 rounded bg-cyan-500/15 px-1.5 py-0.5 text-[9px] font-display uppercase tracking-widest text-cyan-400">
                              from scouting
                            </span>
                          )}
                        </div>
                        <p className={`leading-snug ${fromScouting ? 'text-cyan-400/80' : 'text-blue-400/80'}`}>{sug.reasoning}</p>
                        <div className="flex items-center gap-1 pt-1">
                          <button
                            type="button"
                            onClick={() => void handleAddPlay(sit.key, sug.playName, sug.formation, {
                              reasoning: sug.reasoning,
                              confidence: sug.confidence,
                              attacksTendency: sug.attacksTendency,
                            })}
                            className="flex-1 rounded px-2 py-1 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors font-display uppercase tracking-wider"
                          >
                            Add
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDismiss(sit.key, sug)}
                            className="flex-1 rounded px-2 py-1 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors font-display uppercase tracking-wider"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}

                {/* Column actions */}
                {selectedPlan.publishStatus !== 'published' && (
                  <div className="flex gap-1 pt-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        const name = prompt('Play name:');
                        if (name) void handleAddPlay(sit.key, name);
                      }}
                      className="flex-1 rounded-md px-2 py-1.5 text-[10px] font-display uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors border border-border/20 hover:border-border/40"
                    >
                      + Add
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSuggest(sit.key)}
                      disabled={loadingSuggestions === sit.key}
                      className="flex-1 rounded-md px-2 py-1.5 text-[10px] font-display uppercase tracking-wider text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 transition-colors border border-blue-500/20 hover:border-blue-500/30 disabled:opacity-40"
                    >
                      {loadingSuggestions === sit.key ? '...' : 'Suggest'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
