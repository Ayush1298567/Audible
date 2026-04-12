'use client';

import { useProgram } from '@/lib/auth/program-context';
import { useState, useCallback } from 'react';

interface ToolResult {
  plays?: Array<{
    id: string;
    playOrder: number;
    down: number | null;
    distance: number | null;
    formation: string | null;
    playType: string | null;
    gainLoss: number | null;
    opponentName: string | null;
    clipBlobKey: string | null;
  }>;
  count?: number;
  tendencies?: Array<{
    label: string;
    count: number;
    total: number;
    rate: number;
  }>;
  confidence?: string;
  message?: string;
  value?: number | null;
  total?: number;
  detections?: number;
  averageDepthYards?: number | null;
  commonAlignments?: string[];
}

interface CommandResponse {
  text: string;
  toolResults: ToolResult[];
  toolCalls: Array<{ name: string; input: Record<string, unknown> }>;
}

export function CommandBar() {
  const { programId } = useProgram();
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<CommandResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || !programId || isLoading) return;

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), programId }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Command failed');
        return;
      }

      const data: CommandResponse = await res.json();
      setResult(data);
    } catch {
      setError('Failed to process command');
    } finally {
      setIsLoading(false);
    }
  }, [query, programId, isLoading]);

  return (
    <div className="sticky top-0 z-30 border-b border-border/30 bg-[#0d1117]/95 backdrop-blur-xl">
      {/* Input bar */}
      <form onSubmit={handleSubmit} className="px-6 py-3">
        <div className="relative mx-auto max-w-3xl">
          <div className="absolute left-4 top-1/2 -translate-y-1/2">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
              <circle cx="7" cy="7" r="5" />
              <line x1="11" y1="11" x2="15" y2="15" />
            </svg>
          </div>
          <input
            type="text"
            placeholder='Ask anything — "Show me every play they ran Cover 3 on 3rd down"'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={isLoading}
            className="h-11 w-full rounded-xl border border-border/50 bg-surface-raised pl-11 pr-24 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all"
          />
          {isLoading ? (
            <span className="absolute right-4 top-1/2 -translate-y-1/2 font-display text-[10px] font-medium uppercase tracking-widest text-primary animate-pulse">
              Analyzing...
            </span>
          ) : (
            <span className="absolute right-4 top-1/2 -translate-y-1/2 rounded-md border border-border/50 px-1.5 py-0.5 font-display text-[10px] font-medium text-muted-foreground/50">
              Enter ↵
            </span>
          )}
        </div>
      </form>

      {/* Results panel */}
      {(result || error) && (
        <div className="border-t border-border/20 px-6 py-4">
          <div className="mx-auto max-w-3xl">
            {error && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {result && (
              <div className="space-y-3">
                {result.text && (
                  <p className="text-sm leading-relaxed text-foreground/90">{result.text}</p>
                )}

                {result.toolResults.map((tr, i) => (
                  <ToolResultDisplay key={`tr-${i.toString()}`} result={tr} />
                ))}

                {result.toolCalls.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="font-display text-[10px] uppercase tracking-widest text-muted-foreground">Tools:</span>
                    {result.toolCalls.map((tc, i) => (
                      <span key={`tc-${i.toString()}`} className="tag-chip tag-info">
                        {tc.name}
                      </span>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => { setResult(null); setQuery(''); }}
                  className="font-display text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
                >
                  Clear results
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ToolResultDisplay({ result }: { result: ToolResult }) {
  if (!result.message) return null;

  return (
    <div className="space-y-3 rounded-xl border border-border/30 bg-surface-raised p-4">
      <p className="font-display text-sm font-semibold tracking-wide text-foreground">{result.message}</p>

      {/* Tendency bars */}
      {result.tendencies && result.tendencies.length > 0 && (
        <div className="space-y-2">
          {result.tendencies.slice(0, 6).map((t) => (
            <div key={t.label} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground/80">{t.label}</span>
                <span className="font-display text-xs font-semibold text-primary">{t.rate}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.03]">
                <div
                  className="animate-bar h-full rounded-full bg-gradient-to-r from-primary to-accent"
                  style={{ width: `${t.rate}%` }}
                />
              </div>
            </div>
          ))}
          {result.confidence && (
            <span className={`tag-chip confidence-${result.confidence}`}>
              {result.confidence} · {result.total} plays
            </span>
          )}
        </div>
      )}

      {/* Play list */}
      {result.plays && result.plays.length > 0 && (
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {result.plays.slice(0, 15).map((play) => (
            <div
              key={play.id}
              className="flex items-center justify-between rounded-lg border border-border/20 bg-white/[0.02] px-3 py-2 text-xs transition-colors hover:bg-white/[0.04]"
            >
              <div className="flex items-center gap-3">
                <span className="font-display font-bold text-muted-foreground">#{play.playOrder}</span>
                <span className="text-foreground/80">
                  {play.down ? `${play.down} & ${play.distance}` : '-'}
                </span>
                <span className="text-muted-foreground">{play.formation ?? ''}</span>
              </div>
              <div className="flex items-center gap-2">
                {play.gainLoss != null && (
                  <span className={`font-display font-bold ${play.gainLoss > 0 ? 'text-success' : play.gainLoss < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {play.gainLoss > 0 ? '+' : ''}{play.gainLoss}
                  </span>
                )}
                <span className="text-muted-foreground/60">{play.opponentName ?? ''}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Alignment data */}
      {result.averageDepthYards != null && (
        <div className="flex items-center gap-4">
          <div>
            <p className="font-display text-2xl font-bold text-primary">{result.averageDepthYards}</p>
            <p className="font-display text-[10px] uppercase tracking-widest text-muted-foreground">Avg depth (yds)</p>
          </div>
          <div>
            <p className="font-display text-2xl font-bold text-foreground">{result.detections}</p>
            <p className="font-display text-[10px] uppercase tracking-widest text-muted-foreground">Detections</p>
          </div>
        </div>
      )}
    </div>
  );
}
