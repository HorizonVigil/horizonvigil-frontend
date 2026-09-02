/**
 * User / access-control domain types.
 *
 * The wire shapes still live in `lib/api.ts` (re-exported here) — this file
 * is the import surface for the users feature and the home for the
 * request-payload types the hooks accept.
 */
export type {
  Role,
  Member,
  PendingInvite,
  PendingInviteRow,
  UserGroup,
  ApiKeySummary,
  ActivityEntry,
  MenuPermissionRow,
  MenuPermissionLevel,
  ResourceGrantRow,
  AbacPolicyRow,
  AbacCondition,
  AbacTestResult,
  ScimTokenSummary,
} from '../lib/api';

import type { Role, AbacCondition, MenuPermissionLevel } from '../lib/api';

export interface RoleDescription {
  role: Role;
  description: string;
}

export interface MyPermissions {
  role: Role;
  description: string;
  effectivePermissions: RoleDescription;
}

export interface MembersResponse {
  members: import('../lib/api').Member[];
  pendingInvites: import('../lib/api').PendingInvite[];
}

export interface InvitePayload {
  email: string;
  role: Role;
}

export interface SetMenuPermissionPayload {
  menuKey: string;
  level: MenuPermissionLevel;
  userId?: string;
  groupId?: string;
}

export interface AbacPolicyPayload {
  name: string;
  description?: string;
  effect: 'allow' | 'deny';
  menuKey?: string | null;
  conditions: AbacCondition[];
  priority?: number;
  enabled?: boolean;
}

export interface AbacPolicyTestPayload {
  userId: string;
  menuKey: string;
  resourceAttributes?: Record<string, unknown>;
}
