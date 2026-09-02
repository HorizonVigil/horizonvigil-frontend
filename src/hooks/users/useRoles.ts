/**
 * Static role catalogue and the caller's own effective permissions.
 * Both are effectively constant for a session, so they lean on a long
 * stale time rather than the 30s default.
 */
import { useQuery } from '@tanstack/react-query';

import { userKeys, usersApi } from '../../api/users.api';

export function useRoles() {
  return useQuery({
    queryKey: userKeys.roles(),
    queryFn: usersApi.getRoles,
    staleTime: 60 * 60_000,
  });
}

export function useMyPermissions() {
  return useQuery({
    queryKey: userKeys.myPermissions(),
    queryFn: usersApi.getMyPermissions,
    staleTime: 5 * 60_000,
  });
}
