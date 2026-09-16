/**
 * Organization API keys.
 *
 * Security contract:
 * - `createApiKey` returns the full secret exactly once.
 * - The caller is responsible for securely surfacing the one-time secret.
 * - API-key list responses must expose only the safe prefix/metadata.
 * - Creating/revoking a key invalidates the API-key collection only after the
 *   backend confirms the mutation succeeded.
 * - IDs and names are validated at the UI-hook boundary to avoid accidental
 *   empty mutations.
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

const API_KEYS_STALE_TIME_MS = 30_000;
const API_KEYS_GC_TIME_MS = 5 * 60_000;

function requireNonEmptyId(
  value: string,
): string {
  const id = value.trim();

  if (!id) {
    throw new Error(
      'API key id is required.',
    );
  }

  return id;
}

function requireNonEmptyName(
  value: string,
): string {
  const name = value.trim();

  if (!name) {
    throw new Error(
      'API key name is required.',
    );
  }

  return name;
}

export function useApiKeys() {
  return useQuery({
    queryKey: userKeys.apiKeys(),
    queryFn: () => usersApi.getApiKeys(),
    staleTime: API_KEYS_STALE_TIME_MS,
    gcTime: API_KEYS_GC_TIME_MS,

    /*
     * Do not transform or synthesize API-key data here.
     * The API layer is responsible for returning safe list metadata only.
     *
     * In particular, this hook must never attempt to reconstruct a full
     * secret from a prefix or cache one returned during creation.
     */
  });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => {
      const normalizedName =
        requireNonEmptyName(name);

      return usersApi.createApiKey(
        normalizedName,
      );
    },

    /*
     * The mutation response may contain the full secret. Return the response
     * unchanged so the caller can surface it exactly once.
     *
     * Never write the secret into the API-key list cache.
     */
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: userKeys.apiKeys(),
      });
    },
  });
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => {
      const apiKeyId =
        requireNonEmptyId(id);

      return usersApi.revokeApiKey(
        apiKeyId,
      );
    },

    /*
     * Revocation changes durable server state. Refresh the collection only
     * after success so a failed revoke does not make the UI claim the key was
     * removed.
     */
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: userKeys.apiKeys(),
      });
    },
  });
}
