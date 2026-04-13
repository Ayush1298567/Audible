'use client';

import { useState } from 'react';

/**
 * 2-tap tag correction — coach taps a tag value, picks the right one.
 *
 * Tap 1: Tag value becomes a popover with options.
 * Tap 2: Coach picks the correct value → saves to DB.
 *
 * The corrected value is stored in plays.coach_override as a JSON
 * merge patch. The original Hudl/CV value is never mutated.
 */

// Common correction options per field
const CORRECTION_OPTIONS: Record<string, string[]> = {
  formation: [
    'Ace', 'Pistol', 'Shotgun', 'Under Center', 'I-Form', 'Singleback',
    'Empty', 'Wildcat', 'Trips Rt', 'Trips Lt', 'Doubles', 'Bunch Rt',
    'Bunch Lt', 'Twins Rt', 'Twins Lt', 'Spread', 'Pro', 'Slot',
    'Wing Rt', 'Wing Lt', 'Tight', 'Heavy',
  ],
  personnel: ['10', '11', '12', '13', '20', '21', '22', '23'],
  playType: [
    'Run', 'Pass', 'RPO', 'Screen', 'Play Action', 'Draw',
    'Option', 'QB Run', 'Trick', 'Kneel', 'Spike', 'Punt', 'FG', 'XP',
  ],
  playDirection: ['Left', 'Right', 'Middle', 'N/A'],
  hash: ['Left', 'Middle', 'Right'],
  result: [
    'Complete', 'Incomplete', 'Interception', 'Touchdown', 'First Down',
    'Fumble', 'Sack', 'Penalty', 'No Gain', 'Gain',
  ],
};

// Fields that support coach correction
const CORRECTABLE_FIELDS = new Set(Object.keys(CORRECTION_OPTIONS));

interface TagCorrectionProps {
  field: string;
  value: string | number | null | undefined;
  coachOverride?: Record<string, string> | null;
  onCorrect: (field: string, value: string) => Promise<void>;
  label: string;
  highlight?: boolean;
  gainLoss?: number | null;
}

export function CorrectableTag({
  field,
  value,
  coachOverride,
  onCorrect,
  label,
  highlight = false,
  gainLoss,
}: TagCorrectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const isCorrectable = CORRECTABLE_FIELDS.has(field);
  const overriddenValue = coachOverride?.[field];
  const displayValue = overriddenValue ?? value;

  const valueColor = gainLoss != null
    ? gainLoss > 0
      ? 'text-emerald-400'
      : gainLoss < 0
        ? 'text-red-400'
        : 'text-slate-400'
    : highlight
      ? 'text-white font-semibold'
      : 'text-slate-300';

  async function handleSelect(newValue: string) {
    setIsSaving(true);
    await onCorrect(field, newValue);
    setIsSaving(false);
    setIsOpen(false);
  }

  return (
    <div className="relative flex items-center justify-between py-1.5 border-b border-slate-800/50 last:border-0">
      <span className="font-display text-[10px] uppercase tracking-widest text-slate-500">{label}</span>

      {isCorrectable ? (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`text-xs ${valueColor} hover:text-primary transition-colors flex items-center gap-1 group`}
          disabled={isSaving}
        >
          {isSaving ? (
            <span className="animate-pulse">Saving...</span>
          ) : (
            <>
              {displayValue ?? '—'}
              {overriddenValue && (
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-amber-400" title="Coach corrected" />
              )}
              <svg
                width="8"
                height="8"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="opacity-0 group-hover:opacity-50 transition-opacity"
              >
                <path d="M9 3L5 7 3 5" />
              </svg>
            </>
          )}
        </button>
      ) : (
        <span className={`text-xs ${valueColor}`}>{displayValue ?? '—'}</span>
      )}

      {/* Correction popover */}
      {isOpen && isCorrectable && (
        <>
          {/* Backdrop */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: popover backdrop dismiss */}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: popover backdrop dismiss */}
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

          <div className="absolute right-0 top-full z-50 mt-1 w-44 max-h-56 overflow-y-auto rounded-lg border border-slate-700/50 bg-slate-900 shadow-xl">
            <div className="p-1">
              {CORRECTION_OPTIONS[field]?.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => handleSelect(opt)}
                  className={`w-full text-left px-3 py-1.5 text-xs rounded transition-colors ${
                    opt === String(displayValue)
                      ? 'bg-primary/20 text-primary'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
