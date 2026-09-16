import { QueryClient } from '@tanstack/react-query';

import { ApiError } from '../lib/api';

/**
 * Application-wide TanStack Query client.
 *
 * HorizonVigil primarily serves organization-scoped dashboards and
 * operational data that is read more frequently than it is written.
 *
 * Responsibilities:
 * - Configure query freshness and cache lifetime.
 * - Prevent unnecessary refetch storms during normal navigation.
 * - Retry transient failures without retrying deterministic client errors.
 * - Keep mutations fail-fast because mutation retries can duplicate
 *   side effects.
 *
 * Authentication remains owned by the API transport layer. This client
 * deliberately does not refresh tokens, inject headers, or perform API
 * requests directly.
 */

const QUERY_STALE_TIME_MS = 30_000;
const QUERY_GC_TIME_MS = 5 * 60_000;
const MAX_QUERY_RETRIES = 2;

/**
 * Determines whether an API error is a deterministic client error.
 *
 * 4xx responses generally represent requests that should not be retried
 * automatically:
 * - 400 Bad Request
 * - 401 Unauthorized / expired authentication
 * - 403 Forbidden
 * - 404 Not Found
 * - 409 Conflict
 * - 422 Unprocessable Entity
 *
 * The API transport remains responsible for normalizing errors into
 * ApiError instances.
 */
function isClientError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status >= 400 &&
    error.status < 500
  );
}

/**
 * Query retry policy.
 *
 * Retry transient failures only. Deterministic 4xx failures are surfaced
 * immediately so the UI can display the appropriate authentication,
 * permission, validation, or not-found state.
 */
function shouldRetryQuery(
  failureCount: number,
  error: unknown,
): boolean {
  if (isClientError(error)) {
    return false;
  }

  return failureCount < MAX_QUERY_RETRIES;
}

/**
 * Single app-wide QueryClient.
 *
 * Keep this instance at module scope so the application has one shared
 * cache rather than creating a new cache on every render.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /**
       * Data is considered fresh for 30 seconds.
       *
       * This avoids refiring the same dashboard queries every time a user
       * navigates between screens while still keeping operational data
       * reasonably current.
       */
      staleTime: QUERY_STALE_TIME_MS,

      /**
       * Inactive query data remains cached for five minutes before garbage
       * collection.
       */
      gcTime: QUERY_GC_TIME_MS,

      /**
       * Do not refetch every dashboard automatically when the browser
       * regains focus. Individual queries can opt into this behavior when
       * genuinely required for their use case.
       */
      refetchOnWindowFocus: false,

      /**
       * Retry transient failures, but never retry deterministic 4xx
       * responses.
       */
      retry: shouldRetryQuery,
    },

    mutations: {
      /**
       * Mutations are intentionally not retried automatically.
       *
       * Retrying a mutation can duplicate side effects such as creating,
       * updating, deleting, or triggering an operational action.
       */
      retry: false,
    },
  },
});