'use client';

/**
 * Lightweight program context — placeholder until Clerk is wired in.
 *
 * Stores the current program ID in localStorage. Every dashboard page
 * reads from this context to know which program's data to load. When
 * Clerk is added in a later phase, this file gets replaced with
 * Clerk's org context and the consumer API stays the same.
 *
 * Consumer API:
 *   const { programId, setProgramId, clearProgram } = useProgram();
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
  isLoading: boolean;
  setProgramId: (id: string, name: string) => void;
  clearProgram: () => void;
}

const ProgramContext = createContext<ProgramContextValue>({
  programId: null,
  programName: null,
  isLoading: true,
  setProgramId: () => {},
  clearProgram: () => {},
});

const STORAGE_KEY_ID = 'audible_program_id';
const STORAGE_KEY_NAME = 'audible_program_name';

export function ProgramProvider({ children }: { children: ReactNode }) {
  const [programId, setProgramIdState] = useState<string | null>(null);
  const [programName, setProgramNameState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedId = localStorage.getItem(STORAGE_KEY_ID);
    const storedName = localStorage.getItem(STORAGE_KEY_NAME);
    if (storedId) {
      setProgramIdState(storedId);
      setProgramNameState(storedName);
    }
    setIsLoading(false);
  }, []);

  const setProgramId = useCallback((id: string, name: string) => {
    localStorage.setItem(STORAGE_KEY_ID, id);
    localStorage.setItem(STORAGE_KEY_NAME, name);
    setProgramIdState(id);
    setProgramNameState(name);
  }, []);

  const clearProgram = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY_ID);
    localStorage.removeItem(STORAGE_KEY_NAME);
    setProgramIdState(null);
    setProgramNameState(null);
  }, []);

  return (
    <ProgramContext.Provider
      value={{ programId, programName, isLoading, setProgramId, clearProgram }}
    >
      {children}
    </ProgramContext.Provider>
  );
}

export function useProgram(): ProgramContextValue {
  const context = useContext(ProgramContext);
  return context;
}
