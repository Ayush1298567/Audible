'use client';

import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
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
    <div className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/* Input bar */}
      <form onSubmit={handleSubmit} className="px-4 py-3">
        <div className="relative mx-auto max-w-3xl">
          <Input
            type="text"
            placeholder='Ask anything... "Show me every play they ran Cover 3 on 3rd down"'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-10 pl-10 pr-20 text-sm"
            disabled={isLoading}
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">/</span>
          {isLoading && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground animate-pulse">
              Thinking...
            </span>
          )}
        </div>
      </form>

      {/* Results panel */}
      {(result || error) && (
        <div className="border-t border-border px-4 py-3">
          <div className="mx-auto max-w-3xl">
            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}

            {result && (
              <div className="space-y-3">
                {/* LLM text response */}
                {result.text && (
                  <p className="text-sm">{result.text}</p>
                )}

                {/* Tool results */}
                {result.toolResults.map((tr, i) => (
                  <ToolResultDisplay key={`tr-${i.toString()}`} result={tr} />
                ))}

                {/* Tool call badges */}
                {result.toolCalls.length > 0 && (
                  <div className="flex gap-1">
                    {result.toolCalls.map((tc, i) => (
                      <Badge key={`tc-${i.toString()}`} variant="outline" className="text-xs">
                        {tc.name}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Dismiss */}
                <button
                  type="button"
                  onClick={() => { setResult(null); setQuery(''); }}
                  className="text-xs text-muted-foreground hover:text-foreground"
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
  // Message summary
  if (result.message) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium">{result.message}</p>

        {/* Tendency bars */}
        {result.tendencies && result.tendencies.length > 0 && (
          <div className="space-y-1.5">
            {result.tendencies.slice(0, 6).map((t) => (
              <div key={t.label} className="space-y-0.5">
                <div className="flex items-center justify-between text-xs">
                  <span>{t.label}</span>
                  <span className="text-muted-foreground">{t.rate}% ({t.count})</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${t.rate}%` }}
                  />
                </div>
              </div>
            ))}
            {result.confidence && (
              <p className="text-xs text-muted-foreground">
                Confidence: {result.confidence} ({result.total} plays)
              </p>
            )}
          </div>
        )}

        {/* Play list */}
        {result.plays && result.plays.length > 0 && (
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {result.plays.slice(0, 15).map((play) => (
              <div
                key={play.id}
                className="flex items-center justify-between rounded border border-border px-3 py-1.5 text-xs"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-muted-foreground">#{play.playOrder}</span>
                  <span>
                    {play.down ? `${play.down}${ordinal(play.down)} & ${play.distance}` : '-'}
                  </span>
                  <span className="text-muted-foreground">{play.formation ?? ''}</span>
                  <span className="text-muted-foreground">{play.playType ?? ''}</span>
                </div>
                <div className="flex items-center gap-2">
                  {play.gainLoss != null && (
                    <span className={play.gainLoss > 0 ? 'text-green-600' : play.gainLoss < 0 ? 'text-red-600' : ''}>
                      {play.gainLoss > 0 ? '+' : ''}{play.gainLoss}
                    </span>
                  )}
                  <span className="text-muted-foreground">{play.opponentName ?? ''}</span>
                </div>
              </div>
            ))}
            {result.count && result.count > 15 && (
              <p className="text-xs text-muted-foreground">
                ...and {result.count - 15} more plays
              </p>
            )}
          </div>
        )}

        {/* Player alignment data */}
        {result.averageDepthYards != null && (
          <div className="text-xs text-muted-foreground">
            <p>Average depth: {result.averageDepthYards} yards ({result.detections} detections)</p>
            {result.commonAlignments && result.commonAlignments.length > 0 && (
              <p>Common alignments: {result.commonAlignments.join(' · ')}</p>
            )}
          </div>
        )}
      </div>
    );
  }

  return null;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] ?? s[v] ?? s[0] ?? '';
}
