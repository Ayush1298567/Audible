'use client';

import { PDFDownloadLink } from '@react-pdf/renderer';
import { ReportPDF } from './report-pdf';
import { Button } from '@/components/ui/button';
import type { ScoutingReport } from '@/lib/scouting/report-generator';

interface PDFDownloadButtonProps {
  report: ScoutingReport;
  opponentName: string;
  generatedAt: string;
}

export function PDFDownloadButton({ report, opponentName, generatedAt }: PDFDownloadButtonProps) {
  return (
    <PDFDownloadLink
      document={<ReportPDF report={report} opponentName={opponentName} generatedAt={generatedAt} />}
      fileName={`scouting-report-${opponentName.toLowerCase().replace(/\s+/g, '-')}.pdf`}
    >
      {({ loading }) => (
        <Button
          size="sm"
          disabled={loading}
          className="bg-cyan-600 hover:bg-cyan-500 text-white font-display text-[10px] uppercase tracking-widest"
        >
          {loading ? 'Preparing...' : 'Download PDF'}
        </Button>
      )}
    </PDFDownloadLink>
  );
}
