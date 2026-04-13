'use client';

import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

/**
 * Scout Team Card PDF — formatted cards showing opponent plays to run in practice.
 *
 * Each card shows: formation name, personnel, play type, direction,
 * a simple text formation diagram, and a coach notes field.
 *
 * Printed on half-sheets or index cards for scout team players
 * who need to simulate the opponent's plays in practice.
 */

const styles = StyleSheet.create({
  page: {
    padding: 16,
    fontFamily: 'Helvetica',
    fontSize: 8,
    color: '#1a1a1a',
  },
  header: {
    textAlign: 'center',
    borderBottom: '1.5px solid #1a1a1a',
    paddingBottom: 6,
    marginBottom: 10,
  },
  title: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 7,
    color: '#666',
    marginTop: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  card: {
    width: '48%',
    border: '1px solid #ccc',
    borderRadius: 4,
    padding: 8,
    marginBottom: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '0.5px solid #eee',
    paddingBottom: 4,
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
  },
  cardBadge: {
    fontSize: 6,
    fontFamily: 'Helvetica-Bold',
    backgroundColor: '#eee',
    padding: '2 6',
    borderRadius: 8,
    textTransform: 'uppercase',
  },
  formation: {
    fontFamily: 'Courier',
    fontSize: 7,
    backgroundColor: '#f5f5f5',
    padding: 6,
    borderRadius: 2,
    marginBottom: 6,
    textAlign: 'center',
    lineHeight: 1.4,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  metaLabel: {
    fontSize: 6,
    color: '#888',
    textTransform: 'uppercase',
  },
  metaValue: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
  },
  notesBox: {
    marginTop: 6,
    borderTop: '0.5px dashed #ccc',
    paddingTop: 4,
  },
  notesLabel: {
    fontSize: 6,
    color: '#999',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  notesLine: {
    height: 12,
    borderBottom: '0.5px solid #eee',
    marginBottom: 2,
  },
});

interface ScoutCardPlay {
  name: string;
  formation: string;
  playType: string;
  direction: string;
  personnel?: string;
  clipCount: number;
}

interface ScoutCardPDFProps {
  opponentName: string;
  weekLabel: string;
  plays: ScoutCardPlay[];
}

export function ScoutCardPDF({ opponentName, weekLabel, plays }: ScoutCardPDFProps) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Scout Team Cards</Text>
          <Text style={styles.subtitle}>
            {weekLabel} · vs {opponentName} · {plays.length} plays
          </Text>
        </View>

        <View style={styles.grid}>
          {plays.map((play, i) => (
            <View key={i} style={styles.card} wrap={false}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{play.formation}</Text>
                <Text style={styles.cardBadge}>{play.playType}</Text>
              </View>

              {/* Text-based formation diagram */}
              <View style={styles.formation}>
                <Text>{buildFormationDiagram(play.formation)}</Text>
              </View>

              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Direction</Text>
                <Text style={styles.metaValue}>{play.direction || 'N/A'}</Text>
              </View>
              {play.personnel && (
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>Personnel</Text>
                  <Text style={styles.metaValue}>{play.personnel}</Text>
                </View>
              )}
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Film Clips</Text>
                <Text style={styles.metaValue}>{play.clipCount}</Text>
              </View>

              {/* Coach notes area */}
              <View style={styles.notesBox}>
                <Text style={styles.notesLabel}>Coach Notes</Text>
                <View style={styles.notesLine} />
                <View style={styles.notesLine} />
              </View>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}

function buildFormationDiagram(formation: string): string {
  const f = formation.toLowerCase();

  if (f.includes('spread') || f.includes('empty')) {
    return 'X         O O X O O         X\n              Q\n           RB';
  }
  if (f.includes('trips')) {
    return '               O O X O O  X  X  X\n              Q\n           RB';
  }
  if (f.includes('i-form') || f.includes('i form')) {
    return '     X    O O X O O    X\n              Q\n             FB\n             RB';
  }
  if (f.includes('pistol')) {
    return ' X        O O X O O        X\n              Q\n             RB';
  }

  // Default
  return ' X        O O X O O        X\n              Q\n           RB';
}
