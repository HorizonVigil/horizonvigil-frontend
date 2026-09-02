/**
 * SCIM bearer tokens an IdP authenticates with. Like API keys, the token
 * value is returned once on create and never again.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { userKeys, usersApi } from '../../api/users.api';

export function useScimTokens() {
  return useQuery({
    queryKey: userKeys.scimTokens(),
    queryFn: usersApi.getScimTokens,
  });
}

export function useCreateScimToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => usersApi.createScimToken(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.scimTokens() }),
  });
}

export function useRevokeScimToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => usersApi.revokeScimToken(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.scimTokens() }),
  });
}
