'use client';

/**
 * Program context — resolves the authenticated user into an Audible
 * program ID.
 *
 * In production (Clerk Organizations enabled): uses useOrganization()
 * to get the org → fetches /api/programs to resolve programId.
 *
 * In dev mode (NODE_ENV=development or Clerk orgs not enabled): fetches
 * /api/programs directly — the API already gates on Clerk auth and
 * returns the user's program. Falls back to localStorage for the dev
 * toolbar's manual overrides.
 *
 * Consumer API:
 *   const { programId, programName, programLevel, isLoading, refresh } = useProgram();
 */

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
  /** Dev-only: manually set programId (from dev toolbar). */
  setProgramId?: (id: string, name: string, level?: string) => void;
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
const STORAGE_KEY_LEVEL = 'audible_program_level';

export function ProgramProvider({ children }: { children: ReactNode }) {
  const [programId, _setProgramId] = useState<string | null>(null);
  const [programName, _setProgramName] = useState<string | null>(null);
  const [programLevel, _setProgramLevel] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchKey, setFetchKey] = useState(0);

  // On first render, hydrate from localStorage to avoid flicker.
  useEffect(() => {
    const cached = localStorage.getItem(STORAGE_KEY_ID);
    const cachedName = localStorage.getItem(STORAGE_KEY_NAME);
    const cachedLevel = localStorage.getItem(STORAGE_KEY_LEVEL);
    if (cached) {
      _setProgramId(cached);
      _setProgramName(cachedName);
      _setProgramLevel(cachedLevel);
    }
  }, []);

  // Fetch the program from the server. The API is Clerk-gated and
  // returns programs for the authenticated user. Works with or without
  // Clerk Organizations enabled.
  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      try {
        const res = await fetch('/api/programs');
        if (!res.ok) {
          // Auth might not be set up yet — keep cached value
          setIsLoading(false);
          return;
        }
        const data = await res.json();
        const best = (data.programs ?? [])[0] as
          | { id: string; name: string; level?: string }
          | undefined;

        if (cancelled) return;

        if (best) {
          _setProgramId(best.id);
          _setProgramName(best.name);
          _setProgramLevel(best.level ?? null);
          localStorage.setItem(STORAGE_KEY_ID, best.id);
          localStorage.setItem(STORAGE_KEY_NAME, best.name);
          if (best.level) localStorage.setItem(STORAGE_KEY_LEVEL, best.level);
        }
      } catch {
        // Network error — keep any cached value.
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [fetchKey]);

  const refresh = useCallback(() => setFetchKey((k) => k + 1), []);

  // Dev-only: manual override from the dev toolbar
  const setProgramId = useCallback((id: string, name: string, level?: string) => {
    _setProgramId(id);
    _setProgramName(name);
    _setProgramLevel(level ?? null);
    localStorage.setItem(STORAGE_KEY_ID, id);
    localStorage.setItem(STORAGE_KEY_NAME, name);
    if (level) localStorage.setItem(STORAGE_KEY_LEVEL, level);
  }, []);

  return (
    <ProgramContext.Provider
      value={{ programId, programName, programLevel, isLoading, refresh, setProgramId }}
    >
      {children}
    </ProgramContext.Provider>
  );
}

export function useProgram(): ProgramContextValue {
  return useContext(ProgramContext);
}
