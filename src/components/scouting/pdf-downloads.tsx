'use client';

import { PDFDownloadLink } from '@react-pdf/renderer';
import { Button } from '@/components/ui/button';
import { WalkthroughPDF } from './walkthrough-pdf';
import { PracticeScriptPDF } from './practice-script-pdf';
import type { Walkthrough } from '@/lib/scouting/insights';
import type { PracticeScript } from '@/lib/scouting/practice-script';

/**
 * PDF download buttons for walkthrough and practice script.
 * Lazy-loaded because @react-pdf/renderer can't SSR.
 */

export function WalkthroughPDFButton({ walkthrough }: { walkthrough: Walkthrough }) {
  const fileName = `scouting-${walkthrough.opponentName.replace(/\s+/g, '-').toLowerCase()}.pdf`;

  return (
    <PDFDownloadLink
      document={<WalkthroughPDF walkthrough={walkthrough} />}
      fileName={fileName}
    >
      {({ loading }) => (
        <Button
          variant="outline"
          disabled={loading}
          className="font-display text-xs uppercase tracking-widest"
        >
          {loading ? 'Preparing PDF...' : 'Download Scouting PDF'}
        </Button>
      )}
    </PDFDownloadLink>
  );
}

export function PracticeScriptPDFButton({ script }: { script: PracticeScript }) {
  const fileName = `practice-${script.opponentName.replace(/\s+/g, '-').toLowerCase()}-${script.weekOfMonday}.pdf`;

  return (
    <PDFDownloadLink
      document={<PracticeScriptPDF script={script} />}
      fileName={fileName}
    >
      {({ loading }) => (
        <Button
          variant="outline"
          disabled={loading}
          className="font-display text-xs uppercase tracking-widest"
        >
          {loading ? 'Preparing PDF...' : 'Download Practice PDF'}
        </Button>
      )}
    </PDFDownloadLink>
  );
}
