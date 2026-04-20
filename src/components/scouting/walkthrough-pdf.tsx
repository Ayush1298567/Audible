'use client';

import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { Walkthrough } from '@/lib/scouting/insights';

/**
 * Printable scouting report PDF from walkthrough data.
 * Two sections: tendency insights + call sheet by situation.
 * Designed for the coach's office printer — black/white friendly.
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
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 9,
    color: '#666',
    marginTop: 2,
  },
  sectionHeader: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    backgroundColor: '#1a1a1a',
    color: '#fff',
    padding: '4 8',
    marginTop: 12,
    marginBottom: 6,
  },
  insightCard: {
    border: '0.5px solid #ccc',
    padding: 8,
    marginBottom: 8,
    borderRadius: 2,
  },
  insightRank: {
    fontSize: 7,
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 2,
  },
  insightHeadline: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  narrative: {
    fontSize: 8,
    lineHeight: 1.5,
    color: '#333',
    marginBottom: 6,
  },
  recRow: {
    flexDirection: 'row',
    marginBottom: 3,
    paddingLeft: 8,
  },
  recBullet: {
    width: 8,
    fontSize: 8,
    color: '#999',
  },
  recCall: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
  },
  recSituation: {
    fontSize: 7,
    color: '#666',
    marginLeft: 4,
  },
  recRationale: {
    fontSize: 7,
    color: '#666',
    fontStyle: 'italic',
    paddingLeft: 16,
    marginBottom: 2,
  },
  bucketTitle: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    backgroundColor: '#f0f0f0',
    padding: '3 6',
    marginTop: 6,
    marginBottom: 3,
  },
  bucketPlay: {
    flexDirection: 'row',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderBottom: '0.5px solid #eee',
  },
  bucketCallName: {
    width: '40%',
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
  },
  bucketRationale: {
    width: '60%',
    fontSize: 7,
    color: '#555',
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
  walkthrough: Walkthrough;
}

export function WalkthroughPDF({ walkthrough }: Props) {
  const { insights, callSheet, opponentName, playsAnalyzed, generatedAt } = walkthrough;
  const date = new Date(generatedAt).toLocaleDateString();

  return (
    <Document>
      {/* Page 1: Scouting Insights */}
      <Page size="LETTER" style={s.page}>
        <View style={s.header}>
          <Text style={s.title}>Scouting Report</Text>
          <Text style={s.subtitle}>
            vs {opponentName} · {playsAnalyzed} plays analyzed · {date}
          </Text>
        </View>

        <Text style={s.sectionHeader}>
          Top {insights.length} Exploitable Tendencies
        </Text>

        {insights.map((ins) => (
          <View key={ins.id} style={s.insightCard} wrap={false}>
            <Text style={s.insightRank}>Tendency #{ins.rank} · {ins.evidenceCount} plays</Text>
            <Text style={s.insightHeadline}>{ins.headline}</Text>
            <Text style={s.narrative}>{ins.narrative}</Text>
            {ins.recommendations.map((rec, i) => (
              <View key={i}>
                <View style={s.recRow}>
                  <Text style={s.recBullet}>•</Text>
                  <Text style={s.recCall}>{rec.call}</Text>
                  <Text style={s.recSituation}> — {rec.situation}</Text>
                </View>
                <Text style={s.recRationale}>{rec.rationale}</Text>
              </View>
            ))}
          </View>
        ))}

        <View style={s.footer} fixed>
          <Text>CONFIDENTIAL — vs {opponentName}</Text>
          <Text>Audible Football Intelligence</Text>
        </View>
      </Page>

      {/* Page 2: Call Sheet */}
      {callSheet && callSheet.buckets.length > 0 && (
        <Page size="LETTER" style={s.page}>
          <View style={s.header}>
            <Text style={s.title}>Friday Call Sheet</Text>
            <Text style={s.subtitle}>vs {opponentName} · by situation</Text>
          </View>

          {callSheet.buckets.map((bucket) => (
            <View key={bucket.bucket} wrap={false}>
              <Text style={s.bucketTitle}>
                {bucket.bucket} ({bucket.recommendations.length})
              </Text>
              {bucket.recommendations.map((rec, i) => (
                <View key={i} style={s.bucketPlay}>
                  <Text style={s.bucketCallName}>{rec.call}</Text>
                  <Text style={s.bucketRationale}>{rec.rationale}</Text>
                </View>
              ))}
            </View>
          ))}

          <View style={s.footer} fixed>
            <Text>CONFIDENTIAL — vs {opponentName}</Text>
            <Text>Audible Football Intelligence</Text>
          </View>
        </Page>
      )}
    </Document>
  );
}
