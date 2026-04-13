'use client';

import type { DecisionResult } from '@/lib/simulation/position-modes';

/**
 * Teaching feedback — shown after a wrong answer in the simulation.
 *
 * Explains what the player should have seen, why their answer was wrong,
 * and connects to real film evidence when available.
 *
 * "You said Cover 2 but it's Cover 3. Look at the safety — single high.
 *  In Cover 3, your first read is the deep crosser."
 */

interface TeachingFeedbackProps {
  result: DecisionResult;
  onContinue: () => void;
}

export function TeachingFeedback({ result, onContinue }: TeachingFeedbackProps) {
  return (
    <div className={`rounded-xl border p-5 space-y-4 animate-fade-in ${
      result.correct
        ? 'border-emerald-500/20 bg-emerald-500/5'
        : 'border-red-500/20 bg-red-500/5'
    }`}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          result.correct
            ? 'bg-emerald-500/15 border border-emerald-500/20'
            : 'bg-red-500/15 border border-red-500/20'
        }`}>
          {result.correct ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-400">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          )}
        </div>

        <div className="flex-1">
          <h3 className={`font-display text-sm font-bold uppercase tracking-wider ${
            result.correct ? 'text-emerald-300' : 'text-red-300'
          }`}>
            {result.correct ? 'Correct' : 'Not Quite'}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {result.decision.prompt}
          </p>
        </div>

        <div className="text-right">
          <p className="font-display text-xs text-slate-500 uppercase tracking-widest">
            {(result.timeMs / 1000).toFixed(1)}s
          </p>
        </div>
      </div>

      {/* Answer comparison */}
      {!result.correct && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-red-500/10 border border-red-500/15 px-3 py-2">
            <p className="font-display text-[10px] uppercase tracking-widest text-red-400/70 mb-1">Your Answer</p>
            <p className="text-xs text-red-300 font-medium">{result.playerAnswer}</p>
          </div>
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/15 px-3 py-2">
            <p className="font-display text-[10px] uppercase tracking-widest text-emerald-400/70 mb-1">Correct</p>
            <p className="text-xs text-emerald-300 font-medium">
              {result.decision.correctAnswers.join(' or ')}
            </p>
          </div>
        </div>
      )}

      {/* Explanation */}
      <div className="rounded-lg bg-white/[0.02] border border-white/[0.04] px-4 py-3">
        <p className="font-display text-[10px] uppercase tracking-widest text-slate-500 mb-2">
          {result.correct ? 'Why This Is Right' : 'What to Look For'}
        </p>
        <p className="text-sm text-slate-300 leading-relaxed">
          {result.decision.explanation}
        </p>
      </div>

      {/* Continue button */}
      <button
        type="button"
        onClick={onContinue}
        className="w-full rounded-lg bg-white/[0.05] border border-white/[0.08] py-2.5 font-display text-xs uppercase tracking-widest text-slate-300 hover:bg-white/[0.08] hover:text-white transition-colors"
      >
        Continue
      </button>
    </div>
  );
}
