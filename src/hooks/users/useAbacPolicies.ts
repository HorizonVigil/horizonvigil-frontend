import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { userKeys, usersApi } from '../../api/users.api';
import type {
  AbacPolicyPayload,
  AbacPolicyTestPayload,
} from '../../types/user';

/**
 * ABAC policies are layered on top of RBAC.
 *
 * `testAbacPolicy` is a pure dry-run: it evaluates a policy request without
 * persisting, updating, or deleting policy state. As a result, the test
 * mutation does not invalidate the ABAC policy query.
 *
 * Production invariants:
 * - Query keys remain centralized in `userKeys`.
 * - Policy CRUD mutations invalidate only the ABAC policy collection after a
 *   successful server mutation.
 * - Mutation failures are allowed to propagate to React Query consumers.
 * - No optimistic cache writes are performed because the API response is the
 *   authoritative source for persisted policy state.
 * - The dry-run action never mutates the ABAC policy cache.
 */

const ABAC_POLICIES_STALE_TIME_MS = 30_000;
const ABAC_POLICIES_GC_TIME_MS = 5 * 60_000;

function requireNonEmptyId(
  value: string,
  fieldName = 'Policy id',
): string {
  const id = value.trim();

  if (!id) {
    throw new Error(`${fieldName} is required.`);
  }

  return id;
}

export function useAbacPolicies() {
  return useQuery({
    queryKey: userKeys.abacPolicies(),
    queryFn: () => usersApi.getAbacPolicies(),

    /*
     * ABAC policy definitions are relatively small and do not normally need
     * to be refetched on every render/focus event.
     */
    staleTime: ABAC_POLICIES_STALE_TIME_MS,
    gcTime: ABAC_POLICIES_GC_TIME_MS,

    /*
     * Policy reads are deterministic from the current organization/user
     * context, so the standard React Query retry behavior is sufficient for
     * transient failures. Authorization errors are still surfaced by the API
     * layer rather than being converted into an empty policy list.
     */
  });
}

export function useCreateAbacPolicy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (
      data: AbacPolicyPayload,
    ) => usersApi.createAbacPolicy(data),

    /*
     * Do not invalidate before the server confirms persistence.
     *
     * This avoids refreshing the collection after a failed create and keeps
     * the cache aligned with durable backend state.
     */
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: userKeys.abacPolicies(),
      });
    },
  });
}

export function useUpdateAbacPolicy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<AbacPolicyPayload>;
    }) => {
      const policyId = requireNonEmptyId(id);

      return usersApi.updateAbacPolicy(
        policyId,
        data,
      );
    },

    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: userKeys.abacPolicies(),
      });
    },
  });
}

export function useDeleteAbacPolicy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => {
      const policyId = requireNonEmptyId(id);

      return usersApi.deleteAbacPolicy(
        policyId,
      );
    },

    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: userKeys.abacPolicies(),
      });
    },
  });
}

export function useTestAbacPolicy() {
  return useMutation({
    /*
     * This is intentionally a mutation rather than a query:
     * the evaluation is explicitly triggered by the user and may have server
     * side execution semantics even though it does not persist policy state.
     */
    mutationFn: (
      data: AbacPolicyTestPayload,
    ) => usersApi.testAbacPolicy(data),

    /*
     * No ABAC policy invalidation here. A successful dry-run does not change
     * persisted policy state.
     *
     * React Query's default mutation retry behavior is intentionally retained
     * to avoid imposing retry semantics on a potentially expensive
     * policy-evaluation endpoint.
     */
  });
}
