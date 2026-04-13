'use client';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface PlayCardProps {
  playOrder: number;
  down: number | null;
  distance: number | null;
  formation: string | null;
  playType: string | null;
  gainLoss: number | null;
  isSelected?: boolean;
  status?: string;
  onClick?: () => void;
}

export function PlayCard({
  playOrder,
  down,
  distance,
  formation,
  playType,
  gainLoss,
  isSelected = false,
  status,
  onClick,
}: PlayCardProps) {
  const getYardsColor = (yards: number) => {
    if (yards > 10) return 'text-green-400';
    if (yards > 0) return 'text-emerald-300';
    if (yards === 0) return 'text-slate-400';
    return 'text-red-400';
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative w-full cursor-pointer rounded-xl border p-4 text-left transition-all duration-300',
        'bg-slate-900/40 backdrop-blur-md',
        'hover:bg-slate-800/60 hover:shadow-xl hover:shadow-blue-500/10',
        'hover:scale-[1.02] hover:-translate-y-0.5',
        isSelected
          ? 'border-blue-500 shadow-lg shadow-blue-500/20 ring-1 ring-blue-500/50'
          : 'border-slate-700/50 hover:border-blue-400/40',
      )}
    >
      {/* Glow overlay on hover */}
      <div
        className={cn(
          'absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300',
          'bg-gradient-to-br from-blue-500/5 via-transparent to-cyan-500/5',
          'group-hover:opacity-100',
        )}
      />

      <div className="relative z-10 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-display text-lg font-bold text-white">
              #{playOrder}
            </span>
            {playType && (
              <Badge
                className={cn(
                  'text-[10px] font-semibold uppercase tracking-wider border-0',
                  playType.toLowerCase().includes('run')
                    ? 'bg-blue-600/80 text-white'
                    : 'bg-purple-600/80 text-white',
                )}
              >
                {playType}
              </Badge>
            )}
          </div>
          {isSelected && (
            <div className="h-2 w-2 rounded-full bg-blue-500 pulse-dot" />
          )}
        </div>

        {/* Down & Distance */}
        <p className="font-display text-sm font-semibold text-slate-300">
          {down ? `${down}${ordinal(down)} & ${distance ?? '?'}` : 'No D&D'}
        </p>

        {/* Formation */}
        {formation && (
          <p className="text-xs text-slate-400">
            <span className="font-medium">Formation:</span>{' '}
            <span className="text-slate-300">{formation}</span>
          </p>
        )}

        {/* Yards */}
        <div className="flex items-center justify-between border-t border-slate-700/40 pt-3">
          <span className="font-display text-[10px] uppercase tracking-widest text-slate-500">Result</span>
          {gainLoss != null ? (
            <div className="flex items-center gap-1">
              <span className={cn('font-display text-xl font-bold', getYardsColor(gainLoss))}>
                {gainLoss > 0 ? '+' : ''}{gainLoss}
              </span>
              <span className="text-xs text-slate-500">yds</span>
            </div>
          ) : (
            <span className="text-xs text-slate-500">—</span>
          )}
        </div>
      </div>

      {/* Status badge if not ready */}
      {status && status !== 'ready' && (
        <div className="absolute right-2 top-2">
          <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-400">
            {status}
          </Badge>
        </div>
      )}
    </button>
  );
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] ?? s[v] ?? s[0] ?? '';
}
