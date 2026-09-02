/**
 * Users / access-control domain — request functions and the query-key
 * factory. Hooks in `src/hooks/users/**` are the only consumers; nothing
 * here calls TanStack Query itself.
 */
import { api } from './client';
import type {
  AbacPolicyPayload,
  AbacPolicyTestPayload,
  InvitePayload,
  SetMenuPermissionPayload,
} from '../types/user';

/**
 * Query-key factory. Every key starts with `['users', ...]` so the whole
 * domain can be invalidated at once, and sub-resources nest predictably.
 * `.filter` on a list key keeps a filtered list cached separately from the
 * unfiltered one.
 */
export const userKeys = {
  all: ['users'] as const,

  members: () => [...userKeys.all, 'members'] as const,
  groups: () => [...userKeys.all, 'groups'] as const,
  roles: () => [...userKeys.all, 'roles'] as const,
  myPermissions: () => [...userKeys.all, 'my-permissions'] as const,

  apiKeys: () => [...userKeys.all, 'api-keys'] as const,
  scimTokens: () => [...userKeys.all, 'scim-tokens'] as const,
  abacPolicies: () => [...userKeys.all, 'abac-policies'] as const,

  auditLog: (params: Record<string, unknown>) =>
    [...userKeys.all, 'audit-log', params] as const,

  menuPermissions: (target: { userId?: string; groupId?: string }) =>
    [...userKeys.all, 'menu-permissions', target] as const,
  effectiveMenuPermissions: (userId?: string) =>
    [...userKeys.all, 'menu-permissions', 'effective', userId ?? 'me'] as const,

  resourceGrants: (userId: string) =>
    [...userKeys.all, 'resource-grants', userId] as const,
  effectiveResourceGrants: (userId?: string) =>
    [...userKeys.all, 'resource-grants', 'effective', userId ?? 'me'] as const,
};

export const usersApi = {
  // ── members & invites ──────────────────────────────────────────────────
  getMembers: () => api.getMembers(),
  invite: ({ email, role }: InvitePayload) => api.inviteMember(email, role),
  cancelInvite: (inviteId: string) => api.cancelInvite(inviteId),
  updateRole: (roleGrantId: string, role: InvitePayload['role']) =>
    api.updateRoleGrant(roleGrantId, role),
  removeMember: (roleGrantId: string) => api.deleteRoleGrant(roleGrantId),
  transferOwnership: (newOwnerUserId: string) => api.transferOwnership(newOwnerUserId),
  updateAttributes: (userId: string, attributes: Record<string, unknown>) =>
    api.updateMemberAttributes(userId, attributes),

  // ── groups ─────────────────────────────────────────────────────────────
  getGroups: () => api.getGroups(),
  createGroup: (name: string) => api.createGroup(name),
  deleteGroup: (groupId: string) => api.deleteGroup(groupId),
  addGroupMember: (groupId: string, userId: string) => api.addGroupMember(groupId, userId),
  removeGroupMember: (groupId: string, userId: string) =>
    api.removeGroupMember(groupId, userId),

  // ── roles & my permissions ─────────────────────────────────────────────
  getRoles: () => api.getRoles(),
  getMyPermissions: () => api.getMyPermissions(),

  // ── menu permissions ───────────────────────────────────────────────────
  getEffectiveMenuPermissions: (userId?: string) =>
    api.getEffectiveMenuPermissions(userId),
  getMenuPermissionOverrides: (target: { userId?: string; groupId?: string }) =>
    api.getMenuPermissionOverrides(target),
  setMenuPermission: ({ userId, groupId, menuKey, level }: SetMenuPermissionPayload) =>
    api.setMenuPermission(
      userId
        ? { userId, menuKey, level }
        : { groupId: groupId as string, menuKey, level },
    ),
  deleteMenuPermission: (id: string) => api.deleteMenuPermission(id),

  // ── resource grants ────────────────────────────────────────────────────
  getEffectiveResourceGrants: (userId?: string) =>
    api.getEffectiveResourceGrants(userId),
  getResourceGrants: (userId: string) => api.getResourceGrants(userId),
  setResourceGrant: (userId: string, connectionId: string) =>
    api.setResourceGrant(userId, connectionId),
  deleteResourceGrant: (id: string) => api.deleteResourceGrant(id),

  // ── API keys ───────────────────────────────────────────────────────────
  getApiKeys: () => api.getApiKeys(),
  createApiKey: (name: string) => api.createApiKey(name),
  revokeApiKey: (id: string) => api.revokeApiKey(id),

  // ── SCIM tokens ────────────────────────────────────────────────────────
  getScimTokens: () => api.getScimTokens(),
  createScimToken: (name: string) => api.createScimToken(name),
  revokeScimToken: (id: string) => api.revokeScimToken(id),

  // ── ABAC policies ──────────────────────────────────────────────────────
  getAbacPolicies: () => api.getAbacPolicies(),
  createAbacPolicy: (data: AbacPolicyPayload) => api.createAbacPolicy(data),
  updateAbacPolicy: (id: string, data: Partial<AbacPolicyPayload>) =>
    api.updateAbacPolicy(id, data as Parameters<typeof api.updateAbacPolicy>[1]),
  deleteAbacPolicy: (id: string) => api.deleteAbacPolicy(id),
  testAbacPolicy: (data: AbacPolicyTestPayload) => api.testAbacPolicy(data),

  // ── audit log ──────────────────────────────────────────────────────────
  getAuditLog: (params: Parameters<typeof api.getUserAuditLog>[0]) =>
    api.getUserAuditLog(params),
};
