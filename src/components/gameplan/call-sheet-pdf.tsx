'use client';

import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

/**
 * Sideline Call Sheet PDF — full-page, organized by situation.
 *
 * Printed and laminated for the coordinator's clipboard on game day.
 * Opening script on the front, all situations with plays and tendency notes.
 */

const styles = StyleSheet.create({
  page: {
    padding: 24,
    fontFamily: 'Helvetica',
    fontSize: 8,
    color: '#1a1a1a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '2px solid #1a1a1a',
    paddingBottom: 8,
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 8,
    color: '#666',
  },
  sectionTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    backgroundColor: '#1a1a1a',
    color: '#ffffff',
    padding: '4 8',
    marginTop: 8,
    marginBottom: 4,
  },
  playRow: {
    flexDirection: 'row',
    borderBottom: '0.5px solid #ddd',
    paddingVertical: 3,
    paddingHorizontal: 4,
  },
  playRowAlt: {
    flexDirection: 'row',
    borderBottom: '0.5px solid #ddd',
    paddingVertical: 3,
    paddingHorizontal: 4,
    backgroundColor: '#f8f8f8',
  },
  playName: {
    width: '35%',
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
  },
  playFormation: {
    width: '25%',
    fontSize: 7,
    color: '#444',
  },
  playNote: {
    width: '40%',
    fontSize: 7,
    color: '#666',
    fontStyle: 'italic',
  },
  scriptNumber: {
    width: 16,
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    color: '#999',
  },
  footer: {
    position: 'absolute',
    bottom: 16,
    left: 24,
    right: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 6,
    color: '#999',
    borderTop: '0.5px solid #eee',
    paddingTop: 4,
  },
});

interface PlayData {
  playName: string;
  formation: string | null;
  attacksTendency: string | null;
  suggesterConfidence: string | null;
}

interface CallSheetProps {
  weekLabel: string;
  opponentName: string;
  playsBySituation: Record<string, PlayData[]>;
  situations: Array<{ key: string; label: string }>;
}

export function CallSheetPDF({ weekLabel, opponentName, playsBySituation, situations }: CallSheetProps) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Call Sheet</Text>
            <Text style={styles.subtitle}>{weekLabel} · vs {opponentName}</Text>
          </View>
          <Text style={styles.subtitle}>AUDIBLE FOOTBALL INTELLIGENCE</Text>
        </View>

        {situations.map((sit) => {
          const plays = playsBySituation[sit.key] ?? [];
          if (plays.length === 0) return null;

          return (
            <View key={sit.key} wrap={false}>
              <Text style={styles.sectionTitle}>
                {sit.label} ({plays.length})
              </Text>
              {plays.map((play, i) => (
                <View key={i} style={i % 2 === 0 ? styles.playRow : styles.playRowAlt}>
                  {sit.key === 'opening_script' && (
                    <Text style={styles.scriptNumber}>{i + 1}.</Text>
                  )}
                  <Text style={styles.playName}>{play.playName}</Text>
                  <Text style={styles.playFormation}>{play.formation ?? ''}</Text>
                  <Text style={styles.playNote}>{play.attacksTendency ?? ''}</Text>
                </View>
              ))}
            </View>
          );
        })}

        <View style={styles.footer} fixed>
          <Text>CONFIDENTIAL — {weekLabel}</Text>
          <Text>Audible Football Intelligence</Text>
        </View>
      </Page>
    </Document>
  );
}
