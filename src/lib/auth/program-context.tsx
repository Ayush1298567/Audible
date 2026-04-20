'use client';

/**
 * Program context — resolves the current Clerk organization into an
 * Audible program ID.
 *
 * Source of truth is the Clerk org session. On mount (and whenever the
 * active org changes), we fetch `/api/programs` — which is Clerk-gated
 * and returns the programs belonging to the authenticated user's org.
 * localStorage is used only as a hydration cache to avoid layout flicker.
 *
 * Consumer API (unchanged from the original placeholder):
 *   const { programId, programName, isLoading } = useProgram();
 */

import { useOrganization } from '@clerk/nextjs';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

interface ProgramContextValue {
  programId: string | null;
  programName: string | null;
  programLevel: string | null;
  isLoading: boolean;
  /** Force-refresh the program from the server (e.g. after setup). */
  refresh: () => void;
}

const ProgramContext = createContext<ProgramContextValue>({
  programId: null,
  programName: null,
  programLevel: null,
  isLoading: true,
  refresh: () => {},
});

const STORAGE_KEY_ID = 'audible_program_id';
const STORAGE_KEY_NAME = 'audible_program_name';

export function ProgramProvider({ children }: { children: ReactNode }) {
  const { organization, isLoaded: isOrgLoaded } = useOrganization();

  const [programId, setProgramId] = useState<string | null>(null);
  const [programName, setProgramName] = useState<string | null>(null);
  const [programLevel, setProgramLevel] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchKey, setFetchKey] = useState(0);

  // On first render, hydrate from localStorage to avoid flicker.
  useEffect(() => {
    const cached = localStorage.getItem(STORAGE_KEY_ID);
    const cachedName = localStorage.getItem(STORAGE_KEY_NAME);
    if (cached) {
      setProgramId(cached);
      setProgramName(cachedName);
    }
  }, []);

  // When the Clerk org is loaded (or changes), resolve programId from
  // the server. The API is auth-gated — it only returns programs for
  // the authenticated user's org.
  useEffect(() => {
    if (!isOrgLoaded) return;

    // No org → user isn't in a team yet; clear state.
    if (!organization) {
      setProgramId(null);
      setProgramName(null);
      setProgramLevel(null);
      localStorage.removeItem(STORAGE_KEY_ID);
      localStorage.removeItem(STORAGE_KEY_NAME);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function resolve() {
      try {
        const res = await fetch('/api/programs');
        if (!res.ok) {
          throw new Error(`/api/programs returned ${res.status}`);
        }
        const data = await res.json();
        const best = (data.programs ?? [])[0] as
          | { id: string; name: string; level?: string }
          | undefined;

        if (cancelled) return;

        if (best) {
          setProgramId(best.id);
          setProgramName(best.name);
          setProgramLevel(best.level ?? null);
          localStorage.setItem(STORAGE_KEY_ID, best.id);
          localStorage.setItem(STORAGE_KEY_NAME, best.name);
        } else {
          setProgramId(null);
          setProgramName(null);
          setProgramLevel(null);
          localStorage.removeItem(STORAGE_KEY_ID);
          localStorage.removeItem(STORAGE_KEY_NAME);
        }
      } catch {
        // Network error — keep any cached value so offline-ish dev works.
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [isOrgLoaded, organization?.id, fetchKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(() => setFetchKey((k) => k + 1), []);

  return (
    <ProgramContext.Provider
      value={{ programId, programName, programLevel, isLoading, refresh }}
    >
      {children}
    </ProgramContext.Provider>
  );
}

export function useProgram(): ProgramContextValue {
  return useContext(ProgramContext);
}
