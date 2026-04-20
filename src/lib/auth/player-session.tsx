'use client';

/**
 * Player session context — lightweight auth via join codes.
 *
 * Players don't use Clerk (skipped for now) or the coach's program
 * context. Instead, they redeem a 6-character join code which
 * validates against the players table and creates a session stored
 * in localStorage.
 *
 * The player session gives access to:
 *   - Their program's coach-pushed film clips
 *   - Their position-specific game plan assignments
 *   - Their own progress data
 *
 * Per PLAN.md §8 rule 8: "Player App shows only what the coach has pushed."
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

interface PlayerSession {
  playerId: string;
  programId: string;
  firstName: string;
  lastName: string;
  jerseyNumber: number;
  positions: string[];
  token: string;
}

interface PlayerSessionContextValue {
  session: PlayerSession | null;
  isLoading: boolean;
  login: (joinCode: string) => Promise<{ success: boolean; error?: string }>;
  authHeaders: () => HeadersInit;
  authFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  logout: () => void;
}

const PlayerSessionContext = createContext<PlayerSessionContextValue>({
  session: null,
  isLoading: true,
  login: async () => ({ success: false }),
  authHeaders: () => ({}),
  authFetch: (input, init) => fetch(input, init),
  logout: () => {},
});

const STORAGE_KEY = 'audible_player_session';

export function PlayerSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<PlayerSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setSession(JSON.parse(stored));
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (joinCode: string) => {
    try {
      const res = await fetch('/api/player-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ joinCode }),
      });

      if (!res.ok) {
        const data = await res.json();
        return { success: false, error: data.error ?? 'Invalid join code' };
      }

      const data = await res.json();
      const playerSession: PlayerSession = {
        playerId: data.player.id,
        programId: data.player.programId,
        firstName: data.player.firstName,
        lastName: data.player.lastName,
        jerseyNumber: data.player.jerseyNumber,
        positions: data.player.positions,
        token: data.token,
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(playerSession));
      setSession(playerSession);
      return { success: true };
    } catch {
      return { success: false, error: 'Connection failed' };
    }
  }, []);

  const authHeaders = useCallback((): HeadersInit => {
    if (!session?.token) return {};
    return { 'x-player-token': session.token };
  }, [session]);

  const authFetch = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const mergedHeaders: HeadersInit = {
        ...(init?.headers ?? {}),
        ...authHeaders(),
      };
      const response = await fetch(input, { ...init, headers: mergedHeaders });
      if (response.status === 401) {
        localStorage.removeItem(STORAGE_KEY);
        setSession(null);
      }
      return response;
    },
    [authHeaders],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
  }, []);

  return (
    <PlayerSessionContext.Provider
      value={{ session, isLoading, login, authHeaders, authFetch, logout }}
    >
      {children}
    </PlayerSessionContext.Provider>
  );
}

export function usePlayerSession(): PlayerSessionContextValue {
  return useContext(PlayerSessionContext);
}
