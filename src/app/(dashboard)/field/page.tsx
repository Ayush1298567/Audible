'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useProgram } from '@/lib/auth/program-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { FieldCanvas } from '@/components/field/field-canvas';
import {
  initializePlay,
  tickPlay,
  type PlayState,
  type TendencyWeights,
} from '@/lib/simulation/engine';

interface Opponent {
  id: string;
  name: string;
}

export default function FieldPage() {
  const { programId } = useProgram();
  const [opponents, setOpponents] = useState<Opponent[]>([]);
  const [selectedOpponent, setSelectedOpponent] = useState<string>('');
  const [tendencies, setTendencies] = useState<TendencyWeights | null>(null);

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

  // Load opponents
  const loadOpponents = useCallback(async () => {
    if (!programId) return;
    const res = await fetch(`/api/opponents?programId=${programId}`);
    const data = await res.json();
    setOpponents(data.opponents ?? []);
  }, [programId]);

  useEffect(() => { void loadOpponents(); }, [loadOpponents]);

  // Load tendencies when opponent is selected
  const loadTendencies = useCallback(async () => {
    if (!programId || !selectedOpponent) return;
    const params = new URLSearchParams({
      programId,
      opponentId: selectedOpponent,
      type: 'overview',
    });
    const res = await fetch(`/api/tendencies?${params}`);
    const data = await res.json();

    // Convert tendency data into weights for the simulation
    const coverageRates = (data.formation?.tendencies ?? []).map(
      (t: { label: string; rate: number }) => ({
        coverage: t.label.toLowerCase().replace(/ /g, '_'),
        rate: t.rate,
      }),
    );

    const pressureRates = (data.playType?.tendencies ?? []).map(
      (t: { label: string; rate: number }) => ({
        type: t.label.toLowerCase().replace(/ /g, '_'),
        rate: t.rate,
      }),
    );

    const runTendency = data.playType?.tendencies?.find(
      (t: { label: string }) => t.label.toLowerCase().includes('run'),
    );
    const passTendency = data.playType?.tendencies?.find(
      (t: { label: string }) => t.label.toLowerCase().includes('pass'),
    );

    setTendencies({
      coverageRates: coverageRates.length > 0
        ? coverageRates
        : [{ coverage: 'cover_3', rate: 0.4 }, { coverage: 'cover_2', rate: 0.3 }, { coverage: 'cover_1', rate: 0.3 }],
      pressureRates: pressureRates.length > 0
        ? pressureRates
        : [{ type: 'base_4', rate: 0.6 }, { type: 'lb_blitz', rate: 0.3 }, { type: 'db_blitz', rate: 0.1 }],
      runRate: runTendency?.rate ?? 0.5,
      passRate: passTendency?.rate ?? 0.5,
    });
  }, [programId, selectedOpponent]);

  useEffect(() => { void loadTendencies(); }, [loadTendencies]);

  // Initialize a play
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
  }

  // Run the play
  function handleRun() {
    if (!playState) return;
    setIsRunning(true);

    // Tick every 100ms
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
  }

  // Stats from reps
  const avgYards = results.length > 0
    ? (results.reduce((sum, r) => sum + r.yards, 0) / results.length).toFixed(1)
    : null;
  const successRate = results.length > 0
    ? Math.round((results.filter((r) => r.success).length / results.length) * 100)
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">The Field</h1>
        <p className="text-muted-foreground">
          Tendency-driven simulation built from real film data
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* Canvas */}
        <div className="space-y-4">
          {playState ? (
            <FieldCanvas state={playState} />
          ) : (
            <div className="flex h-[500px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/30">
              <p className="text-sm text-muted-foreground">
                Set up a situation and press &quot;Set Play&quot;
              </p>
            </div>
          )}

          {/* Result card */}
          {playState?.result && (
            <Card className={playState.result.success ? 'border-green-300' : 'border-red-300'}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-lg font-bold">
                      {playState.result.yardsGained > 0 ? '+' : ''}{playState.result.yardsGained} yards
                    </p>
                    <p className="text-sm text-muted-foreground">{playState.result.description}</p>
                  </div>
                  <Badge variant={playState.result.success ? 'default' : 'secondary'}>
                    {playState.result.success ? 'Success' : 'Stopped'}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Controls */}
          <div className="flex gap-2">
            <Button onClick={handleSetup} disabled={isRunning} variant="outline">
              Set Play
            </Button>
            <Button onClick={handleRun} disabled={!playState || isRunning || playState.phase === 'result'}>
              Run
            </Button>
            <Button onClick={handleReset} variant="ghost">
              Reset
            </Button>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Situation bar */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Situation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Opponent</Label>
                <select
                  value={selectedOpponent}
                  onChange={(e) => setSelectedOpponent(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                >
                  <option value="">Default tendencies</option>
                  {opponents.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Down</Label>
                  <select value={down} onChange={(e) => setDown(Number(e.target.value))}
                    className="flex h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
                    {[1, 2, 3, 4].map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Distance</Label>
                  <select value={distance} onChange={(e) => setDistance(Number(e.target.value))}
                    className="flex h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20].map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Yard Line</Label>
                  <select value={yardLine} onChange={(e) => setYardLine(Number(e.target.value))}
                    className="flex h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
                    {[10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80].map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Formation</Label>
                  <select value={formation} onChange={(e) => setFormation(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
                    <option value="spread">Spread</option>
                    <option value="trips">Trips</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tendency info */}
          {tendencies && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Defense Tendencies</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {tendencies.coverageRates.slice(0, 4).map((c) => (
                  <div key={c.coverage} className="flex items-center justify-between text-xs">
                    <span>{c.coverage.replace(/_/g, ' ')}</span>
                    <span className="text-muted-foreground">{Math.round(c.rate * 100)}%</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Rep stats */}
          {results.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Rep History ({repCount} reps)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Avg yards</span>
                  <span className="font-medium">{avgYards}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Success rate</span>
                  <span className="font-medium">{successRate}%</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {results.slice(-10).map((r, i) => (
                    <Badge
                      key={`rep-${i.toString()}`}
                      variant={r.success ? 'default' : 'secondary'}
                      className="text-xs"
                    >
                      {r.yards > 0 ? '+' : ''}{r.yards}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
