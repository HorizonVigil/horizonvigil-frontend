/**
 * User groups and their membership. Group membership changes also affect
 * effective menu permissions, but those are fetched per-selection in the
 * permissions drawer and will re-run when it re-opens, so only the groups
 * list is invalidated here.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { userKeys, usersApi } from '../../api/users.api';

export function useGroups() {
  return useQuery({
    queryKey: userKeys.groups(),
    queryFn: usersApi.getGroups,
  });
}

export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => usersApi.createGroup(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.groups() }),
  });
}

export function useDeleteGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) => usersApi.deleteGroup(groupId),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.groups() }),
  });
}

export function useAddGroupMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, userId }: { groupId: string; userId: string }) =>
      usersApi.addGroupMember(groupId, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.groups() }),
  });
}

export function useRemoveGroupMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, userId }: { groupId: string; userId: string }) =>
      usersApi.removeGroupMember(groupId, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.groups() }),
  });
}
