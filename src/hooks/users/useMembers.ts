/**
 * Organization members, pending invites, and mutations that change them.
 *
 * Production invariants:
 * - The members query is the single read source for current members and
 *   outstanding invites.
 * - Successful membership mutations invalidate the members collection.
 * - Mutations that can change the current user's effective access also
 *   invalidate `myPermissions()`.
 * - No optimistic member/permission state is written because authorization
 *   state is security-sensitive and the backend is authoritative.
 * - IDs and invite/member inputs are validated before issuing a mutation.
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

import type {
  InvitePayload,
  Role,
} from '../../types/user';

const MEMBERS_STALE_TIME_MS = 30_000;
const MEMBERS_GC_TIME_MS = 5 * 60_000;

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

function invalidateMembers(
  queryClient: ReturnType<
    typeof useQueryClient
  >,
) {
  return queryClient.invalidateQueries({
    queryKey: userKeys.members(),
  });
}

function invalidateMyPermissions(
  queryClient: ReturnType<
    typeof useQueryClient
  >,
) {
  return queryClient.invalidateQueries({
    queryKey: userKeys.myPermissions(),
  });
}

function normalizeInvitePayload(
  payload: InvitePayload,
): InvitePayload {
  if (
    !payload ||
    typeof payload !== 'object'
  ) {
    throw new Error(
      'Invite payload is required.',
    );
  }

  /*
   * Keep the payload shape intact instead of inventing fields at this layer.
   * Validate only the commonly required identity field when present in the
   * existing API contract.
   */
  const candidate =
    payload as InvitePayload & {
      email?: unknown;
    };

  if (
    'email' in candidate &&
    typeof candidate.email === 'string'
  ) {
    const email = candidate.email.trim();

    if (!email) {
      throw new Error(
        'Invite email is required.',
      );
    }

    return {
      ...payload,
      email,
    } as InvitePayload;
  }

  return payload;
}

interface UpdateMemberRoleInput {
  roleGrantId: string;
  role: Role;
}

function normalizeRoleUpdate(
  input: UpdateMemberRoleInput,
): UpdateMemberRoleInput {
  const roleGrantId =
    requireNonEmptyValue(
      input.roleGrantId,
      'Role grant id',
    );

  if (!input.role) {
    throw new Error('Role is required.');
  }

  return {
    roleGrantId,
    role: input.role,
  };
}

interface UpdateMemberAttributesInput {
  userId: string;
  attributes: Record<
    string,
    unknown
  >;
}

function normalizeAttributesInput(
  input: UpdateMemberAttributesInput,
): UpdateMemberAttributesInput {
  const userId =
    requireNonEmptyValue(
      input.userId,
      'User id',
    );

  if (
    !input.attributes ||
    typeof input.attributes !== 'object' ||
    Array.isArray(input.attributes)
  ) {
    throw new Error(
      'Member attributes must be an object.',
    );
  }

  return {
    userId,
    attributes: input.attributes,
  };
}

export function useMembers() {
  return useQuery({
    queryKey: userKeys.members(),
    queryFn: () => usersApi.getMembers(),
    staleTime: MEMBERS_STALE_TIME_MS,
    gcTime: MEMBERS_GC_TIME_MS,
  });
}

export function useInviteMember() {
  const queryClient =
    useQueryClient();

  return useMutation({
    mutationFn: (
      payload: InvitePayload,
    ) =>
      usersApi.invite(
        normalizeInvitePayload(
          payload,
        ),
      ),

    onSuccess: async () => {
      /*
       * Wait for invalidation to complete so callers awaiting the mutation
       * receive a cache state aligned with the new membership/invite state.
       */
      await invalidateMembers(
        queryClient,
      );
    },
  });
}

export function useCancelInvite() {
  const queryClient =
    useQueryClient();

  return useMutation({
    mutationFn: (
      inviteId: string,
    ) =>
      usersApi.cancelInvite(
        requireNonEmptyValue(
          inviteId,
          'Invite id',
        ),
      ),

    onSuccess: async () => {
      await invalidateMembers(
        queryClient,
      );
    },
  });
}

export function useUpdateMemberRole() {
  const queryClient =
    useQueryClient();

  return useMutation({
    mutationFn: (
      input: UpdateMemberRoleInput,
    ) => {
      const {
        roleGrantId,
        role,
      } =
        normalizeRoleUpdate(
          input,
        );

      return usersApi.updateRole(
        roleGrantId,
        role,
      );
    },

    onSuccess: async () => {
      /*
       * Role changes affect the members table and can also alter the current
       * user's effective permissions when the edited grant belongs to them.
       * Invalidate both authoritative queries after persistence succeeds.
       */
      await Promise.all([
        invalidateMembers(
          queryClient,
        ),
        invalidateMyPermissions(
          queryClient,
        ),
      ]);
    },
  });
}

export function useRemoveMember() {
  const queryClient =
    useQueryClient();

  return useMutation({
    mutationFn: (
      roleGrantId: string,
    ) =>
      usersApi.removeMember(
        requireNonEmptyValue(
          roleGrantId,
          'Role grant id',
        ),
      ),

    onSuccess: async () => {
      /*
       * Removing another member usually does not change the caller's
       * permissions, so only the members collection is invalidated here.
       */
      await invalidateMembers(
        queryClient,
      );
    },
  });
}

export function useTransferOwnership() {
  const queryClient =
    useQueryClient();

  return useMutation({
    mutationFn: (
      newOwnerUserId: string,
    ) =>
      usersApi.transferOwnership(
        requireNonEmptyValue(
          newOwnerUserId,
          'New owner user id',
        ),
      ),

    onSuccess: async () => {
      /*
       * Ownership transfer changes both organization membership/role state
       * and potentially the current user's authorization.
       */
      await Promise.all([
        invalidateMembers(
          queryClient,
        ),
        invalidateMyPermissions(
          queryClient,
        ),
      ]);
    },
  });
}

export function useUpdateMemberAttributes() {
  const queryClient =
    useQueryClient();

  return useMutation({
    mutationFn: (
      input: UpdateMemberAttributesInput,
    ) => {
      const {
        userId,
        attributes,
      } =
        normalizeAttributesInput(
          input,
        );

      return usersApi.updateAttributes(
        userId,
        attributes,
      );
    },

    onSuccess: async () => {
      /*
       * Attributes affect the member representation. Do not invalidate
       * effective permissions here unless the backend contract explicitly
       * defines these attributes as authorization inputs; that relationship
       * is not established by this hook's current API contract.
       */
      await invalidateMembers(
        queryClient,
      );
    },
  });
}
