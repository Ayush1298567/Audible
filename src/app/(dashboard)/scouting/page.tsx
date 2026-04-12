'use client';

import { useCallback, useEffect, useState } from 'react';
import { useProgram } from '@/lib/auth/program-context';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Opponent {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
}

export default function ScoutingPage() {
  const { programId } = useProgram();
  const [opponents, setOpponents] = useState<Opponent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!programId) return;
    const res = await fetch(`/api/opponents?programId=${programId}`);
    const data = await res.json();
    setOpponents(data.opponents ?? []);
    setIsLoading(false);
  }, [programId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Scouting Hub</h1>
        <p className="text-muted-foreground">
          Select an opponent to view their tendencies
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading opponents...</p>
      ) : opponents.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Add opponents in the Games tab to start scouting.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {opponents.map((opp) => (
            <Link key={opp.id} href={`/scouting/${opp.id}`}>
              <Card className="cursor-pointer transition-colors hover:bg-muted">
                <CardHeader>
                  <CardTitle className="text-lg">{opp.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {[opp.city, opp.state].filter(Boolean).join(', ') || 'Location unknown'}
                  </p>
                  <Badge variant="secondary" className="mt-2">
                    View tendencies
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
