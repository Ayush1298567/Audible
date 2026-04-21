'use client';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface PlayCardProps {
  playOrder: number;
  down: number | null;
  distance: number | null;
  quarter: number | null;
  formation: string | null;
  personnel: string | null;
  playType: string | null;
  playDirection: string | null;
  gainLoss: number | null;
  result: string | null;
  coverage?: string | null;
  pressure?: string | null;
  front?: string | null;
  route?: string | null;
  isSelected?: boolean;
  status?: string;
  onClick?: () => void;
}

export function PlayCard({
  playOrder,
  down,
  distance,
  quarter,
  formation,
  personnel,
  playType,
  playDirection,
  gainLoss,
  result,
  coverage,
  pressure,
  front,
  route,
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

  const isRun = playType?.toLowerCase().includes('run') || playType === 'rpo';
  const isBigPlay = (gainLoss ?? 0) > 15 || (gainLoss ?? 0) < -5;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative w-full cursor-pointer rounded-xl border p-3.5 text-left transition-all duration-200',
        'bg-slate-900/40 backdrop-blur-md',
        'hover:bg-slate-800/60 hover:shadow-lg',
        isSelected
          ? 'border-blue-500 shadow-lg shadow-blue-500/20 ring-1 ring-blue-500/50'
          : 'border-slate-700/50 hover:border-blue-400/40',
        isBigPlay && !isSelected && 'border-l-2 border-l-yellow-500/60',
      )}
    >
      <div className="space-y-2">
        {/* Row 1: Play number + type + quarter + result */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-sm font-bold text-slate-400">
              {playOrder}
            </span>
            <span className="font-display text-sm font-bold text-white truncate">
              {down ? `${down}&${distance ?? '?'}` : '—'}
            </span>
            {quarter && (
              <span className="text-[10px] text-slate-500">Q{quarter}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {playType && (
              <Badge
                className={cn(
                  'text-[9px] font-bold uppercase tracking-wider border-0 px-1.5 py-0',
                  isRun ? 'bg-blue-600/70 text-white' : 'bg-purple-600/70 text-white',
                )}
              >
                {playType}
              </Badge>
            )}
            {gainLoss != null && (
              <span className={cn('font-mono text-sm font-bold', getYardsColor(gainLoss))}>
                {gainLoss > 0 ? '+' : ''}{gainLoss}
              </span>
            )}
          </div>
        </div>

        {/* Row 2: Formation + personnel + direction */}
        <div className="flex items-center gap-2 text-xs">
          {formation && <span className="text-slate-300 font-medium truncate">{formation}</span>}
          {personnel && <span className="text-slate-500">{personnel}</span>}
          {playDirection && <span className="text-slate-500">{playDirection}</span>}
        </div>

        {/* Row 3: CV tags — the valuable stuff */}
        {(coverage || pressure || front || route) && (
          <div className="flex flex-wrap gap-1 pt-1 border-t border-slate-800/50">
            {coverage && (
              <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[9px] font-medium text-cyan-400">
                {coverage}
              </span>
            )}
            {front && (
              <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[9px] font-medium text-blue-400">
                {front}
              </span>
            )}
            {pressure && pressure !== 'None' && (
              <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[9px] font-medium text-red-400">
                {pressure}
              </span>
            )}
            {route && (
              <span className="rounded bg-purple-500/15 px-1.5 py-0.5 text-[9px] font-medium text-purple-400">
                {route}
              </span>
            )}
          </div>
        )}

        {/* Result text for special plays */}
        {result && result !== 'Complete' && result !== 'Rush' && result !== 'Incomplete' && (
          <p className={cn(
            'text-[10px] font-bold uppercase tracking-wider',
            result === 'TD' ? 'text-green-400' : result === 'INT' || result === 'Fumble' ? 'text-red-400' : 'text-yellow-400',
          )}>
            {result}
          </p>
        )}
      </div>

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
