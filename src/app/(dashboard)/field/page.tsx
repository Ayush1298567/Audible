'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useProgram } from '@/lib/auth/program-context';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { FieldCanvas } from '@/components/field/field-canvas';
import { TeachingFeedback } from '@/components/field/teaching-feedback';
import {
  initializePlay,
  tickPlay,
  type PlayState,
  type TendencyWeights,
} from '@/lib/simulation/engine';
import {
  POSITION_MODES,
  type PositionMode,
  type DecisionPoint,
  type DecisionResult,
  computeSessionScore,
  type SessionScore,
} from '@/lib/simulation/position-modes';

// ─── Types ──────────────────────────────────────────────────

interface Opponent {
  id: string;
  name: string;
}

interface Scenario {
  id: string;
  name: string;
  down: number;
  distance: number;
  yardLine: number;
  formation: string;
  coverageShell: string | null;
  pressureType: string | null;
  positionMode: string | null;
  accessLevel: string;
}

const POSITION_LIST: PositionMode[] = ['QB', 'RB', 'WR', 'OL', 'DL', 'LB', 'CB', 'S'];

const FORMATIONS = [
  { value: 'spread', label: 'Spread (2x2)' },
  { value: 'trips', label: 'Trips' },
  { value: 'i_form', label: 'I-Form' },
  { value: 'shotgun', label: 'Shotgun' },
  { value: 'pistol', label: 'Pistol' },
  { value: 'empty', label: 'Empty' },
];

// ─── Page ───────────────────────────────────────────────────

