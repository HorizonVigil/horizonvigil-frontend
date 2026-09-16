/**
 * Users / access-control domain.
 *
 * This module contains domain request functions and the query-key factory.
 * TanStack Query hooks under `src/hooks/users/**` are the consumers.
 *
 * Responsibilities:
 * - Define stable, hierarchical query keys for the users/access-control domain.
 * - Expose typed request functions backed by the shared API transport.
 * - Keep domain request logic independent from TanStack Query.
 *
 * This module intentionally does not:
 * - create QueryClient instances;
 * - perform caching or invalidation;
 * - manage authentication tokens;
 * - access Supabase directly;
 * - contain UI state or presentation logic.
 */

import { api } from './client';

import type {
  AbacPolicyPayload,
  AbacPolicyTestPayload,
  InvitePayload,
  SetMenuPermissionPayload,
} from '../types/user';

type AuditLogParams = Parameters<typeof api.getUserAuditLog>[0];

type MenuPermissionTarget =
  | { userId: string; groupId?: never }
  | { groupId: string; userId?: never };

function requireNonEmptyId(value: string, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${fieldName} must be a non-empty string.`);
  }

  return value.trim();
}

function requireMenuPermissionTarget(
  target: { userId?: string; groupId?: string },
): MenuPermissionTarget {
  const userId = target.userId?.trim();
  const groupId = target.groupId?.trim();

  if (userId && groupId) {
    throw new TypeError(
      'Menu permission target must contain either userId or groupId, not both.',
    );
  }

  if (!userId && !groupId) {
    throw new TypeError(
      'Menu permission target must contain either userId or groupId.',
    );
  }

  if (userId) {
    return { userId };
  }

  return { groupId: groupId as string };
}

/**
 * Query-key factory.
 *
 * Every key begins with `['users']`, allowing the complete users/access-control
 * domain to be invalidated with `userKeys.all`.
 *
 * Resource-specific parameters are included in the key so differently filtered
 * or targeted requests never share an unintended cache entry.
 */
export const userKeys = {
  all: ['users'] as const,

  members: () => [...userKeys.all, 'members'] as const,

  groups: () => [...userKeys.all, 'groups'] as const,

  roles: () => [...userKeys.all, 'roles'] as const,

  myPermissions: () =>
    [...userKeys.all, 'my-permissions'] as const,

  apiKeys: () =>
    [...userKeys.all, 'api-keys'] as const,

  scimTokens: () =>
    [...userKeys.all, 'scim-tokens'] as const,

  abacPolicies: () =>
    [...userKeys.all, 'abac-policies'] as const,

  auditLog: (params: AuditLogParams) =>
    [...userKeys.all, 'audit-log', params] as const,

  menuPermissions: (target: MenuPermissionTarget) =>
    [...userKeys.all, 'menu-permissions', target] as const,

  effectiveMenuPermissions: (userId?: string) =>
    [
      ...userKeys.all,
      'menu-permissions',
      'effective',
      userId?.trim() || 'me',
    ] as const,

  resourceGrants: (userId: string) =>
    [
      ...userKeys.all,
      'resource-grants',
      requireNonEmptyId(userId, 'userId'),
    ] as const,

  effectiveResourceGrants: (userId?: string) =>
    [
      ...userKeys.all,
      'resource-grants',
      userId?.trim() || 'me',
    ] as const,
};

/**
 * Users/access-control API.
 *
 * These functions are deliberately thin adapters around the shared API
 * transport. TanStack Query hooks should call these functions rather than
 * calling the transport directly.
 */
export const usersApi = {
  // ── Members & invitations ──────────────────────────────────────────────

  getMembers: () => api.getMembers(),

  invite: ({ email, role }: InvitePayload) =>
    api.inviteMember(email, role),

  cancelInvite: (inviteId: string) =>
    api.cancelInvite(requireNonEmptyId(inviteId, 'inviteId')),

  updateRole: (
    roleGrantId: string,
    role: InvitePayload['role'],
  ) =>
    api.updateRoleGrant(
      requireNonEmptyId(roleGrantId, 'roleGrantId'),
      role,
    ),

  removeMember: (roleGrantId: string) =>
    api.deleteRoleGrant(
      requireNonEmptyId(roleGrantId, 'roleGrantId'),
    ),

  transferOwnership: (newOwnerUserId: string) =>
    api.transferOwnership(
      requireNonEmptyId(newOwnerUserId, 'newOwnerUserId'),
    ),

  updateAttributes: (
    userId: string,
    attributes: Record<string, unknown>,
  ) =>
    api.updateMemberAttributes(
      requireNonEmptyId(userId, 'userId'),
      attributes,
    ),

  // ── Groups ─────────────────────────────────────────────────────────────

  getGroups: () => api.getGroups(),

  createGroup: (name: string) => api.createGroup(name),

  deleteGroup: (groupId: string) =>
    api.deleteGroup(requireNonEmptyId(groupId, 'groupId')),

  addGroupMember: (groupId: string, userId: string) =>
    api.addGroupMember(
      requireNonEmptyId(groupId, 'groupId'),
      requireNonEmptyId(userId, 'userId'),
    ),

  removeGroupMember: (groupId: string, userId: string) =>
    api.removeGroupMember(
      requireNonEmptyId(groupId, 'groupId'),
      requireNonEmptyId(userId, 'userId'),
    ),

  // ── Roles & current-user permissions ──────────────────────────────────

  getRoles: () => api.getRoles(),

  getMyPermissions: () => api.getMyPermissions(),

  // ── Menu permissions ──────────────────────────────────────────────────

  getEffectiveMenuPermissions: (userId?: string) =>
    api.getEffectiveMenuPermissions(
      userId?.trim() || undefined,
    ),

  getMenuPermissionOverrides: (
    target: { userId?: string; groupId?: string },
  ) =>
    api.getMenuPermissionOverrides(
      requireMenuPermissionTarget(target),
    ),

  setMenuPermission: ({
    userId,
    groupId,
    menuKey,
    level,
  }: SetMenuPermissionPayload) => {
    const target = requireMenuPermissionTarget({
      userId,
      groupId,
    });

    if ('userId' in target) {
      return api.setMenuPermission({
        userId: target.userId,
        menuKey,
        level,
      });
    }

    return api.setMenuPermission({
      groupId: target.groupId,
      menuKey,
      level,
    });
  },

  deleteMenuPermission: (id: string) =>
    api.deleteMenuPermission(
      requireNonEmptyId(id, 'id'),
    ),

  // ── Resource grants ──────────────────────────────────────────────────

  getEffectiveResourceGrants: (userId?: string) =>
    api.getEffectiveResourceGrants(
      userId?.trim() || undefined,
    ),

  getResourceGrants: (userId: string) =>
    api.getResourceGrants(
      requireNonEmptyId(userId, 'userId'),
    ),

  setResourceGrant: (
    userId: string,
    connectionId: string,
  ) =>
    api.setResourceGrant(
      requireNonEmptyId(userId, 'userId'),
      requireNonEmptyId(connectionId, 'connectionId'),
    ),

  deleteResourceGrant: (id: string) =>
    api.deleteResourceGrant(
      requireNonEmptyId(id, 'id'),
    ),

  // ── API keys ─────────────────────────────────────────────────────────

  getApiKeys: () => api.getApiKeys(),

  createApiKey: (name: string) =>
    api.createApiKey(name),

  revokeApiKey: (id: string) =>
    api.revokeApiKey(
      requireNonEmptyId(id, 'id'),
    ),

  // ── SCIM tokens ──────────────────────────────────────────────────────

  getScimTokens: () => api.getScimTokens(),

  createScimToken: (name: string) =>
    api.createScimToken(name),

  revokeScimToken: (id: string) =>
    api.revokeScimToken(
      requireNonEmptyId(id, 'id'),
    ),

  // ── ABAC policies ────────────────────────────────────────────────────

  getAbacPolicies: () =>
    api.getAbacPolicies(),

  createAbacPolicy: (data: AbacPolicyPayload) =>
    api.createAbacPolicy(data),

  updateAbacPolicy: (
    id: string,
    data: Partial<AbacPolicyPayload>,
  ) =>
    api.updateAbacPolicy(
      requireNonEmptyId(id, 'id'),
      data as Parameters<typeof api.updateAbacPolicy>[1],
    ),

  deleteAbacPolicy: (id: string) =>
    api.deleteAbacPolicy(
      requireNonEmptyId(id, 'id'),
    ),

  testAbacPolicy: (data: AbacPolicyTestPayload) =>
    api.testAbacPolicy(data),

  // ── Audit log ────────────────────────────────────────────────────────

  getAuditLog: (params: AuditLogParams) =>
    api.getUserAuditLog(params),
};