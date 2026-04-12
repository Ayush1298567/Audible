'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useProgram } from '@/lib/auth/program-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { TendencyBreakdown } from '@/lib/tendencies/queries';

interface OverviewData {
  formation: TendencyBreakdown;
  playType: TendencyBreakdown;
  direction: TendencyBreakdown;
  personnel: TendencyBreakdown;
  success: TendencyBreakdown;
  situations: TendencyBreakdown[];
}

export default function OpponentScoutingPage() {
  const params = useParams();
  const opponentId = params.opponentId as string;
  const { programId } = useProgram();
  const [data, setData] = useState<OverviewData | null>(null);
  const [selfScout, setSelfScout] = useState<TendencyBreakdown[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!programId || !opponentId) return;
    try {
      const [overviewRes, selfScoutRes] = await Promise.all([
        fetch(`/api/tendencies?programId=${programId}&opponentId=${opponentId}&type=overview`),
        fetch(`/api/tendencies?programId=${programId}&type=selfScout`),
      ]);
      const overviewData = await overviewRes.json();
      const selfScoutData = await selfScoutRes.json();
      setData(overviewData);
      setSelfScout(selfScoutData.alerts ?? []);
    } catch {
      // handled by empty state
    } finally {
      setIsLoading(false);
    }
  }, [programId, opponentId]);

  useEffect(() => { void load(); }, [load]);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Computing tendencies...</p>;
  }

  if (!data) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No film data available for this opponent. Upload game film first.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Opponent Scouting</h1>
        <p className="text-muted-foreground">
          {data.formation.sampleSize} plays analyzed
          <ConfidenceBadge confidence={data.formation.confidence} />
        </p>
      </div>

      <Tabs defaultValue="tendencies">
        <TabsList>
          <TabsTrigger value="tendencies">Tendencies</TabsTrigger>
          <TabsTrigger value="situations">By Situation</TabsTrigger>
          <TabsTrigger value="selfscout">Self-Scout</TabsTrigger>
        </TabsList>

        {/* Tendencies tab */}
        <TabsContent value="tendencies" className="space-y-6 pt-4">
          <div className="grid gap-6 lg:grid-cols-2">
            <TendencyCard breakdown={data.formation} />
            <TendencyCard breakdown={data.playType} />
            <TendencyCard breakdown={data.direction} />
            <TendencyCard breakdown={data.personnel} />
            <TendencyCard breakdown={data.success} title="Success Rate by Play Type" isRate />
          </div>
        </TabsContent>

        {/* Situation breakdown tab */}
        <TabsContent value="situations" className="space-y-4 pt-4">
          {data.situations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No situation data available. Upload more film for this opponent.
            </p>
          ) : (
            data.situations.map((sit) => (
              <SituationCard key={sit.situation} breakdown={sit} />
            ))
          )}
        </TabsContent>

        {/* Self-scout tab */}
        <TabsContent value="selfscout" className="space-y-4 pt-4">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
            <h3 className="font-semibold text-red-800 dark:text-red-200">
              Predictability Alerts
            </h3>
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">
              These are your own tendencies a good defensive coordinator will find.
            </p>
          </div>

          {selfScout.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No high-predictability patterns detected. Either your play-calling
                  is well-balanced, or you need more film uploaded.
                </p>
              </CardContent>
            </Card>
          ) : (
            selfScout.map((alert) => (
              <SelfScoutAlert key={alert.situation} breakdown={alert} />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Components ─────────────────────────────────────────────

function TendencyCard({
  breakdown,
  title,
  isRate = false,
}: {
  breakdown: TendencyBreakdown;
  title?: string;
  isRate?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title ?? breakdown.situation}</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {breakdown.sampleSize} plays
            </span>
            <ConfidenceBadge confidence={breakdown.confidence} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {breakdown.tendencies.slice(0, 8).map((t) => (
          <TendencyBar key={t.label} tendency={t} isRate={isRate} />
        ))}
        {breakdown.tendencies.length === 0 && (
          <p className="text-xs text-muted-foreground">No data</p>
        )}
      </CardContent>
    </Card>
  );
}

function TendencyBar({
  tendency,
  isRate = false,
}: {
  tendency: { label: string; count: number; total: number; rate: number; playIds: string[] };
  isRate: boolean;
}) {
  const pct = Math.round(tendency.rate * 100);
  const displayValue = isRate
    ? `${pct}% success (${tendency.count}/${tendency.total})`
    : `${pct}% (${tendency.count} plays)`;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{tendency.label}</span>
        <span className="text-xs text-muted-foreground">{displayValue}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function SituationCard({ breakdown }: { breakdown: TendencyBreakdown }) {
  if (breakdown.sampleSize === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">{breakdown.situation}</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {breakdown.sampleSize} plays
            </span>
            <ConfidenceBadge confidence={breakdown.confidence} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {breakdown.tendencies.slice(0, 5).map((t) => (
            <Badge
              key={t.label}
              variant={t.rate >= 0.4 ? 'default' : 'secondary'}
              className="text-xs"
            >
              {t.label}: {Math.round(t.rate * 100)}% ({t.count})
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SelfScoutAlert({ breakdown }: { breakdown: TendencyBreakdown }) {
  const top = breakdown.tendencies[0];
  if (!top) return null;

  return (
    <Card className="border-red-200 dark:border-red-900">
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-medium text-red-800 dark:text-red-200">
              {breakdown.situation}
            </p>
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">
              You {top.label.toLowerCase()} {Math.round(top.rate * 100)}% of the time
              ({top.count} of {top.total} plays). A good DC will exploit this.
            </p>
          </div>
          <ConfidenceBadge confidence={breakdown.confidence} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Tap to watch all {top.count} plays
        </p>
      </CardContent>
    </Card>
  );
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const colors: Record<string, string> = {
    low: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-400',
    high: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-400',
    very_high: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-400',
  };

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[confidence] ?? colors.low}`}>
      {confidence.replace('_', ' ')}
    </span>
  );
}
