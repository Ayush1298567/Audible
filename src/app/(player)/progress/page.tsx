'use client';

import { usePlayerSession } from '@/lib/auth/player-session';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/**
 * Player progress page — shows completion stats and readiness.
 *
 * Phase 7 MVP: static progress indicators. Phase 8 (Practice Builder)
 * adds real session completion data and accuracy tracking.
 */
export default function ProgressPage() {
  const { session } = usePlayerSession();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">My Progress</h1>

      {/* Weekly readiness */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">This Week</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Film clips watched</span>
            <Badge variant="secondary">0</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Game plan reviewed</span>
            <Badge variant="secondary">Not started</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Recognition challenges</span>
            <Badge variant="outline">Phase 8</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Decision drills</span>
            <Badge variant="outline">Phase 8</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Season stats placeholder */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Season Progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Position</span>
            <span className="text-sm font-medium">
              {session?.positions.join(' / ') ?? '-'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Total sessions completed</span>
            <span className="text-sm font-medium">0</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Coverage recognition accuracy</span>
            <span className="text-sm font-medium text-muted-foreground">
              No data yet
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Decision time average</span>
            <span className="text-sm font-medium text-muted-foreground">
              No data yet
            </span>
          </div>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Practice Builder sessions and accuracy tracking come online in Phase 8.
      </p>
    </div>
  );
}
