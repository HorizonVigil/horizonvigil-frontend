/**
 * Per-user cloud-connection access grants shown in the access drawer.
 * `useEffectiveResourceGrants` reports whether the user is restricted at
 * all and to which connections; `useResourceGrants` lists the raw grant
 * rows for editing. Both stay disabled until a user is selected.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { userKeys, usersApi } from '../../api/users.api';

const RESOURCE_GRANTS_ROOT = [...userKeys.all, 'resource-grants'] as const;

export function useEffectiveResourceGrants(userId: string | undefined) {
  return useQuery({
    queryKey: userKeys.effectiveResourceGrants(userId),
    queryFn: () => usersApi.getEffectiveResourceGrants(userId),
    enabled: Boolean(userId),
  });
}

export function useResourceGrants(userId: string | undefined) {
  return useQuery({
    queryKey: userKeys.resourceGrants(userId ?? ''),
    queryFn: () => usersApi.getResourceGrants(userId as string),
    enabled: Boolean(userId),
  });
}

export function useSetResourceGrant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, connectionId }: { userId: string; connectionId: string }) =>
      usersApi.setResourceGrant(userId, connectionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: RESOURCE_GRANTS_ROOT }),
  });
}

export function useDeleteResourceGrant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => usersApi.deleteResourceGrant(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: RESOURCE_GRANTS_ROOT }),
  });
}
