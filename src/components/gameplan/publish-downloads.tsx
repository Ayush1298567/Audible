'use client';

import { PDFDownloadLink } from '@react-pdf/renderer';
import { CallSheetPDF } from './call-sheet-pdf';
import { WristbandPDF } from './wristband-pdf';
import { Button } from '@/components/ui/button';

interface PlayData {
  playName: string;
  formation: string | null;
  attacksTendency: string | null;
  suggesterConfidence: string | null;
}

interface PublishDownloadsProps {
  weekLabel: string;
  opponentName: string;
  playsBySituation: Record<string, PlayData[]>;
  situations: Array<{ key: string; label: string }>;
}

export function PublishDownloads({ weekLabel, opponentName, playsBySituation, situations }: PublishDownloadsProps) {
  const fileName = weekLabel.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="flex items-center gap-2">
      <PDFDownloadLink
        document={
          <CallSheetPDF
            weekLabel={weekLabel}
            opponentName={opponentName}
            playsBySituation={playsBySituation}
            situations={situations}
          />
        }
        fileName={`call-sheet-${fileName}.pdf`}
      >
        {({ loading }) => (
          <Button
            size="sm"
            variant="outline"
            disabled={loading}
            className="font-display text-[10px] uppercase tracking-widest border-slate-700/50"
          >
            {loading ? '...' : 'Call Sheet'}
          </Button>
        )}
      </PDFDownloadLink>

      <PDFDownloadLink
        document={
          <WristbandPDF
            weekLabel={weekLabel}
            opponentName={opponentName}
            playsBySituation={playsBySituation}
            situations={situations}
          />
        }
        fileName={`wristband-${fileName}.pdf`}
      >
        {({ loading }) => (
          <Button
            size="sm"
            variant="outline"
            disabled={loading}
            className="font-display text-[10px] uppercase tracking-widest border-slate-700/50"
          >
            {loading ? '...' : 'Wristband'}
          </Button>
        )}
      </PDFDownloadLink>
    </div>
  );
}
