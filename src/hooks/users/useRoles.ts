/**
 * Static role catalogue and the caller's own effective permissions.
 *
 * Role definitions are effectively static during a session, so the role
 * catalogue uses a long freshness window. Effective permissions are more
 * sensitive to role/group/ownership changes, so they use a shorter window and
 * should also be explicitly invalidated by mutations that can affect the
 * current user's authorization.
 *
 * Production invariants:
 * - Query keys remain centralized in `userKeys`.
 * - API failures are surfaced rather than converted into empty permissions.
 * - No client-side authorization decision is made by these hooks; the server
 *   remains the authorization boundary.
 * - `useMyPermissions` can be invalidated by role/ownership/group/permission
 *   mutations elsewhere in the access-control hooks.
 */

import { useQuery } from '@tanstack/react-query';

import {
  userKeys,
  usersApi,
} from '../../api/users.api';

const ROLES_STALE_TIME_MS =
  60 * 60_000;

const ROLES_GC_TIME_MS =
  24 * 60 * 60_000;

const MY_PERMISSIONS_STALE_TIME_MS =
  5 * 60_000;

const MY_PERMISSIONS_GC_TIME_MS =
  30 * 60_000;

export function useRoles() {
  return useQuery({
    queryKey: userKeys.roles(),
    queryFn: () => usersApi.getRoles(),

    /*
     * Role definitions are effectively static for a session. A long stale
     * period avoids unnecessary refetches while still allowing explicit
     * invalidation when the application changes role configuration.
     */
    staleTime: ROLES_STALE_TIME_MS,

    /*
     * Keep the catalogue available in cache for the duration of a normal
     * session without retaining it indefinitely.
     */
    gcTime: ROLES_GC_TIME_MS,
  });
}

export function useMyPermissions() {
  return useQuery({
    queryKey: userKeys.myPermissions(),
    queryFn: () => usersApi.getMyPermissions(),

    /*
     * Effective permissions can change after role grants, ownership transfer,
     * group membership changes, or permission-policy mutations. Five minutes
     * is only a freshness optimization; relevant mutation hooks should still
     * invalidate this query immediately after successful authorization changes.
     */
    staleTime:
      MY_PERMISSIONS_STALE_TIME_MS,

    gcTime:
      MY_PERMISSIONS_GC_TIME_MS,

    /*
     * Do not provide fallback permissions here. An unavailable permissions
     * response must remain an error/unknown state rather than being interpreted
     * as "no permissions" or "full permissions".
     */
  });
}