'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePlayerSession } from '@/lib/auth/player-session';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/**
 * Player progress page — shows completion stats and readiness.
 */
export default function ProgressPage() {
  const { session, authFetch } = usePlayerSession();
  const [isLoading, setIsLoading] = useState(true);
  const [progress, setProgress] = useState<{
    positions: string[];
    sessionsCompleted: number;
    averageAccuracy: number | null;
    averageDecisionTimeMs: number | null;
    filmGradesCount: number;
    averageFilmGrade: number | null;
  } | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    const res = await authFetch(
      `/api/player-data?programId=${session.programId}&playerId=${session.playerId}&type=progress`,
    );
    const data = await res.json();
    setProgress(data.progress ?? null);
    setIsLoading(false);
  }, [session, authFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading progress...</p>;
  }

  const filmGradePercent = progress?.averageFilmGrade != null
    ? Math.round(progress.averageFilmGrade)
    : null;
  const accuracyPercent = progress?.averageAccuracy != null
    ? Math.round(progress.averageAccuracy * 100)
    : null;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">My Progress</h1>

      {/* Stat cards row */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Film Grade"
          value={filmGradePercent != null ? `${filmGradePercent}%` : '-'}
          sub={`${progress?.filmGradesCount ?? 0} clips graded`}
          color={filmGradePercent != null && filmGradePercent >= 80 ? 'green' : filmGradePercent != null && filmGradePercent >= 60 ? 'yellow' : 'neutral'}
        />
        <StatCard
          label="Sessions"
          value={String(progress?.sessionsCompleted ?? 0)}
          sub="completed"
          color="neutral"
        />
        <StatCard
          label="Accuracy"
          value={accuracyPercent != null ? `${accuracyPercent}%` : '-'}
          sub="recognition avg"
          color={accuracyPercent != null && accuracyPercent >= 80 ? 'green' : accuracyPercent != null && accuracyPercent >= 60 ? 'yellow' : 'neutral'}
        />
        <StatCard
          label="Decision Time"
          value={progress?.averageDecisionTimeMs != null ? `${(progress.averageDecisionTimeMs / 1000).toFixed(1)}s` : '-'}
          sub="avg response"
          color={progress?.averageDecisionTimeMs != null && progress.averageDecisionTimeMs < 3000 ? 'green' : 'neutral'}
        />
      </div>

      {/* Weekly readiness */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Weekly Readiness</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ReadinessRow
            label="Film clips watched"
            value={progress?.filmGradesCount ?? 0}
            target={5}
          />
          <ReadinessRow
            label="Game plan reviewed"
            value={(progress?.sessionsCompleted ?? 0) > 0 ? 1 : 0}
            target={1}
          />
          <div className="flex items-center justify-between">
            <span className="text-sm">Recognition challenges</span>
            <Badge variant="outline" className="text-[10px]">Coming soon</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Decision drills</span>
            <Badge variant="outline" className="text-[10px]">Coming soon</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Season overview */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Season Overview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Position</span>
            <span className="text-sm font-medium">
              {progress?.positions?.join(' / ') ?? session?.positions.join(' / ') ?? '-'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Total sessions</span>
            <span className="text-sm font-medium">{progress?.sessionsCompleted ?? 0}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Film grade average</span>
            <span className="text-sm font-medium">
              {filmGradePercent != null ? `${filmGradePercent}%` : 'No grades yet'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Recognition accuracy</span>
            <span className="text-sm font-medium">
              {accuracyPercent != null ? `${accuracyPercent}%` : 'No data yet'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Decision time avg</span>
            <span className="text-sm font-medium">
              {progress?.averageDecisionTimeMs != null
                ? `${(progress.averageDecisionTimeMs / 1000).toFixed(2)}s`
                : 'No data yet'}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color: 'green' | 'yellow' | 'neutral';
}) {
  const ring =
    color === 'green'
      ? 'border-green-500/30 bg-green-500/5'
      : color === 'yellow'
        ? 'border-yellow-500/30 bg-yellow-500/5'
        : 'border-border/50 bg-white/[0.02]';
  const valueColor =
    color === 'green'
      ? 'text-green-400'
      : color === 'yellow'
        ? 'text-yellow-400'
        : 'text-foreground';

  return (
    <div className={`rounded-xl border p-3 space-y-1 ${ring}`}>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${valueColor}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function ReadinessRow({
  label,
  value,
  target,
}: {
  label: string;
  value: number;
  target: number;
}) {
  const done = value >= target;
  const pct = Math.min(100, Math.round((value / target) * 100));

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-sm">{label}</span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {value}/{target}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${done ? 'bg-green-500' : 'bg-blue-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
