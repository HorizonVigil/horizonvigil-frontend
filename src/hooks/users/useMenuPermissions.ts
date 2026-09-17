/**
 * Per-user / per-group menu permission overrides shown in the access drawer.
 *
 * Query behavior:
 * - Effective permissions stay disabled until a user is selected.
 * - Override queries stay disabled until exactly one subject is selected.
 *
 * Mutation behavior:
 * - A successful write can affect both override records and the effective
 *   permission map.
 * - Therefore CRUD mutations invalidate the complete menu-permissions subtree.
 *
 * Security note:
 * - This hook controls data fetching only. It is not an authorization boundary.
 * - Server-side authorization remains mandatory for every permission mutation
 *   and read.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import {
  userKeys,
  usersApi,
} from '../../api/users.api';

import type { MenuPermissionTarget } from '../../api/users.api';

import type {
  SetMenuPermissionPayload,
} from '../../types/user';

const MENU_PERMISSIONS_ROOT = [
  ...userKeys.all,
  'menu-permissions',
] as const;

const MENU_PERMISSIONS_STALE_TIME_MS =
  30_000;

const MENU_PERMISSIONS_GC_TIME_MS =
  5 * 60_000;

/** What a CALLER may pass: either field, validated below. */
type PermissionTarget = {
  userId?: string;
  groupId?: string;
};

function requireNonEmptyId(
  value: string | undefined,
  fieldName: string,
): string {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} is required.`);
  }

  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }

  return normalized;
}

function normalizeEffectiveUserId(
  userId: string | undefined,
): string | undefined {
  if (typeof userId !== 'string') {
    return undefined;
  }

  const normalized = userId.trim();

  return normalized || undefined;
}

/**
 * Returns the DISCRIMINATED union, not the loose input shape.
 *
 * This already threw unless exactly one subject was present, but returned
 * `PermissionTarget` -- which permits both and neither -- so every caller
 * passing the result to the API layer failed to compile. The type now states
 * the guarantee the function has always enforced.
 */
function normalizePermissionTarget(
  target: PermissionTarget,
): MenuPermissionTarget {
  if (!target || typeof target !== 'object') {
    throw new Error(
      'A permission target is required.',
    );
  }

  const userId =
    typeof target.userId === 'string'
      ? target.userId.trim()
      : '';

  const groupId =
    typeof target.groupId === 'string'
      ? target.groupId.trim()
      : '';

  /*
   * Exactly one subject is valid for this API.
   * Reject both/neither here rather than issuing an ambiguous request.
   */
  if (Boolean(userId) === Boolean(groupId)) {
    throw new Error(
      'Provide exactly one of userId or groupId.',
    );
  }

  return userId
    ? { userId }
    : { groupId };
}

function invalidateMenuPermissions(
  queryClient: ReturnType<
    typeof useQueryClient
  >,
) {
  return queryClient.invalidateQueries({
    queryKey: MENU_PERMISSIONS_ROOT,
  });
}

export function useEffectiveMenuPermissions(
  userId: string | undefined,
) {
  const normalizedUserId =
    normalizeEffectiveUserId(userId);

  return useQuery({
    queryKey:
      userKeys.effectiveMenuPermissions(
        normalizedUserId,
      ),

    queryFn: () =>
      usersApi.getEffectiveMenuPermissions(
        requireNonEmptyId(
          normalizedUserId,
          'User id',
        ),
      ),

    enabled: Boolean(
      normalizedUserId,
    ),

    staleTime:
      MENU_PERMISSIONS_STALE_TIME_MS,

    gcTime:
      MENU_PERMISSIONS_GC_TIME_MS,
  });
}

export function useMenuPermissionOverrides(
  target: PermissionTarget,
) {
  /*
   * Normalize the target before both the query key and query function are
   * evaluated. This prevents whitespace-only IDs from becoming separate cache
   * entries and ensures the API receives the exact same target represented by
   * the key.
   */
  const normalizedTarget =
    (() => {
      try {
        return normalizePermissionTarget(
          target,
        );
      } catch {
        return null;
      }
    })();

  const enabled =
    normalizedTarget !== null;

  return useQuery({
    /*
     * `{}` as the fallback widened this to `MenuPermissionTarget | {}`, which
     * the key builder cannot accept. The query is disabled when there is no
     * target, so this value is never fetched with -- it only has to be a
     * STABLE, well-typed placeholder so the cache key does not churn.
     */
    queryKey: userKeys.menuPermissions(
      normalizedTarget ?? { userId: '' },
    ),

    queryFn: () => {
      if (!normalizedTarget) {
        throw new Error(
          'A valid permission target is required.',
        );
      }

      return usersApi.getMenuPermissionOverrides(
        normalizedTarget,
      );
    },

    enabled,

    staleTime:
      MENU_PERMISSIONS_STALE_TIME_MS,

    gcTime:
      MENU_PERMISSIONS_GC_TIME_MS,
  });
}

export function useSetMenuPermission() {
  const queryClient =
    useQueryClient();

  return useMutation({
    mutationFn: (
      payload: SetMenuPermissionPayload,
    ) => {
      if (
        !payload ||
        typeof payload !== 'object'
      ) {
        throw new Error(
          'Menu permission payload is required.',
        );
      }

      return usersApi.setMenuPermission(
        payload,
      );
    },

    /*
     * No optimistic update: permission state is security-sensitive and the
     * backend response is authoritative.
     */
    onSuccess: async () => {
      await invalidateMenuPermissions(
        queryClient,
      );
    },
  });
}

export function useDeleteMenuPermission() {
  const queryClient =
    useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      usersApi.deleteMenuPermission(
        requireNonEmptyId(
          id,
          'Menu permission id',
        ),
      ),

    onSuccess: async () => {
      await invalidateMenuPermissions(
        queryClient,
      );
    },
  });
}
