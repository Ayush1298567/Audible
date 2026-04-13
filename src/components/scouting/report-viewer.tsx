'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import type { ScoutingReport, ReportSection } from '@/lib/scouting/report-generator';

// Entire PDF download button is client-only — @react-pdf/renderer can't SSR
const LazyPDFDownloadButton = dynamic(
  () => import('./pdf-download-button').then((mod) => mod.PDFDownloadButton),
  { ssr: false, loading: () => <Button size="sm" disabled className="font-display text-[10px] uppercase tracking-widest">Loading...</Button> },
);

interface ReportViewerProps {
  programId: string;
  opponentId: string;
  opponentName: string;
}

export function ReportViewer({ programId, opponentId, opponentName }: ReportViewerProps) {
  const [report, setReport] = useState<ScoutingReport | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string>('');

  async function handleGenerate() {
    setIsGenerating(true);
    setError(null);

    try {
      const res = await fetch('/api/scouting-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ programId, opponentId, opponentName }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to generate report');
      }

      const data = await res.json();
      setReport(data.report);
      setGeneratedAt(new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsGenerating(false);
    }
  }

  if (!report) {
    return (
      <div className="glass-card rounded-xl p-6 text-center space-y-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/10 border border-cyan-500/20 mx-auto">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
        </div>
        <div>
          <h3 className="font-display text-sm font-bold text-white uppercase tracking-wider">
            AI Scouting Report
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Generate a D1-quality scouting report from your film data
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}

        <Button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="bg-cyan-600 hover:bg-cyan-500 text-white font-display text-xs uppercase tracking-wider"
        >
          {isGenerating ? (
            <span className="flex items-center gap-2">
              <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Analyzing film data...
            </span>
          ) : (
            'Generate Report'
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Report header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-lg font-bold text-white uppercase tracking-wider">
            Scouting Report: {opponentName}
          </h3>
          <p className="font-display text-[10px] uppercase tracking-widest text-slate-500 mt-1">
            Generated {generatedAt}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleGenerate}
            variant="outline"
            size="sm"
            disabled={isGenerating}
            className="font-display text-[10px] uppercase tracking-widest"
          >
            {isGenerating ? 'Regenerating...' : 'Regenerate'}
          </Button>
          <LazyPDFDownloadButton
            report={report}
            opponentName={opponentName}
            generatedAt={generatedAt}
          />
        </div>
      </div>

      {/* Summary */}
      <div className="glass-card rounded-xl p-5">
        <p className="text-sm text-slate-300 leading-relaxed">{report.summary}</p>
      </div>

      {/* Report sections */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ReportSectionCard section={report.offensiveIdentity} />
        <ReportSectionCard section={report.runGame} />
        <ReportSectionCard section={report.passGame} />
        <ReportSectionCard section={report.situational} />
        <ReportSectionCard section={report.redZone} />
      </div>

      {/* Key takeaways */}
      <div className="glass-card rounded-xl p-5">
        <h4 className="font-display text-sm font-bold text-white uppercase tracking-wider mb-3">
          Key Takeaways
        </h4>
        <div className="space-y-2">
          {report.keyTakeaways.map((takeaway, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-500/10 text-[10px] font-bold text-cyan-400 mt-0.5">
                {i + 1}
              </span>
              <p className="text-sm text-slate-300">{takeaway}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Game plan focus */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
        <h4 className="font-display text-sm font-bold text-primary uppercase tracking-wider mb-3">
          Suggested Game Plan Focus
        </h4>
        <div className="space-y-2">
          {report.suggestedGamePlanFocus.map((focus, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              <p className="text-sm text-slate-300">{focus}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReportSectionCard({ section }: { section: ReportSection }) {
  return (
    <div className="glass-card rounded-xl p-5 space-y-3">
      <h4 className="font-display text-sm font-bold text-white uppercase tracking-wider">
        {section.title}
      </h4>
      <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-line">
        {section.content}
      </p>
      {section.keyStats && section.keyStats.length > 0 && (
        <div className="border-t border-slate-800/50 pt-3 space-y-1">
          {section.keyStats.map((stat, i) => (
            <div key={i} className="flex items-center justify-between">
              <span className="font-display text-[10px] uppercase tracking-widest text-slate-500">
                {stat.stat}
              </span>
              <span className="text-xs font-semibold text-slate-300">{stat.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
