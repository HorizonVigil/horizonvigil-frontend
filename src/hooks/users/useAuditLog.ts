/**
 * User-activity audit log. Paginated and filterable; the params object is
 * part of the query key so each filter/page combination caches on its own.
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { userKeys, usersApi } from '../../api/users.api';

type AuditLogParams = Parameters<typeof usersApi.getAuditLog>[0];

export function useAuditLog(params: AuditLogParams = {}) {
  return useQuery({
    queryKey: userKeys.auditLog(params ?? {}),
    queryFn: () => usersApi.getAuditLog(params),
    placeholderData: keepPreviousData,
  });
}
