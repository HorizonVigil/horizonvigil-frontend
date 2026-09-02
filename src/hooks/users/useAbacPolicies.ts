/**
 * ABAC policies layered on top of RBAC. `testAbacPolicy` is a pure dry-run
 * (it never mutates), so it is a mutation here only in the "imperative,
 * on-demand" sense — nothing is invalidated by it.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { userKeys, usersApi } from '../../api/users.api';
import type { AbacPolicyPayload, AbacPolicyTestPayload } from '../../types/user';

export function useAbacPolicies() {
  return useQuery({
    queryKey: userKeys.abacPolicies(),
    queryFn: usersApi.getAbacPolicies,
  });
}

export function useCreateAbacPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: AbacPolicyPayload) => usersApi.createAbacPolicy(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.abacPolicies() }),
  });
}

export function useUpdateAbacPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<AbacPolicyPayload> }) =>
      usersApi.updateAbacPolicy(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.abacPolicies() }),
  });
}

export function useDeleteAbacPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => usersApi.deleteAbacPolicy(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.abacPolicies() }),
  });
}

export function useTestAbacPolicy() {
  return useMutation({
    mutationFn: (data: AbacPolicyTestPayload) => usersApi.testAbacPolicy(data),
  });
}
