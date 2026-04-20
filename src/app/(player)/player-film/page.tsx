'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePlayerSession } from '@/lib/auth/player-session';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Play {
  id: string;
  playOrder: number;
  down: number | null;
  distance: number | null;
  formation: string | null;
  playType: string | null;
  gainLoss: number | null;
  clipBlobKey: string | null;
  opponentName: string | null;
}

export default function PlayerFilmPage() {
  const { session, authFetch } = usePlayerSession();
  const [plays, setPlays] = useState<Play[]>([]);
  const [selectedPlay, setSelectedPlay] = useState<Play | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session) return;
    const res = await authFetch(
      `/api/player-data?programId=${session.programId}&playerId=${session.playerId}&type=film`,
    );
    const data = await res.json();
    setPlays(data.plays ?? []);
    setIsLoading(false);
  }, [session, authFetch]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Film</h1>

      {/* Video player */}
      {selectedPlay?.clipBlobKey && (
        <div className="space-y-2">
          {/* biome-ignore lint/a11y/useMediaCaption: football clips have no captions */}
          <video
            key={selectedPlay.id}
            controls
            autoPlay
            className="w-full rounded-lg bg-black"
            src={selectedPlay.clipBlobKey}
          />
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              #{selectedPlay.playOrder} — {selectedPlay.down ? `${selectedPlay.down} & ${selectedPlay.distance}` : 'N/A'}
            </span>
            <span className="text-muted-foreground">{selectedPlay.opponentName}</span>
          </div>
          <button
            type="button"
            onClick={() => setSelectedPlay(null)}
            className="text-xs text-muted-foreground"
          >
            Close
          </button>
        </div>
      )}

      {/* Clip feed */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading film...</p>
      ) : plays.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              No film available yet. Your coach will push clips here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {plays.map((play) => (
            <button
              key={play.id}
              type="button"
              onClick={() => setSelectedPlay(play)}
              className={`w-full rounded-lg border p-3 text-left transition-colors ${
                selectedPlay?.id === play.id ? 'border-primary bg-muted' : 'border-border hover:bg-muted/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-muted-foreground">#{play.playOrder}</span>
                  <span className="text-sm font-medium">
                    {play.down ? `${play.down} & ${play.distance}` : '-'}
                  </span>
                  <span className="text-xs text-muted-foreground">{play.formation}</span>
                </div>
                <div className="flex items-center gap-2">
                  {play.gainLoss != null && (
                    <span className={`text-xs font-mono ${play.gainLoss > 0 ? 'text-green-600' : play.gainLoss < 0 ? 'text-red-600' : ''}`}>
                      {play.gainLoss > 0 ? '+' : ''}{play.gainLoss}
                    </span>
                  )}
                  <Badge variant="secondary" className="text-xs">{play.opponentName}</Badge>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
