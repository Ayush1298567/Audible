'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePlayerSession } from '@/lib/auth/player-session';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface GamePlanPlay {
  id: string;
  situation: string;
  playName: string;
  formation: string | null;
  playType: string | null;
  attacksTendency: string | null;
}

interface GamePlan {
  weekLabel: string;
  publishedAt: string;
}

export default function MyPlanPage() {
  const { session, authFetch } = usePlayerSession();
  const [gamePlan, setGamePlan] = useState<GamePlan | null>(null);
  const [planPlays, setPlanPlays] = useState<GamePlanPlay[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session) return;
    const res = await authFetch(
      `/api/player-data?programId=${session.programId}&playerId=${session.playerId}&type=gameplan`,
    );
    const data = await res.json();
    setGamePlan(data.gamePlan ?? null);
    setPlanPlays(data.plays ?? []);
    setIsLoading(false);
  }, [session, authFetch]);

  useEffect(() => { void load(); }, [load]);

  // Group plays by situation
  const bySituation: Record<string, GamePlanPlay[]> = {};
  for (const play of planPlays) {
    const key = play.situation;
    if (!bySituation[key]) bySituation[key] = [];
    bySituation[key]?.push(play);
  }

  const situationLabels: Record<string, string> = {
    opening_script: 'Opening Script',
    '1st_down': '1st Down',
    '2nd_short': '2nd & Short',
    '2nd_long': '2nd & Long',
    '3rd_short': '3rd & Short',
    '3rd_medium': '3rd & Medium',
    '3rd_long': '3rd & Long',
    red_zone: 'Red Zone',
    two_minute: 'Two Minute',
    backed_up: 'Backed Up',
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">My Game Plan</h1>
        {gamePlan && (
          <p className="text-sm text-muted-foreground">{gamePlan.weekLabel}</p>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading game plan...</p>
      ) : !gamePlan ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              No game plan published yet. Your coordinator will publish when it&apos;s ready.
            </p>
          </CardContent>
        </Card>
      ) : planPlays.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Game plan is published but has no plays yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(bySituation).map(([situation, sitPlays]) => (
            <Card key={situation}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  {situationLabels[situation] ?? situation}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {sitPlays.map((play) => (
                  <div key={play.id} className="rounded border border-border p-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{play.playName}</p>
                      {play.formation && (
                        <Badge variant="secondary" className="text-xs">{play.formation}</Badge>
                      )}
                    </div>
                    {play.attacksTendency && (
                      <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                        {play.attacksTendency}
                      </p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
