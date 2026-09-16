/**
 * Per-user cloud-connection access grants shown in the access drawer.
 *
 * `useEffectiveResourceGrants` reports whether a user is restricted and which
 * connections are effectively granted.
 * `useResourceGrants` exposes the raw persisted grant rows used for editing.
 *
 * Both queries remain disabled until a valid user is selected.
 *
 * Production invariants:
 * - IDs are normalized before entering query keys or API calls.
 * - Invalid/unselected users never trigger network requests.
 * - Resource-grant mutations invalidate the complete resource-grants subtree
 *   only after the backend confirms the mutation.
 * - No optimistic authorization state is written to the cache.
 * - Server-side authorization remains the security boundary.
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

const RESOURCE_GRANTS_ROOT = [
  ...userKeys.all,
  'resource-grants',
] as const;

const RESOURCE_GRANTS_STALE_TIME_MS =
  30_000;

const RESOURCE_GRANTS_GC_TIME_MS =
  5 * 60_000;

function normalizeUserId(
  value: string | undefined,
): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();

  return normalized || undefined;
}

function requireNonEmptyId(
  value: string,
  fieldName: string,
): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }

  return normalized;
}

function invalidateResourceGrants(
  queryClient: ReturnType<
    typeof useQueryClient
  >,
) {
  return queryClient.invalidateQueries({
    queryKey: RESOURCE_GRANTS_ROOT,
  });
}

interface ResourceGrantInput {
  userId: string;
  connectionId: string;
}

function normalizeResourceGrantInput(
  input: ResourceGrantInput,
): ResourceGrantInput {
  if (
    !input ||
    typeof input !== 'object'
  ) {
    throw new Error(
      'Resource grant input is required.',
    );
  }

  return {
    userId: requireNonEmptyId(
      input.userId,
      'User id',
    ),
    connectionId: requireNonEmptyId(
      input.connectionId,
      'Connection id',
    ),
  };
}

export function useEffectiveResourceGrants(
  userId: string | undefined,
) {
  const normalizedUserId =
    normalizeUserId(userId);

  return useQuery({
    queryKey:
      userKeys.effectiveResourceGrants(
        normalizedUserId,
      ),

    queryFn: () =>
      usersApi.getEffectiveResourceGrants(
        requireNonEmptyId(
          normalizedUserId ?? '',
          'User id',
        ),
      ),

    enabled: Boolean(
      normalizedUserId,
    ),

    staleTime:
      RESOURCE_GRANTS_STALE_TIME_MS,

    gcTime:
      RESOURCE_GRANTS_GC_TIME_MS,
  });
}

export function useResourceGrants(
  userId: string | undefined,
) {
  const normalizedUserId =
    normalizeUserId(userId);

  return useQuery({
    queryKey:
      userKeys.resourceGrants(
        normalizedUserId ?? '',
      ),

    queryFn: () =>
      usersApi.getResourceGrants(
        requireNonEmptyId(
          normalizedUserId ?? '',
          'User id',
        ),
      ),

    enabled: Boolean(
      normalizedUserId,
    ),

    staleTime:
      RESOURCE_GRANTS_STALE_TIME_MS,

    gcTime:
      RESOURCE_GRANTS_GC_TIME_MS,
  });
}

export function useSetResourceGrant() {
  const queryClient =
    useQueryClient();

  return useMutation({
    mutationFn: (
      input: ResourceGrantInput,
    ) => {
      const {
        userId,
        connectionId,
      } =
        normalizeResourceGrantInput(
          input,
        );

      return usersApi.setResourceGrant(
        userId,
        connectionId,
      );
    },

    /*
     * Resource grants directly affect authorization scope, so do not perform
     * optimistic cache updates. The backend is the authoritative source.
     */
    onSuccess: async () => {
      await invalidateResourceGrants(
        queryClient,
      );
    },
  });
}

export function useDeleteResourceGrant() {
  const queryClient =
    useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      usersApi.deleteResourceGrant(
        requireNonEmptyId(
          id,
          'Resource grant id',
        ),
      ),

    onSuccess: async () => {
      await invalidateResourceGrants(
        queryClient,
      );
    },
  });
}
