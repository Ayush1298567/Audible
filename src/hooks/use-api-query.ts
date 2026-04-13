'use client';

/**
 * Shared hook for API data fetching — eliminates the repeated pattern of
 * useState(data) + useState(isLoading) + useCallback(fetch) + useEffect
 * across every dashboard page.
 *
 * Usage:
 *   const { data, isLoading, refetch } = useApiQuery<Player[]>(
 *     `/api/players?programId=${programId}`,
 *     (json) => json.players,
 *   );
 */

import { useCallback, useEffect, useState } from 'react';

interface UseApiQueryResult<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useApiQuery<T>(
  url: string | null,
  extract?: (json: Record<string, unknown>) => T,
): UseApiQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!url) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Request failed' }));
        setError((body as Record<string, string>).error ?? 'Request failed');
        setData(null);
      } else {
        const json = await res.json();
        setData(extract ? extract(json as Record<string, unknown>) : (json as T));
      }
    } catch {
      setError('Network error');
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [url, extract]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, isLoading, error, refetch };
}

/**
 * Shared hook for API mutations (POST/PUT/DELETE).
 *
 * Usage:
 *   const { mutate, isLoading } = useApiMutation('/api/players');
 *   await mutate({ programId, firstName, lastName, ... });
 */

interface UseApiMutationResult<TInput, TOutput> {
  mutate: (body: TInput) => Promise<TOutput | null>;
  isLoading: boolean;
  error: string | null;
}

export function useApiMutation<TInput = Record<string, unknown>, TOutput = Record<string, unknown>>(
  url: string,
  options?: { method?: string; onSuccess?: (data: TOutput) => void },
): UseApiMutationResult<TInput, TOutput> {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(
    async (body: TInput): Promise<TOutput | null> => {
      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch(url, {
          method: options?.method ?? 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        const data = await res.json();

        if (!res.ok) {
          setError((data as Record<string, string>).error ?? 'Request failed');
          return null;
        }

        options?.onSuccess?.(data as TOutput);
        return data as TOutput;
      } catch {
        setError('Network error');
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [url, options],
  );

  return { mutate, isLoading, error };
}
