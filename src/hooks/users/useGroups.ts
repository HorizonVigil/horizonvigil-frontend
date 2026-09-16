/**
 * User groups and membership.
 *
 * Group membership can affect effective menu/resource permissions. The
 * authoritative effective-permission queries are fetched for the selected
 * user/group elsewhere, so successful membership mutations invalidate the
 * groups collection only. Consumers that display effective permissions should
 * invalidate or refetch their selection-specific query when that drawer/view
 * opens or after the mutation, according to their own query contract.
 *
 * Production invariants:
 * - Group CRUD and membership mutations invalidate the group list only after
 *   the backend confirms success.
 * - Empty IDs/names are rejected before making a mutation request.
 * - No optimistic cache updates are used because membership and permission
 *   state are authorization-sensitive and the backend remains authoritative.
 * - Query/cache behavior is centralized through userKeys.
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

const GROUPS_STALE_TIME_MS = 30_000;
const GROUPS_GC_TIME_MS = 5 * 60_000;

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

function invalidateGroups(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  return queryClient.invalidateQueries({
    queryKey: userKeys.groups(),
  });
}

export function useGroups() {
  return useQuery({
    queryKey: userKeys.groups(),
    queryFn: () => usersApi.getGroups(),
    staleTime: GROUPS_STALE_TIME_MS,
    gcTime: GROUPS_GC_TIME_MS,
  });
}

export function useCreateGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) =>
      usersApi.createGroup(
        requireNonEmptyValue(
          name,
          'Group name',
        ),
      ),

    onSuccess: async () => {
      await invalidateGroups(
        queryClient,
      );
    },
  });
}

export function useDeleteGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (groupId: string) =>
      usersApi.deleteGroup(
        requireNonEmptyValue(
          groupId,
          'Group id',
        ),
      ),

    onSuccess: async () => {
      await invalidateGroups(
        queryClient,
      );
    },
  });
}

interface GroupMembershipInput {
  groupId: string;
  userId: string;
}

function normalizeMembershipInput(
  input: GroupMembershipInput,
): GroupMembershipInput {
  return {
    groupId: requireNonEmptyValue(
      input.groupId,
      'Group id',
    ),
    userId: requireNonEmptyValue(
      input.userId,
      'User id',
    ),
  };
}

export function useAddGroupMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (
      input: GroupMembershipInput,
    ) => {
      const {
        groupId,
        userId,
      } = normalizeMembershipInput(
        input,
      );

      return usersApi.addGroupMember(
        groupId,
        userId,
      );
    },

    onSuccess: async () => {
      /*
       * Membership is now persisted. Refresh the group collection before
       * consumers render stale membership counts/names.
       */
      await invalidateGroups(
        queryClient,
      );
    },
  });
}

export function useRemoveGroupMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (
      input: GroupMembershipInput,
    ) => {
      const {
        groupId,
        userId,
      } = normalizeMembershipInput(
        input,
      );

      return usersApi.removeGroupMember(
        groupId,
        userId,
      );
    },

    onSuccess: async () => {
      await invalidateGroups(
        queryClient,
      );
    },
  });
}
