'use client';

import { useProgram } from '@/lib/auth/program-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/**
 * The Hub — what a coach sees every time they open Audible.
 *
 * Phase 1: shows status cards and placeholder content.
 * Phase 4: intelligence flags populate from the tendency engine.
 * Phase 4.5: CV-derived insights appear.
 * Phase 5: command bar becomes functional.
 */
export default function HubPage() {
  const { programName } = useProgram();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{programName}</h1>
        <p className="text-muted-foreground">
          Your weekly intelligence dashboard
        </p>
      </div>

      {/* Status cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatusCard
          title="Film"
          value="0 games"
          description="Upload your first game film"
          status="empty"
        />
        <StatusCard
          title="Game Plan"
          value="Not started"
          description="Build after uploading film"
          status="empty"
        />
        <StatusCard
          title="Player Prep"
          value="0%"
          description="No sessions assigned yet"
          status="empty"
        />
        <StatusCard
          title="Roster"
          value="0 players"
          description="Add players to get started"
          status="empty"
        />
      </div>

      {/* Intelligence flags placeholder */}
      <div>
        <h2 className="mb-4 text-lg font-semibold">Intelligence Flags</h2>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Upload game film to start seeing intelligence flags.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Audible will find what you can&apos;t find manually — coverage
              tendencies, pressure patterns, and matchup vulnerabilities.
            </p>
            <Badge variant="outline" className="mt-4">
              Phase 2 — Film upload
            </Badge>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatusCard({
  title,
  value,
  description,
  status,
}: {
  title: string;
  value: string;
  description: string;
  status: 'empty' | 'partial' | 'complete';
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center justify-between">
          {title}
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              status === 'complete'
                ? 'bg-green-500'
                : status === 'partial'
                  ? 'bg-yellow-500'
                  : 'bg-gray-300'
            }`}
          />
        </CardDescription>
        <CardTitle className="text-xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
