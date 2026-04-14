'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { renderCallSheetAsText } from '@/lib/scouting/call-sheet';
import type { Walkthrough } from '@/lib/scouting/insights';
import { OverlayVideo } from './overlay-video';

/**
 * Interactive scouting walkthrough — option-2 UX (step-by-step).
 *
 * Coach reads one insight, watches one or more example clips with
 * overlays, then clicks "Next" to advance. Fully full-screen modal.
 * No forced autoplay — they control the pace.
 */

interface Props {
  walkthrough: Walkthrough;
  onClose: () => void;
}

type View =
  | { step: 'intro' }
  | { step: 'insight'; insightIdx: number; exampleIdx: number }
  | { step: 'call-sheet' }
  | { step: 'summary' };

export function WalkthroughView({ walkthrough, onClose }: Props) {
  const [view, setView] = useState<View>({ step: 'intro' });

  const { insights } = walkthrough;
  const hasCallSheet = (walkthrough.callSheet?.buckets.length ?? 0) > 0;

  const next = () => {
    if (view.step === 'intro') {
      setView({ step: 'insight', insightIdx: 0, exampleIdx: 0 });
      return;
    }
    if (view.step === 'insight') {
      const currentInsight = insights[view.insightIdx];
      if (!currentInsight) {
        setView(hasCallSheet ? { step: 'call-sheet' } : { step: 'summary' });
        return;
      }
      // Move to next example within current insight, or next insight
      if (view.exampleIdx + 1 < currentInsight.examples.length) {
        setView({ ...view, exampleIdx: view.exampleIdx + 1 });
      } else if (view.insightIdx + 1 < insights.length) {
        setView({ step: 'insight', insightIdx: view.insightIdx + 1, exampleIdx: 0 });
      } else {
        setView(hasCallSheet ? { step: 'call-sheet' } : { step: 'summary' });
      }
      return;
    }
    if (view.step === 'call-sheet') {
      setView({ step: 'summary' });
      return;
    }
  };

  const prev = () => {
    if (view.step === 'insight') {
      if (view.exampleIdx > 0) {
        setView({ ...view, exampleIdx: view.exampleIdx - 1 });
      } else if (view.insightIdx > 0) {
        const prevInsight = insights[view.insightIdx - 1];
        setView({
          step: 'insight',
          insightIdx: view.insightIdx - 1,
          exampleIdx: (prevInsight?.examples.length ?? 1) - 1,
        });
      } else {
        setView({ step: 'intro' });
      }
      return;
    }
    if (view.step === 'call-sheet') {
      // Back to last insight's last example
      const lastIdx = insights.length - 1;
      const lastInsight = insights[lastIdx];
      setView({
        step: 'insight',
        insightIdx: lastIdx,
        exampleIdx: (lastInsight?.examples.length ?? 1) - 1,
      });
      return;
    }
    if (view.step === 'summary') {
      if (hasCallSheet) {
        setView({ step: 'call-sheet' });
      } else {
        const lastIdx = insights.length - 1;
        const lastInsight = insights[lastIdx];
        setView({
          step: 'insight',
          insightIdx: lastIdx,
          exampleIdx: (lastInsight?.examples.length ?? 1) - 1,
        });
      }
    }
  };

  const skipInsight = () => {
    if (view.step !== 'insight') return;
    if (view.insightIdx + 1 < insights.length) {
      setView({ step: 'insight', insightIdx: view.insightIdx + 1, exampleIdx: 0 });
    } else {
      setView({ step: 'summary' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm overflow-y-auto">
      <div className="min-h-full flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border/50 px-6 py-3 flex items-center justify-between">
          <div>
            <p className="font-display text-[10px] uppercase tracking-widest text-cyan-400">
              Scouting Walkthrough
            </p>
            <p className="font-display text-sm font-bold text-white">{walkthrough.opponentName}</p>
          </div>

          {/* Progress dots */}
          <div className="flex items-center gap-1.5">
            {insights.map((_, i) => {
              const isActive = view.step === 'insight' && view.insightIdx === i;
              const isDone =
                view.step === 'summary' ||
                view.step === 'call-sheet' ||
                (view.step === 'insight' && view.insightIdx > i);
              return (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    isActive
                      ? 'w-8 bg-cyan-400'
                      : isDone
                        ? 'w-3 bg-cyan-400/50'
                        : 'w-3 bg-slate-700'
                  }`}
                />
              );
            })}
            {/* Extra dots for call-sheet and summary when they exist */}
            {hasCallSheet && (
              <div
                className={`h-1.5 rounded-full transition-all ${
                  view.step === 'call-sheet'
                    ? 'w-8 bg-cyan-400'
                    : view.step === 'summary'
                      ? 'w-3 bg-cyan-400/50'
                      : 'w-3 bg-slate-700'
                }`}
              />
            )}
            <div
              className={`h-1.5 rounded-full transition-all ${
                view.step === 'summary' ? 'w-8 bg-cyan-400' : 'w-3 bg-slate-700'
              }`}
            />
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-700/50 text-slate-500 hover:text-white hover:border-slate-600 transition-colors"
            aria-label="Close"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 p-6 max-w-4xl mx-auto w-full">
          {view.step === 'intro' && <IntroStep walkthrough={walkthrough} onNext={next} />}
          {view.step === 'insight' && (
            <InsightStep
              insight={insights[view.insightIdx]}
              insightIdx={view.insightIdx}
              totalInsights={insights.length}
              exampleIdx={view.exampleIdx}
              onNext={next}
              onPrev={prev}
              onSkip={skipInsight}
            />
          )}
          {view.step === 'call-sheet' && walkthrough.callSheet && (
            <CallSheetStep
              walkthrough={walkthrough}
              onNext={next}
              onPrev={prev}
            />
          )}
          {view.step === 'summary' && (
            <SummaryStep walkthrough={walkthrough} onClose={onClose} onPrev={prev} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Intro step ─────────────────────────────────────────────

function IntroStep({ walkthrough, onNext }: { walkthrough: Walkthrough; onNext: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-8 animate-fade-in">
      <div>
        <p className="font-display text-xs uppercase tracking-[0.3em] text-cyan-400 mb-3">
          Game Plan Preview
        </p>
        <h1 className="font-display text-5xl font-bold text-white">
          {`${walkthrough.insights.length} things they'll do to you`}
        </h1>
        <p className="font-display text-xl text-slate-400 mt-4 max-w-xl">
          Analyzed {walkthrough.playsAnalyzed} plays from {walkthrough.opponentName}. Here are the
          most exploitable tendencies, one at a time.
        </p>
      </div>

      <div className="glass-card rounded-xl p-5 max-w-md">
        <p className="text-sm text-slate-300 leading-relaxed">{walkthrough.summary}</p>
      </div>

      <Button
        onClick={onNext}
        className="h-12 px-8 bg-cyan-600 hover:bg-cyan-500 text-white font-display text-sm uppercase tracking-widest"
      >
        Start walkthrough →
      </Button>
    </div>
  );
}

// ─── Insight step ───────────────────────────────────────────

function InsightStep({
  insight,
  insightIdx,
  totalInsights,
  exampleIdx,
  onNext,
  onPrev,
  onSkip,
}: {
  insight: Walkthrough['insights'][number] | undefined;
  insightIdx: number;
  totalInsights: number;
  exampleIdx: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}) {
  if (!insight) return null;

  const example = insight.examples[exampleIdx];
  const hasMoreExamples = exampleIdx + 1 < insight.examples.length;
  const isLastInsight = insightIdx === totalInsights - 1;

  return (
    <div className="space-y-6 animate-fade-in" key={`${insightIdx}-${exampleIdx}`}>
      {/* Insight header */}
      <div>
        <p className="font-display text-[10px] uppercase tracking-widest text-slate-500 mb-1">
          Tendency {insightIdx + 1} of {totalInsights}
          {insight.evidenceCount && <span> · {insight.evidenceCount} plays of evidence</span>}
        </p>
        <h2 className="font-display text-3xl font-bold text-white uppercase tracking-wide">
          {insight.headline}
        </h2>
        <p className="text-slate-300 mt-3 leading-relaxed max-w-3xl">{insight.narrative}</p>
      </div>

      {/* Video + overlays */}
      {example && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-display text-[10px] uppercase tracking-widest text-cyan-400">
              Example {exampleIdx + 1} of {insight.examples.length} · {example.label}
            </p>
            {insight.examples.length > 1 && (
              <div className="flex items-center gap-1">
                {insight.examples.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1 rounded-full ${
                      i === exampleIdx ? 'w-6 bg-cyan-400' : 'w-2 bg-slate-700'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          <OverlayVideo
            src={example.clipUrl}
            overlays={example.overlays}
            tracks={example.tracks}
            highlightTrackIds={example.highlightTrackIds}
            autoPlay
          />

          {example.measurements && <MeasurementBadges m={example.measurements} />}

          <p className="text-sm text-slate-400 leading-relaxed italic">{example.description}</p>
        </div>
      )}

      {/* Recommendations */}
      {insight.recommendations.length > 0 && (
        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-5">
          <p className="font-display text-[10px] uppercase tracking-widest text-cyan-400 mb-3">
            Attack this with
          </p>
          <ul className="space-y-3">
            {insight.recommendations.map((r, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-500/15 text-[10px] font-bold text-cyan-400 mt-0.5">
                  {i + 1}
                </span>
                <div className="flex-1 space-y-1">
                  <p className="font-display text-[10px] uppercase tracking-widest text-cyan-400/70">
                    {r.situation}
                  </p>
                  <p className="text-sm font-semibold text-white">{r.call}</p>
                  <p className="text-xs text-slate-400 leading-relaxed">{r.rationale}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4">
        <Button
          variant="ghost"
          onClick={onPrev}
          className="font-display text-xs uppercase tracking-widest"
        >
          ← Back
        </Button>

        <div className="flex items-center gap-2">
          {!isLastInsight && (
            <Button
              variant="outline"
              onClick={onSkip}
              className="font-display text-xs uppercase tracking-widest"
            >
              Skip tendency
            </Button>
          )}
          <Button
            onClick={onNext}
            className="h-11 bg-cyan-600 hover:bg-cyan-500 text-white font-display text-xs uppercase tracking-widest px-6"
          >
            {hasMoreExamples
              ? 'Watch another example →'
              : isLastInsight
                ? 'Finish →'
                : 'Next tendency →'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Measurement badges ─────────────────────────────────────

function MeasurementBadges({
  m,
}: {
  m: NonNullable<Walkthrough['insights'][number]['examples'][number]['measurements']>;
}) {
  const badges: Array<{ label: string; value: string; hint?: string }> = [];

  if (m.peakSpeedYps !== undefined && m.peakSpeedYps > 0) {
    const who = m.peakSpeedPlayer
      ? [m.peakSpeedPlayer.role, m.peakSpeedPlayer.jersey ? `#${m.peakSpeedPlayer.jersey}` : null]
          .filter(Boolean)
          .join(' ')
      : null;
    badges.push({
      label: 'Peak speed',
      value: `${m.peakSpeedYps} yds/s`,
      hint: who || undefined,
    });
  }

  if (m.maxDepthYards !== undefined) {
    badges.push({
      label: 'Deepest route',
      value: `${m.maxDepthYards} yds`,
    });
  }

  if (m.playDurationSec !== undefined && m.playDurationSec > 0) {
    badges.push({
      label: 'Play time',
      value: `${m.playDurationSec}s`,
    });
  }

  if (badges.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {badges.map((b) => (
        <div
          key={b.label}
          className="flex items-baseline gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/[0.06] px-3 py-1.5"
        >
          <span className="font-display text-[9px] uppercase tracking-widest text-cyan-400">
            {b.label}
          </span>
          <span className="text-sm font-semibold text-white tabular-nums">{b.value}</span>
          {b.hint && <span className="text-[10px] text-slate-400">({b.hint})</span>}
        </div>
      ))}
      {!m.fieldRegistered && (
        <span className="font-display text-[9px] uppercase tracking-widest text-amber-400/70">
          Approx · not field-calibrated
        </span>
      )}
    </div>
  );
}

// ─── Summary step ───────────────────────────────────────────

function SummaryStep({
  walkthrough,
  onClose,
  onPrev,
}: {
  walkthrough: Walkthrough;
  onClose: () => void;
  onPrev: () => void;
}) {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <p className="font-display text-[10px] uppercase tracking-widest text-cyan-400 mb-2">
          Game Plan Summary
        </p>
        <h1 className="font-display text-3xl font-bold text-white">What to do this week</h1>
        <p className="text-slate-400 mt-2">
          Bring these tendencies to practice. Call the recommended plays on Friday.
        </p>
      </div>

      <div className="space-y-4">
        {walkthrough.insights.map((i) => (
          <div
            key={i.id}
            className="glass-card rounded-xl p-5 space-y-3 border-l-2 border-l-cyan-500/50"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="font-display text-[10px] uppercase tracking-widest text-slate-500">
                  Tendency {i.rank}
                </p>
                <h3 className="font-display text-lg font-bold text-white uppercase tracking-wide">
                  {i.headline}
                </h3>
              </div>
              <span className="tag-chip tag-info text-[10px]">{i.evidenceCount} plays</span>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">{i.narrative}</p>

            <div className="pt-2 border-t border-slate-800/50">
              <p className="font-display text-[10px] uppercase tracking-widest text-cyan-400 mb-2">
                Call these plays
              </p>
              <ul className="space-y-2">
                {i.recommendations.map((r, idx) => (
                  <li key={idx} className="flex gap-2 items-baseline">
                    <span className="text-cyan-400 shrink-0">•</span>
                    <div>
                      <span className="text-sm font-semibold text-white">{r.call}</span>
                      <span className="text-xs text-slate-500"> — {r.situation}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-4">
        <Button
          variant="ghost"
          onClick={onPrev}
          className="font-display text-xs uppercase tracking-widest"
        >
          ← Back
        </Button>
        <Button
          onClick={onClose}
          className="h-11 bg-cyan-600 hover:bg-cyan-500 text-white font-display text-xs uppercase tracking-widest px-6"
        >
          Done — build the game plan
        </Button>
      </div>
    </div>
  );
}

// ─── Call Sheet step ────────────────────────────────────────

function CallSheetStep({
  walkthrough,
  onNext,
  onPrev,
}: {
  walkthrough: Walkthrough;
  onNext: () => void;
  onPrev: () => void;
}) {
  const buckets = walkthrough.callSheet?.buckets ?? [];
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  const handleCopy = async () => {
    try {
      const text = renderCallSheetAsText(walkthrough);
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      setCopyState('error');
      setTimeout(() => setCopyState('idle'), 2000);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in call-sheet-print-root">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 print:hidden">
        <div>
          <p className="font-display text-[10px] uppercase tracking-widest text-cyan-400 mb-2">
            Friday Call Sheet
          </p>
          <h1 className="font-display text-3xl font-bold text-white">
            By situation
          </h1>
          <p className="text-slate-400 mt-2">
            Every recommendation bucketed by when to call it. Print this. Carry it.
          </p>
        </div>
        <div className="flex items-center gap-2 md:shrink-0">
          <Button
            variant="outline"
            onClick={handleCopy}
            className="font-display text-xs uppercase tracking-widest"
          >
            {copyState === 'copied'
              ? '✓ Copied'
              : copyState === 'error'
                ? 'Copy failed'
                : 'Copy to clipboard'}
          </Button>
          <Button
            variant="outline"
            onClick={() => window.print()}
            className="font-display text-xs uppercase tracking-widest"
          >
            Print
          </Button>
        </div>
      </div>

      {/* Print-only header — keeps the printed sheet self-labeling */}
      <div className="hidden print:block">
        <h1 className="text-2xl font-bold text-black">
          Call Sheet — {walkthrough.opponentName}
        </h1>
        <p className="text-xs text-gray-600">
          Generated {new Date(walkthrough.generatedAt).toLocaleDateString()} ·{' '}
          {walkthrough.playsAnalyzed} plays analyzed
        </p>
      </div>

      {/* Bucketed card grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {buckets.map((b) => (
          <div
            key={b.bucket}
            className="glass-card rounded-xl p-5 space-y-3 border-l-2 border-l-cyan-500/50"
          >
            <div className="flex items-baseline justify-between">
              <h3 className="font-display text-sm font-bold text-white uppercase tracking-wide">
                {b.bucket}
              </h3>
              <span className="text-[10px] text-slate-500 tabular-nums">
                {b.recommendations.length} call{b.recommendations.length === 1 ? '' : 's'}
              </span>
            </div>
            <ul className="space-y-2">
              {b.recommendations.map((r, i) => (
                <li key={`${b.bucket}-${i}`} className="space-y-0.5">
                  <p className="text-sm font-semibold text-white">{r.call}</p>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {r.rationale}
                  </p>
                  <p className="text-[9px] text-cyan-400/60 uppercase tracking-widest">
                    → {r.insightHeadline}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Navigation — hidden when printing */}
      <div className="flex items-center justify-between pt-4 print:hidden">
        <Button
          variant="ghost"
          onClick={onPrev}
          className="font-display text-xs uppercase tracking-widest"
        >
          ← Back
        </Button>
        <Button
          onClick={onNext}
          className="h-11 bg-cyan-600 hover:bg-cyan-500 text-white font-display text-xs uppercase tracking-widest px-6"
        >
          See the summary →
        </Button>
      </div>
    </div>
  );
}
