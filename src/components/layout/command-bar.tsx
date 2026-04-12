'use client';

import { Input } from '@/components/ui/input';
import { useState } from 'react';

/**
 * Command bar placeholder — Phase 1 shell only.
 *
 * Phase 5 wires this to the LLM tool-calling layer. For now it's
 * a static search bar that shows the "always visible" pattern from
 * PLAN.md §8 rule 6: "The command bar is always visible on the
 * Coach Platform. Never hidden, never collapsed."
 */
export function CommandBar() {
  const [query, setQuery] = useState('');

  return (
    <div className="sticky top-0 z-30 border-b border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="relative mx-auto max-w-3xl">
        <Input
          type="text"
          placeholder='Ask anything... "Show me every play their corner gave 7+ yards of cushion"'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-10 pl-10 text-sm"
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          /
        </span>
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          Phase 5
        </span>
      </div>
    </div>
  );
}
