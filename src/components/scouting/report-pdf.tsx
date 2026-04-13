'use client';

import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { ScoutingReport, ReportSection } from '@/lib/scouting/report-generator';

/**
 * Scouting Report PDF — printable document for coaches.
 *
 * Designed to look like a D1 quality control report.
 * Coaches print these for position meetings and game-week prep.
 */

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#1a1a1a',
  },
  header: {
    marginBottom: 20,
    borderBottom: '2px solid #1a1a1a',
    paddingBottom: 12,
  },
  title: {
    fontSize: 22,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 10,
    color: '#666',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  summary: {
    fontSize: 11,
    lineHeight: 1.5,
    marginBottom: 20,
    padding: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 4,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 8,
    borderBottom: '1px solid #ccc',
    paddingBottom: 4,
  },
  sectionContent: {
    fontSize: 10,
    lineHeight: 1.6,
    marginBottom: 8,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    borderBottom: '1px solid #eee',
  },
  statLabel: {
    fontSize: 9,
    color: '#444',
  },
  statValue: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
  },
  takeawayTitle: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 20,
    marginBottom: 8,
    borderBottom: '1px solid #ccc',
    paddingBottom: 4,
  },
  takeaway: {
    fontSize: 10,
    lineHeight: 1.5,
    marginBottom: 4,
    paddingLeft: 12,
  },
  bullet: {
    fontSize: 10,
    lineHeight: 1.5,
    marginBottom: 4,
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7,
    color: '#999',
    borderTop: '1px solid #eee',
    paddingTop: 6,
  },
});

interface ReportPDFProps {
  report: ScoutingReport;
  opponentName: string;
  generatedAt: string;
}

export function ReportPDF({ report, opponentName, generatedAt }: ReportPDFProps) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Scouting Report: {opponentName}</Text>
          <Text style={styles.subtitle}>
            Generated {generatedAt} · Audible Football Intelligence
          </Text>
        </View>

        {/* Summary */}
        <View style={styles.summary}>
          <Text>{report.summary}</Text>
        </View>

        {/* Report sections */}
        <Section section={report.offensiveIdentity} />
        <Section section={report.runGame} />
        <Section section={report.passGame} />
        <Section section={report.situational} />
        <Section section={report.redZone} />

        {/* Key Takeaways */}
        <Text style={styles.takeawayTitle}>Key Takeaways</Text>
        {report.keyTakeaways.map((takeaway, i) => (
          <Text key={i} style={styles.takeaway}>
            {i + 1}. {takeaway}
          </Text>
        ))}

        {/* Game Plan Focus */}
        <Text style={styles.takeawayTitle}>Suggested Game Plan Focus</Text>
        {report.suggestedGamePlanFocus.map((focus, i) => (
          <Text key={i} style={styles.bullet}>
            • {focus}
          </Text>
        ))}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>CONFIDENTIAL — {opponentName} Scouting Report</Text>
          <Text>Audible Football Intelligence</Text>
        </View>
      </Page>
    </Document>
  );
}

function Section({ section }: { section: ReportSection }) {
  return (
    <View wrap={false}>
      <Text style={styles.sectionTitle}>{section.title}</Text>
      <Text style={styles.sectionContent}>{section.content}</Text>
      {section.keyStats && section.keyStats.length > 0 && (
        <View style={{ marginBottom: 8 }}>
          {section.keyStats.map((stat, i) => (
            <View key={i} style={styles.statRow}>
              <Text style={styles.statLabel}>{stat.stat}</Text>
              <Text style={styles.statValue}>{stat.value}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