export default function FieldPage() {
  const { programId } = useProgram();
  const [opponents, setOpponents] = useState<Opponent[]>([]);
  const [selectedOpponent, setSelectedOpponent] = useState<string>('');
  const [tendencies, setTendencies] = useState<TendencyWeights | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);

  // Position mode
  const [positionMode, setPositionMode] = useState<PositionMode>('QB');
  const modeConfig = POSITION_MODES[positionMode];

  // Situation controls
  const [down, setDown] = useState(1);
  const [distance, setDistance] = useState(10);
  const [yardLine, setYardLine] = useState(35);
  const [formation, setFormation] = useState('spread');

  // Simulation state
  const [playState, setPlayState] = useState<PlayState | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [repCount, setRepCount] = useState(0);
  const [results, setResults] = useState<Array<{ yards: number; success: boolean }>>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Decision mode
  const [currentDecision, setCurrentDecision] = useState<DecisionPoint | null>(null);
  const [decisionResults, setDecisionResults] = useState<DecisionResult[]>([]);
  const [showFeedback, setShowFeedback] = useState<DecisionResult | null>(null);
  const [sessionScore, setSessionScore] = useState<SessionScore | null>(null);
  const decisionStartRef = useRef<number>(0);

  // Load opponents
  const loadOpponents = useCallback(async () => {
    if (!programId) return;
    const res = await fetch(`/api/opponents?programId=${programId}`);
    const data = await res.json();
    setOpponents(data.opponents ?? []);
  }, [programId]);

  // Load scenarios
  const loadScenarios = useCallback(async () => {
    if (!programId) return;
    const res = await fetch(`/api/scenarios?programId=${programId}&positionMode=${positionMode}`);
    const data = await res.json();
    setScenarios(data.scenarios ?? []);
  }, [programId, positionMode]);

  useEffect(() => { void loadOpponents(); }, [loadOpponents]);
  useEffect(() => { void loadScenarios(); }, [loadScenarios]);

  // Load tendencies
  const loadTendencies = useCallback(async () => {
    if (!programId || !selectedOpponent) return;
    const overviewParams = new URLSearchParams({
      programId,
      opponentId: selectedOpponent,
      type: 'overview',
    });
    const cvParams = new URLSearchParams({
      programId,
      opponentId: selectedOpponent,
      type: 'cvDefense',
    });

    const [overviewRes, cvRes] = await Promise.all([
      fetch(`/api/tendencies?${overviewParams}`),
      fetch(`/api/tendencies?${cvParams}`),
    ]);
    const data = await overviewRes.json();
    const cv = await cvRes.json();

    const mapCoverage = (tendencies: Array<{ label: string; rate: number }>) =>
      tendencies.map((t) => ({
        coverage: t.label.toLowerCase().replace(/ /g, '_'),
        rate: t.rate,
      }));

    const mapPressure = (tendencies: Array<{ label: string; rate: number }>) =>
      tendencies.map((t) => ({
        type: t.label.toLowerCase().replace(/ /g, '_'),
        rate: t.rate,
      }));

    const cvCov = cv.coverage?.tendencies as Array<{ label: string; rate: number }> | undefined;
    const cvPres = cv.pressure?.tendencies as Array<{ label: string; rate: number }> | undefined;

    const coverageRates =
      cvCov && cvCov.length > 0
        ? mapCoverage(cvCov)
        : [{ coverage: 'cover_3', rate: 0.34 }, { coverage: 'cover_2', rate: 0.33 }, { coverage: 'cover_1', rate: 0.33 }];

    const pressureRates =
      cvPres && cvPres.length > 0
        ? mapPressure(cvPres)
        : [{ type: 'base_4', rate: 0.6 }, { type: 'lb_blitz', rate: 0.3 }, { type: 'db_blitz', rate: 0.1 }];

    const runT = data.playType?.tendencies?.find((t: { label: string }) => t.label.toLowerCase().includes('run'));
    const passT = data.playType?.tendencies?.find((t: { label: string }) => t.label.toLowerCase().includes('pass'));

    setTendencies({
      coverageRates,
      pressureRates,
      runRate: runT?.rate ?? 0.5,
      passRate: passT?.rate ?? 0.5,
    });
  }, [programId, selectedOpponent]);

  useEffect(() => { void loadTendencies(); }, [loadTendencies]);

  // Initialize play
  function handleSetup() {
    const weights = tendencies ?? {
      coverageRates: [{ coverage: 'cover_3', rate: 0.4 }, { coverage: 'cover_2', rate: 0.3 }, { coverage: 'cover_1', rate: 0.3 }],
      pressureRates: [{ type: 'base_4', rate: 0.6 }, { type: 'lb_blitz', rate: 0.3 }, { type: 'db_blitz', rate: 0.1 }],
      runRate: 0.5,
      passRate: 0.5,
    };
    const state = initializePlay(yardLine, down, distance, formation, weights);
    setPlayState(state);
    setIsRunning(false);
    setShowFeedback(null);
    setSessionScore(null);

    // Present pre-snap decisions
    const ctx = { coverageShell: state.coverageShell, pressureType: state.pressureType, down, distance, formation };
    const preSnap = modeConfig.preSnapDecisions(ctx);
    if (preSnap.length > 0) {
      setCurrentDecision(preSnap[0] ?? null);
      decisionStartRef.current = Date.now();
    }
  }

  // Handle decision answer
  function handleAnswer(answer: string) {
    if (!currentDecision || !playState) return;

    const timeMs = Date.now() - decisionStartRef.current;
    const correct = currentDecision.correctAnswers.includes(answer);
    const result: DecisionResult = { decision: currentDecision, playerAnswer: answer, correct, timeMs };

    setDecisionResults((prev) => [...prev, result]);

    if (!correct) {
      setShowFeedback(result);
    } else {
      // Show brief correct feedback then move on
      setShowFeedback(result);
    }
  }

  function handleContinueFeedback() {
    setShowFeedback(null);

    if (!playState) return;
    const ctx = { coverageShell: playState.coverageShell, pressureType: playState.pressureType, down, distance, formation };

    // Check if there are more pre-snap decisions
    const preSnap = modeConfig.preSnapDecisions(ctx);
    const answeredCount = decisionResults.filter((r) => r.decision.phase === 'pre_snap').length + 1;

    if (answeredCount < preSnap.length) {
      setCurrentDecision(preSnap[answeredCount] ?? null);
      decisionStartRef.current = Date.now();
    } else if (playState.phase === 'pre_snap' || playState.phase === 'snap') {
      // All pre-snap done, run the play
      setCurrentDecision(null);
      handleRun();
    } else {
      // Check post-snap decisions
      const postSnap = modeConfig.postSnapDecisions(ctx);
      const postAnswered = decisionResults.filter((r) => r.decision.phase === 'post_snap').length;

      if (postAnswered < postSnap.length) {
        setCurrentDecision(postSnap[postAnswered] ?? null);
        decisionStartRef.current = Date.now();
      } else {
        // All decisions done — show score
        setCurrentDecision(null);
        setSessionScore(computeSessionScore(decisionResults));
      }
    }
  }

  // Run the play
  function handleRun() {
    if (!playState) return;
    setIsRunning(true);

    const id = setInterval(() => {
      setPlayState((prev) => {
        if (!prev || prev.phase === 'result') {
          clearInterval(id);
          setIsRunning(false);
          return prev;
        }
        const next = tickPlay(prev);
        if (next.phase === 'result' && next.result) {
          setRepCount((c) => c + 1);
          setResults((r) => [...r, { yards: next.result?.yardsGained ?? 0, success: next.result?.success ?? false }]);

          // Present post-snap decisions after result
          const ctx = { coverageShell: next.coverageShell, pressureType: next.pressureType, down, distance, formation };
          const postSnap = modeConfig.postSnapDecisions(ctx);
          if (postSnap.length > 0) {
            setTimeout(() => {
              setCurrentDecision(postSnap[0] ?? null);
              decisionStartRef.current = Date.now();
            }, 500);
          }
        }
        return next;
      });
    }, 100);

    intervalRef.current = id;
  }

  // Reset
  function handleReset() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setPlayState(null);
    setIsRunning(false);
    setCurrentDecision(null);
    setDecisionResults([]);
    setShowFeedback(null);
    setSessionScore(null);
  }

  // Load a saved scenario
  function handleLoadScenario(scenario: Scenario) {
    setDown(scenario.down);
    setDistance(scenario.distance);
    setYardLine(scenario.yardLine);
    setFormation(scenario.formation);
    if (scenario.positionMode) {
      setPositionMode(scenario.positionMode as PositionMode);
    }
    handleReset();
  }

  // Save current setup as scenario
  async function handleSaveScenario() {
    if (!programId) return;
    const name = prompt('Scenario name:');
    if (!name) return;

    await fetch('/api/scenarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        programId,
        name,
        down,
        distance,
        yardLine,
        formation,
        coverageShell: playState?.coverageShell,
        pressureType: playState?.pressureType,
        positionMode,
        opponentId: selectedOpponent || undefined,
      }),
    });
    void loadScenarios();
  }

  // Stats
  const avgYards = results.length > 0
    ? (results.reduce((sum, r) => sum + r.yards, 0) / results.length).toFixed(1)
    : null;
  const successRate = results.length > 0
    ? Math.round((results.filter((r) => r.success).length / results.length) * 100)
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="font-display text-xs uppercase tracking-widest text-primary mb-1">
            Simulation
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight text-white">
            The Field
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            <span className="text-cyan-400">{modeConfig.camera.name}</span> · {modeConfig.position} Mode
          </p>
        </div>

        {/* Position mode selector */}
        <div className="flex gap-1 rounded-lg border border-slate-700/50 bg-slate-900/60 p-0.5">
          {POSITION_LIST.map((pos) => (
            <button
              key={pos}
              type="button"
              onClick={() => { setPositionMode(pos); handleReset(); }}
              className={`px-2.5 py-1.5 rounded-md font-display text-[10px] uppercase tracking-wider transition-all ${
                positionMode === pos
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'
              }`}
            >
              {pos}
            </button>
          ))}
        </div>
      </div>

      {/* Gradient divider */}
      <div className="h-px bg-gradient-to-r from-blue-500/50 via-cyan-500/30 to-transparent" />

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* Main area */}
        <div className="space-y-4">
          {/* Canvas */}
          {playState ? (
            <FieldCanvas state={playState} />
          ) : (
            <div className="flex h-[500px] items-center justify-center rounded-xl glass-card border-dashed">
              <div className="text-center space-y-2">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 mx-auto">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                </div>
                <p className="font-display text-sm font-semibold text-slate-300">
                  Set up a situation and press "Set Play"
                </p>
                <p className="text-xs text-slate-500">
                  {modeConfig.position} Mode — {modeConfig.camera.name}
                </p>
              </div>
            </div>
          )}

          {/* Decision prompt */}
          {currentDecision && !showFeedback && (
            <div className="glass-card rounded-xl p-5 space-y-4 animate-fade-in border-l-2 border-l-primary/50">
              <div>
                <p className="font-display text-[10px] uppercase tracking-widest text-primary mb-1">
                  {currentDecision.phase === 'pre_snap' ? 'Pre-Snap Read' : 'Post-Snap Decision'}
                </p>
                <h3 className="font-display text-sm font-bold text-white">
                  {currentDecision.prompt}
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {currentDecision.options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => handleAnswer(opt)}
                    className="rounded-lg border border-slate-700/50 bg-white/[0.03] px-4 py-3 text-sm text-slate-300 hover:bg-primary/10 hover:border-primary/30 hover:text-white transition-all text-left"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Teaching feedback */}
          {showFeedback && (
            <TeachingFeedback result={showFeedback} onContinue={handleContinueFeedback} />
          )}

          {/* Result card */}
          {playState?.result && !currentDecision && !showFeedback && (
            <div className={`glass-card rounded-xl p-5 border-l-2 ${
              playState.result.success ? 'border-l-emerald-500/50' : 'border-l-red-500/50'
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className={`font-display text-2xl font-bold ${
                    playState.result.success ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {playState.result.yardsGained > 0 ? '+' : ''}{playState.result.yardsGained} yards
                  </p>
                  <p className="text-sm text-slate-400 mt-1">{playState.result.description}</p>
                </div>
                <span className={`tag-chip ${playState.result.success ? 'tag-positive' : 'tag-negative'}`}>
                  {playState.result.success ? 'Success' : 'Stopped'}
                </span>
              </div>
            </div>
          )}

          {/* Session score */}
          {sessionScore && (
            <div className="glass-card rounded-xl p-5 space-y-4 animate-fade-in">
              <h3 className="font-display text-sm font-bold text-white uppercase tracking-wider">
                Session Score
              </h3>
              <div className="flex gap-6">
                <div className="text-center">
                  <p className={`stat-number text-3xl ${sessionScore.accuracy >= 0.7 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {Math.round(sessionScore.accuracy * 100)}%
                  </p>
                  <p className="font-display text-[10px] uppercase tracking-widest text-slate-500">Accuracy</p>
                </div>
                <div className="text-center">
                  <p className="stat-number text-3xl text-cyan-400">
                    {(sessionScore.avgDecisionTimeMs / 1000).toFixed(1)}s
                  </p>
                  <p className="font-display text-[10px] uppercase tracking-widest text-slate-500">Avg Decision</p>
                </div>
                <div className="text-center">
                  <p className="stat-number text-3xl text-slate-300">
                    {sessionScore.correctDecisions}/{sessionScore.totalDecisions}
                  </p>
                  <p className="font-display text-[10px] uppercase tracking-widest text-slate-500">Correct</p>
                </div>
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="flex gap-2">
            <Button onClick={handleSetup} disabled={isRunning} variant="outline"
              className="font-display text-xs uppercase tracking-widest">
              Set Play
            </Button>
            <Button onClick={handleRun} disabled={!playState || isRunning || playState.phase === 'result' || !!currentDecision}
              className="font-display text-xs uppercase tracking-widest bg-primary hover:bg-primary/90">
              Run
            </Button>
            <Button onClick={handleReset} variant="ghost"
              className="font-display text-xs uppercase tracking-widest">
              Reset
            </Button>
            {playState && (
              <Button onClick={handleSaveScenario} variant="outline"
                className="font-display text-xs uppercase tracking-widest border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10">
                Save Scenario
              </Button>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Situation bar */}
          <div className="glass-card rounded-xl p-4 space-y-3">
            <p className="font-display text-[10px] uppercase tracking-widest text-slate-500">Situation</p>

            <div className="space-y-1">
              <Label className="font-display text-[10px] uppercase tracking-widest text-slate-500">Opponent</Label>
              <select
                value={selectedOpponent}
                onChange={(e) => setSelectedOpponent(e.target.value)}
                className="flex h-9 w-full rounded-lg border border-slate-700/50 bg-white/[0.03] px-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
              >
                <option value="">Default tendencies</option>
                {opponents.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="font-display text-[10px] uppercase tracking-widest text-slate-500">Down</Label>
                <select value={down} onChange={(e) => setDown(Number(e.target.value))}
                  className="flex h-9 w-full rounded-lg border border-slate-700/50 bg-white/[0.03] px-2 text-sm text-foreground focus:outline-none focus:border-primary/50">
                  {[1, 2, 3, 4].map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="font-display text-[10px] uppercase tracking-widest text-slate-500">Distance</Label>
                <select value={distance} onChange={(e) => setDistance(Number(e.target.value))}
                  className="flex h-9 w-full rounded-lg border border-slate-700/50 bg-white/[0.03] px-2 text-sm text-foreground focus:outline-none focus:border-primary/50">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20].map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="font-display text-[10px] uppercase tracking-widest text-slate-500">Yard Line</Label>
                <select value={yardLine} onChange={(e) => setYardLine(Number(e.target.value))}
                  className="flex h-9 w-full rounded-lg border border-slate-700/50 bg-white/[0.03] px-2 text-sm text-foreground focus:outline-none focus:border-primary/50">
                  {[5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95].map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="font-display text-[10px] uppercase tracking-widest text-slate-500">Formation</Label>
                <select value={formation} onChange={(e) => setFormation(e.target.value)}
                  className="flex h-9 w-full rounded-lg border border-slate-700/50 bg-white/[0.03] px-2 text-sm text-foreground focus:outline-none focus:border-primary/50">
                  {FORMATIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Tendencies */}
          {tendencies && (
            <div className="glass-card rounded-xl p-4 space-y-2">
              <p className="font-display text-[10px] uppercase tracking-widest text-slate-500">Defense Tendencies</p>
              {tendencies.coverageRates.slice(0, 4).map((c) => (
                <div key={c.coverage} className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">{c.coverage.replace(/_/g, ' ')}</span>
                  <span className="text-slate-300 font-medium">{Math.round(c.rate * 100)}%</span>
                </div>
              ))}
            </div>
          )}

          {/* Rep stats */}
          {results.length > 0 && (
            <div className="glass-card rounded-xl p-4 space-y-2">
              <p className="font-display text-[10px] uppercase tracking-widest text-slate-500">
                Rep History ({repCount})
              </p>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Avg yards</span>
                <span className="font-medium text-slate-300">{avgYards}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Success rate</span>
                <span className="font-medium text-slate-300">{successRate}%</span>
              </div>
              <div className="flex flex-wrap gap-1 pt-1">
                {results.slice(-10).map((r, i) => (
                  <span
                    key={`rep-${i.toString()}`}
                    className={`tag-chip text-[10px] ${r.success ? 'tag-positive' : 'tag-negative'}`}
                  >
                    {r.yards > 0 ? '+' : ''}{r.yards}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Scenario library */}
          <div className="glass-card rounded-xl p-4 space-y-2">
            <p className="font-display text-[10px] uppercase tracking-widest text-slate-500">
              Saved Scenarios
            </p>
            {scenarios.length === 0 ? (
              <p className="text-xs text-slate-500 py-2">
                No scenarios saved for {positionMode} mode yet.
              </p>
            ) : (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {scenarios.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleLoadScenario(s)}
                    className="w-full text-left rounded-lg px-3 py-2 text-xs text-slate-300 hover:bg-white/[0.04] transition-colors"
                  >
                    <span className="font-medium">{s.name}</span>
                    <span className="text-slate-500 ml-2">
                      {s.down}&{s.distance} @ {s.yardLine}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
