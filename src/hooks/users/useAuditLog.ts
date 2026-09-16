/**
 * User-activity audit log.
 *
 * The audit log is paginated and filterable. The complete params object is
 * included in the query key so every page/filter combination has its own
 * cache entry.
 *
 * Production invariants:
 * - The API remains the source of truth for pagination, filtering, and
 *   authorization.
 * - Params are normalized only at the boundary so `undefined` and an omitted
 *   params object do not accidentally create different cache entries.
 * - Previous data remains visible while changing page/filter parameters.
 * - Audit data is never mutated optimistically.
 * - Query failures are surfaced to the caller rather than being converted into
 *   an empty audit log.
 */

import {
  keepPreviousData,
  useQuery,
} from '@tanstack/react-query';

import {
  userKeys,
  usersApi,
} from '../../api/users.api';

type AuditLogParams =
  Parameters<typeof usersApi.getAuditLog>[0];

const AUDIT_LOG_STALE_TIME_MS =
  30_000;

const AUDIT_LOG_GC_TIME_MS =
  5 * 60_000;

export function useAuditLog(
  params: AuditLogParams = {},
) {
  /*
   * Keep one canonical params object for both the query key and query
   * function. This prevents the hook from treating `undefined` and `{}` as
   * different inputs while preserving the API's existing parameter contract.
   */
  const normalizedParams =
    params ?? ({} as AuditLogParams);

  return useQuery({
    queryKey: userKeys.auditLog(
      normalizedParams,
    ),

    queryFn: () =>
      usersApi.getAuditLog(
        normalizedParams,
      ),

    /*
     * Audit history changes less frequently than live operational state.
     * Keep a short freshness window while still allowing explicit refetches.
     */
    staleTime:
      AUDIT_LOG_STALE_TIME_MS,

    /*
     * Bound inactive paginated/filter combinations so a long browsing session
     * does not retain every historical page forever.
     */
    gcTime:
      AUDIT_LOG_GC_TIME_MS,

    /*
     * Keep the previous page/filter result visible while the requested query
     * is loading. This avoids empty-table flashes when moving between pages.
     */
    placeholderData:
      keepPreviousData,

    /*
     * Do not retry mutations here because this is a read-only query. The
     * default TanStack Query retry policy remains appropriate for transient
     * network failures and lets deterministic authorization errors surface
     * normally.
     */
  });
}
