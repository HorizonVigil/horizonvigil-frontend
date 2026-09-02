import { QueryClient } from '@tanstack/react-query';

import { ApiError } from '../lib/api';

/**
 * Single app-wide QueryClient.
 *
 * Defaults are tuned for this app's shape: org-scoped dashboards that are
 * read far more than written, behind a bearer token that can expire.
 *
 * - `staleTime: 30s` — most screens re-mount as the user navigates the
 *   sidebar; without this every visit refires every query. 30s keeps things
 *   feeling live while cutting the redundant refetch storm.
 * - retry skips 4xx — an ApiError with a 4xx status (401 expired session,
 *   403 no permission, 404 gone, 422 bad input) will never succeed on
 *   retry, so surface it immediately. 5xx / network errors retry twice.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
