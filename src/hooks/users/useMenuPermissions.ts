/**
 * Per-user / per-group menu permission overrides shown in the access
 * drawer. Queries stay disabled until a subject is actually selected.
 *
 * A write touches both the override list and the effective map for that
 * subject, so mutations invalidate the whole `['users','menu-permissions']`
 * subtree rather than trying to name each key.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { userKeys, usersApi } from '../../api/users.api';
import type { SetMenuPermissionPayload } from '../../types/user';

const MENU_PERMISSIONS_ROOT = [...userKeys.all, 'menu-permissions'] as const;

export function useEffectiveMenuPermissions(userId: string | undefined) {
  return useQuery({
    queryKey: userKeys.effectiveMenuPermissions(userId),
    queryFn: () => usersApi.getEffectiveMenuPermissions(userId),
    enabled: Boolean(userId),
  });
}

export function useMenuPermissionOverrides(target: { userId?: string; groupId?: string }) {
  return useQuery({
    queryKey: userKeys.menuPermissions(target),
    queryFn: () => usersApi.getMenuPermissionOverrides(target),
    enabled: Boolean(target.userId || target.groupId),
  });
}

export function useSetMenuPermission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SetMenuPermissionPayload) => usersApi.setMenuPermission(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: MENU_PERMISSIONS_ROOT }),
  });
}

export function useDeleteMenuPermission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => usersApi.deleteMenuPermission(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: MENU_PERMISSIONS_ROOT }),
  });
}
