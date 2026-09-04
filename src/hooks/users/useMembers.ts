/**
 * Org members + outstanding invites, and every mutation that changes them.
 *
 * All mutations invalidate `userKeys.members()` on success so the table and
 * the pending-invites list re-fetch once; role changes also touch
 * `myPermissions()` since the caller may have changed their own row.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { userKeys, usersApi } from '../../api/users.api';
import type { InvitePayload, Role } from '../../types/user';

export function useMembers() {
  return useQuery({
    queryKey: userKeys.members(),
    queryFn: usersApi.getMembers,
  });
}

export function useInviteMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: InvitePayload) => usersApi.invite(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.members() }),
  });
}

export function useUpdateMemberRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roleGrantId, role }: { roleGrantId: string; role: Role }) =>
      usersApi.updateRole(roleGrantId, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userKeys.members() });
      qc.invalidateQueries({ queryKey: userKeys.myPermissions() });
    },
  });
}

export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (roleGrantId: string) => usersApi.removeMember(roleGrantId),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.members() }),
  });
}

export function useTransferOwnership() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (newOwnerUserId: string) => usersApi.transferOwnership(newOwnerUserId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userKeys.members() });
      qc.invalidateQueries({ queryKey: userKeys.myPermissions() });
    },
  });
}

export function useUpdateMemberAttributes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, attributes }: { userId: string; attributes: Record<string, unknown> }) =>
      usersApi.updateAttributes(userId, attributes),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.members() }),
  });
}
