import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Audible — Football Intelligence',
  description: 'Automated film intelligence for high school and small college football programs.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        {/* First-party, privacy-friendly analytics — no cookie banner needed */}
        <Analytics />
        {/* Real-user Core Web Vitals (LCP, INP, CLS, FCP, TTFB) per route */}
        <SpeedInsights />
      </body>
    </html>
  );
}
