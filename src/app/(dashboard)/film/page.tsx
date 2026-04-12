'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/**
 * Film Room — Phase 2 will add the Hudl upload flow and play grid.
 * For now, placeholder showing the intended structure.
 */
export default function FilmRoomPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Film Room</h1>
        <p className="text-muted-foreground">
          Search, review, and package film
        </p>
      </div>

      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-lg font-medium">Upload your first game film</p>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Export your breakdown CSV, SportsCode XML, and concatenated MP4 from
            Hudl, then drop them here. Audible parses the tags, splits the clips,
            and runs the vision intelligence layer automatically.
          </p>
          <Badge variant="outline" className="mt-6">
            Phase 2 — Hudl ingestion
          </Badge>
        </CardContent>
      </Card>
    </div>
  );
}
