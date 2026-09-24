/**
 * SCIM bearer tokens used by an identity provider to authenticate SCIM calls.
 *
 * Security contract:
 * - `createScimToken` returns the full token exactly once.
 * - The caller is responsible for securely surfacing the one-time secret.
 * - List responses must contain only safe token metadata/prefixes, never the
 *   full bearer token.
 * - Create/revoke mutations invalidate the SCIM-token collection only after
 *   the backend confirms success.
 * - No optimistic token state is written to the cache.
 *
 * These hooks are data-fetching primitives only. Server-side authorization
 * remains the security boundary for every SCIM operation.
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

const SCIM_TOKENS_STALE_TIME_MS =
  30_000;

const SCIM_TOKENS_GC_TIME_MS =
  5 * 60_000;

function requireNonEmptyValue(
  value: string,
  fieldName: string,
): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }

  return normalized;
}

function invalidateScimTokens(
  queryClient: ReturnType<
    typeof useQueryClient
  >,
) {
  return queryClient.invalidateQueries({
    queryKey: userKeys.scimTokens(),
  });
}

export function useScimTokens() {
  return useQuery({
    queryKey: userKeys.scimTokens(),
    queryFn: () => usersApi.getScimTokens(),

    /*
     * Token metadata changes infrequently. Keep a short freshness window so
     * normal navigation does not repeatedly hit the API while still allowing
     * explicit refetches and successful mutations to refresh the list.
     */
    staleTime: SCIM_TOKENS_STALE_TIME_MS,

    /*
     * Avoid retaining inactive token metadata indefinitely.
     */
    gcTime: SCIM_TOKENS_GC_TIME_MS,

    /*
     * Do not provide fallback token data. An authorization/network error must
     * remain an error rather than being interpreted as an empty token list.
     */
  });
}

export function useCreateScimToken() {
  const queryClient =
    useQueryClient();

  return useMutation({
    mutationFn: (name: string) =>
      usersApi.createScimToken(
        requireNonEmptyValue(
          name,
          'SCIM token name',
        ),
      ),

    /*
     * The mutation response may include the full secret. Return it unchanged
     * so the caller can display/copy it exactly once.
     *
     * Never insert the secret into the SCIM-token collection cache.
     */
    onSuccess: async () => {
      await invalidateScimTokens(
        queryClient,
      );
    },
  });
}

export function useRevokeScimToken() {
  const queryClient =
    useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      usersApi.revokeScimToken(
        requireNonEmptyValue(
          id,
          'SCIM token id',
        ),
      ),

    /*
     * Only refresh after successful revocation. If the server rejects the
     * operation, the existing token remains visible rather than being
     * optimistically removed from the UI.
     */
    onSuccess: async () => {
      await invalidateScimTokens(
        queryClient,
      );
    },
  });
}
