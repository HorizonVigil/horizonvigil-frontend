/**
 * Org API keys. `createApiKey` returns the full secret exactly once — the
 * caller is responsible for surfacing it; the list only ever shows the
 * prefix.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { userKeys, usersApi } from '../../api/users.api';

export function useApiKeys() {
  return useQuery({
    queryKey: userKeys.apiKeys(),
    queryFn: usersApi.getApiKeys,
  });
}

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => usersApi.createApiKey(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.apiKeys() }),
  });
}

export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => usersApi.revokeApiKey(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.apiKeys() }),
  });
}
