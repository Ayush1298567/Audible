'use client';

import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

/**
 * QB Wristband Card PDF — compact format that fits a physical wristband sleeve.
 *
 * 20-40 plays organized by situation code, color-coded, abbreviated.
 * Small enough for a QB to read at the line of scrimmage.
 */

const COLORS: Record<string, string> = {
  opening_script: '#f59e0b',
  '1st_down': '#3b82f6',
  '2nd_short': '#22c55e',
  '2nd_long': '#22c55e',
  '3rd_short': '#ef4444',
  '3rd_medium': '#ef4444',
  '3rd_long': '#ef4444',
  red_zone: '#a855f7',
  two_minute: '#06b6d4',
  goal_line: '#ec4899',
  backed_up: '#64748b',
};

const styles = StyleSheet.create({
  page: {
    padding: 8,
    fontFamily: 'Helvetica',
    fontSize: 6,
    color: '#1a1a1a',
  },
  header: {
    textAlign: 'center',
    borderBottom: '1.5px solid #1a1a1a',
    paddingBottom: 4,
    marginBottom: 6,
  },
  title: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 6,
    color: '#666',
    marginTop: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  section: {
    width: '48%',
    marginBottom: 4,
  },
  sectionHeader: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingVertical: 2,
    paddingHorizontal: 4,
    color: '#ffffff',
    marginBottom: 2,
  },
  playRow: {
    flexDirection: 'row',
    paddingVertical: 1.5,
    paddingHorizontal: 3,
    borderBottom: '0.25px solid #eee',
  },
  playNumber: {
    width: 12,
    fontFamily: 'Helvetica-Bold',
    fontSize: 6,
    color: '#999',
  },
  playName: {
    flex: 1,
    fontFamily: 'Helvetica-Bold',
    fontSize: 6,
  },
  playFormation: {
    fontSize: 5.5,
    color: '#666',
    width: 40,
    textAlign: 'right',
  },
});

interface PlayData {
  playName: string;
  formation: string | null;
}

interface WristbandProps {
  weekLabel: string;
  opponentName: string;
  playsBySituation: Record<string, PlayData[]>;
  situations: Array<{ key: string; label: string }>;
}

export function WristbandPDF({ weekLabel, opponentName, playsBySituation, situations }: WristbandProps) {
  // Filter to situations that have plays, limit total to ~40
  const activeSituations = situations.filter(s => (playsBySituation[s.key]?.length ?? 0) > 0);

  return (
    <Document>
      <Page size={[252, 324]} style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Wristband</Text>
          <Text style={styles.subtitle}>{weekLabel} · vs {opponentName}</Text>
        </View>

        <View style={styles.grid}>
          {activeSituations.map((sit) => {
            const plays = playsBySituation[sit.key] ?? [];
            const bgColor = COLORS[sit.key] ?? '#64748b';

            return (
              <View key={sit.key} style={styles.section}>
                <Text style={[styles.sectionHeader, { backgroundColor: bgColor }]}>
                  {sit.label}
                </Text>
                {plays.slice(0, 6).map((play, i) => (
                  <View key={i} style={styles.playRow}>
                    <Text style={styles.playNumber}>{i + 1}</Text>
                    <Text style={styles.playName}>{play.playName}</Text>
                    <Text style={styles.playFormation}>
                      {play.formation ? abbreviateFormation(play.formation) : ''}
                    </Text>
                  </View>
                ))}
              </View>
            );
          })}
        </View>
      </Page>
    </Document>
  );
}

function abbreviateFormation(formation: string): string {
  return formation
    .replace('Shotgun', 'SG')
    .replace('Under Center', 'UC')
    .replace('Pistol', 'P')
    .replace('Singleback', 'SB')
    .replace('I-Form', 'I')
    .replace('Empty', 'E')
    .replace('Trips', 'Tr')
    .replace('Right', 'R')
    .replace('Left', 'L')
    .slice(0, 8);
}
