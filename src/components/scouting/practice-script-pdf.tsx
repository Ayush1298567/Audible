'use client';

import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { PracticeScript } from '@/lib/scouting/practice-script';

/**
 * Printable Mon-Thu practice script PDF.
 * One page per day. Each period lists drills with reps and scout looks.
 * Designed for the staff meeting table — hand one to each coach.
 */

const s = StyleSheet.create({
  page: {
    padding: 28,
    fontFamily: 'Helvetica',
    fontSize: 8,
    color: '#1a1a1a',
  },
  header: {
    borderBottom: '2px solid #1a1a1a',
    paddingBottom: 8,
    marginBottom: 10,
  },
  title: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 9,
    color: '#666',
    marginTop: 2,
  },
  weekTheme: {
    fontSize: 8,
    lineHeight: 1.5,
    color: '#333',
    marginBottom: 12,
    padding: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 2,
  },
  dayHeader: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    backgroundColor: '#1a1a1a',
    color: '#fff',
    padding: '5 8',
    marginTop: 8,
    marginBottom: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayMinutes: {
    fontSize: 8,
    fontFamily: 'Helvetica',
    color: '#ccc',
  },
  periodBlock: {
    border: '0.5px solid #ddd',
    marginBottom: 6,
    borderRadius: 2,
  },
  periodHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#f0f0f0',
    padding: '3 6',
  },
  periodName: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
  },
  periodMeta: {
    fontSize: 7,
    color: '#666',
  },
  periodFocus: {
    fontSize: 7,
    fontStyle: 'italic',
    color: '#555',
    padding: '2 6',
    borderBottom: '0.5px solid #eee',
  },
  drillRow: {
    flexDirection: 'row',
    padding: '3 6',
    borderBottom: '0.5px solid #f0f0f0',
  },
  drillName: {
    width: '30%',
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
  },
  drillReps: {
    width: '8%',
    fontSize: 7,
    color: '#666',
    textAlign: 'center',
  },
  drillScoutLook: {
    width: '32%',
    fontSize: 7,
    color: '#444',
  },
  drillRationale: {
    width: '30%',
    fontSize: 7,
    color: '#666',
    fontStyle: 'italic',
  },
  footer: {
    position: 'absolute',
    bottom: 16,
    left: 28,
    right: 28,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 6,
    color: '#aaa',
    borderTop: '0.5px solid #ddd',
    paddingTop: 4,
  },
});

interface Props {
  script: PracticeScript;
}

export function PracticeScriptPDF({ script }: Props) {
  return (
    <Document>
      {/* Cover / overview page */}
      <Page size="LETTER" style={s.page}>
        <View style={s.header}>
          <Text style={s.title}>Practice Script</Text>
          <Text style={s.subtitle}>
            vs {script.opponentName} · Week of {script.weekOfMonday}
          </Text>
        </View>

        <Text style={{ ...s.periodName, marginBottom: 4, fontSize: 9 }}>Week Theme</Text>
        <Text style={s.weekTheme}>{script.weekTheme}</Text>

        {/* Day summaries on overview */}
        {script.days.map((day) => {
          const totalMin = day.periods.reduce((n, p) => n + p.durationMinutes, 0);
          const totalDrills = day.periods.reduce((n, p) => n + p.drills.length, 0);
          return (
            <View key={day.day} style={{ flexDirection: 'row', marginBottom: 4, padding: '3 6', backgroundColor: '#f8f8f8' }}>
              <Text style={{ width: '25%', fontFamily: 'Helvetica-Bold', fontSize: 9 }}>{day.day}</Text>
              <Text style={{ width: '20%', fontSize: 8, color: '#666' }}>{day.theme}</Text>
              <Text style={{ width: '20%', fontSize: 8, color: '#666' }}>{totalMin} min</Text>
              <Text style={{ width: '35%', fontSize: 8, color: '#666' }}>
                {day.periods.length} periods · {totalDrills} drills
              </Text>
            </View>
          );
        })}

        <View style={s.footer} fixed>
          <Text>CONFIDENTIAL — vs {script.opponentName}</Text>
          <Text>Audible Football Intelligence</Text>
        </View>
      </Page>

      {/* One page per day */}
      {script.days.map((day) => {
        const totalMin = day.periods.reduce((n, p) => n + p.durationMinutes, 0);
        return (
          <Page key={day.day} size="LETTER" style={s.page}>
            <View style={s.dayHeader}>
              <Text>{day.day} — {day.theme}</Text>
              <Text style={s.dayMinutes}>{totalMin} min total</Text>
            </View>

            {day.periods.map((period, pi) => (
              <View key={pi} style={s.periodBlock} wrap={false}>
                <View style={s.periodHeader}>
                  <Text style={s.periodName}>{period.name}</Text>
                  <Text style={s.periodMeta}>{period.durationMinutes} min</Text>
                </View>
                <Text style={s.periodFocus}>{period.focus}</Text>

                {period.drills.length > 0 && (
                  <View>
                    {/* Column headers */}
                    <View style={{ ...s.drillRow, backgroundColor: '#fafafa' }}>
                      <Text style={{ ...s.drillName, color: '#999', fontFamily: 'Helvetica' }}>Drill</Text>
                      <Text style={{ ...s.drillReps, color: '#999' }}>Reps</Text>
                      <Text style={{ ...s.drillScoutLook, color: '#999' }}>Scout Look</Text>
                      <Text style={{ ...s.drillRationale, color: '#999' }}>Why</Text>
                    </View>
                    {period.drills.map((drill, di) => (
                      <View key={di} style={s.drillRow}>
                        <Text style={s.drillName}>{drill.name}</Text>
                        <Text style={s.drillReps}>{drill.reps}</Text>
                        <Text style={s.drillScoutLook}>{drill.scoutLook}</Text>
                        <Text style={s.drillRationale}>{drill.rationale}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))}

            <View style={s.footer} fixed>
              <Text>CONFIDENTIAL — {day.day} · vs {script.opponentName}</Text>
              <Text>Audible Football Intelligence</Text>
            </View>
          </Page>
        );
      })}
    </Document>
  );
}
