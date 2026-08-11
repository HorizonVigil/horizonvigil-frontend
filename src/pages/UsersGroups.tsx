import { useEffect, useState, useCallback } from 'react';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { useConfirm } from '../components/ConfirmDialog';
import { useTabParam } from '../lib/useTabParam';
import { useOrg } from '../lib/orgContext';
import { useToast } from '../lib/toast';
import { api, type Member, type PendingInvite, type UserGroup, type Role, type ApiKeySummary, type ActivityEntry, type MenuPermissionRow, type MenuPermissionLevel } from '../lib/api';
import { NAV_MODULES } from '../lib/navConfig';

const MENU_LEVELS: { value: MenuPermissionLevel; label: string }[] = [
  { value: 'none', label: 'No Access' },
  { value: 'read', label: 'Read' },
  { value: 'write', label: 'Write' },
  { value: 'admin', label: 'Admin' },
];

type MyPermissions = { role: Role; description: string; effectivePermissions: { role: Role; description: string } };

// Enterprise roles with descriptions
const ENTERPRISE_ROLES: { value: Role; label: string; description: string; level: 'org' | 'project' | 'resource' }[] = [
  { value: 'owner', label: 'Organization Owner', description: 'Full control over the organization, billing, and all resources', level: 'org' },
  { value: 'admin', label: 'Organization Admin', description: 'Manage users, projects, cloud accounts, and organization settings', level: 'org' },
  { value: 'billing_admin', label: 'Billing Admin', description: 'Manage subscriptions, invoices, and payment methods', level: 'org' },
  { value: 'editor', label: 'DevOps Engineer', description: 'Create, update, and manage cloud resources and deployments', level: 'project' },
  { value: 'viewer', label: 'Read Only / Auditor', description: 'View-only access to dashboards, resources, and reports', level: 'project' },
];

// Permission matrix actions
const PERMISSION_ACTIONS = [
  { key: 'view', label: 'View', description: 'Read access to resources and dashboards' },
  { key: 'create', label: 'Create', description: 'Create new resources, projects, and connections' },
  { key: 'update', label: 'Update', description: 'Modify existing resources and configurations' },
  { key: 'delete', label: 'Delete', description: 'Remove resources, connections, and data' },
  { key: 'execute', label: 'Execute', description: 'Run scans, syncs, and remediation actions' },
  { key: 'restart', label: 'Restart', description: 'Restart instances, services, and workloads' },
  { key: 'scale', label: 'Scale', description: 'Scale resources up or down' },
  { key: 'deploy', label: 'Deploy', description: 'Deploy applications and configurations' },
  { key: 'rollback', label: 'Rollback', description: 'Rollback deployments and changes' },
  { key: 'view_logs', label: 'View Logs', description: 'Access application and system logs' },
  { key: 'view_metrics', label: 'View Metrics', description: 'Access monitoring metrics and dashboards' },
  { key: 'download_reports', label: 'Download Reports', description: 'Export and download reports' },
  { key: 'manage_billing', label: 'Manage Billing', description: 'Manage subscriptions and payment methods' },
  { key: 'manage_alerts', label: 'Manage Alerts', description: 'Create, update, and delete alert rules' },
  { key: 'manage_integrations', label: 'Manage Integrations', description: 'Configure third-party integrations' },
  { key: 'manage_users', label: 'Manage Users', description: 'Invite, remove, and change user roles' },
  { key: 'manage_org', label: 'Manage Organization', description: 'Modify organization settings and branding' },
  { key: 'manage_projects', label: 'Manage Projects', description: 'Create, update, and delete projects' },
];

// Role-to-permission mapping
const ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: PERMISSION_ACTIONS.map(p => p.key),
  admin: ['view', 'create', 'update', 'delete', 'execute', 'view_logs', 'view_metrics', 'download_reports', 'manage_alerts', 'manage_integrations', 'manage_users', 'manage_projects'],
  billing_admin: ['view', 'download_reports', 'manage_billing'],
  editor: ['view', 'create', 'update', 'execute', 'restart', 'scale', 'deploy', 'rollback', 'view_logs', 'view_metrics', 'download_reports'],
  viewer: ['view', 'view_metrics', 'download_reports'],
};

const TABS = ['Users', 'Groups', 'Roles & Permissions', 'Project Access', 'API Keys', 'Audit Logs'] as const;
type Tab = typeof TABS[number];

export function UsersGroups() {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { toast } = useToast();
  const { projects } = useOrg();
  const [tab, setTab] = useTabParam<Tab>(TABS, 'Users');
  const [members, setMembers] = useState<Member[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [roles, setRoles] = useState<{ role: Role; description: string }[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeySummary[]>([]);
  const [auditLog, setAuditLog] = useState<ActivityEntry[]>([]);
  const [myPermissions, setMyPermissions] = useState<MyPermissions | null>(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('viewer');
  const [inviteProjectAccess, setInviteProjectAccess] = useState<string[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [newKeyName, setNewKeyName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);

  const [newlyCreatedKey, setNewlyCreatedKey] = useState<{ apiKey: string; name: string } | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [addMemberUserId, setAddMemberUserId] = useState('');
  const [selectedMemberForPermissions, setSelectedMemberForPermissions] = useState<Member | null>(null);
  const [menuOverrides, setMenuOverrides] = useState<MenuPermissionRow[]>([]);
  const [menuEffective, setMenuEffective] = useState<Record<string, MenuPermissionLevel>>({});
  const [menuPermsLoading, setMenuPermsLoading] = useState(false);
  const [selectedGroupForPermissions, setSelectedGroupForPermissions] = useState<UserGroup | null>(null);
  const [groupMenuOverrides, setGroupMenuOverrides] = useState<MenuPermissionRow[]>([]);
  const [groupMenuPermsLoading, setGroupMenuPermsLoading] = useState(false);

  const load = useCallback(async () => {
    const [{ members: m, pendingInvites: pi }, { groups: g }, { roles: r }, { apiKeys: keys }, auditRes, perms] = await Promise.all([
      api.getMembers(),
      api.getGroups(),
      api.getRoles(),
      api.getApiKeys(),
      api.getUserAuditLog({ page: 1, limit: 15 }),
      api.getMyPermissions(),
    ]);
    setMembers(m);
    setPendingInvites(pi);
    setGroups(g);
    setRoles(r);
    setApiKeys(keys);
    setAuditLog(auditRes.items);
    setMyPermissions(perms);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadMenuPermissions = useCallback(async (userId: string) => {
    setMenuPermsLoading(true);
    try {
      const [{ items }, { permissions }] = await Promise.all([
        api.getMenuPermissionOverrides({ userId }),
        api.getEffectiveMenuPermissions(userId),
      ]);
      setMenuOverrides(items);
      setMenuEffective(permissions);
    } finally {
      setMenuPermsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedMemberForPermissions) void loadMenuPermissions(selectedMemberForPermissions.userId);
    else { setMenuOverrides([]); setMenuEffective({}); }
  }, [selectedMemberForPermissions, loadMenuPermissions]);

  async function handleMenuLevelChange(userId: string, menuKey: string, level: MenuPermissionLevel) {
    await api.setMenuPermission({ userId, menuKey, level });
    await loadMenuPermissions(userId);
    toast('Menu permission updated', 'success');
  }

  async function handleMenuOverrideReset(userId: string, overrideId: string) {
    await api.deleteMenuPermission(overrideId);
    await loadMenuPermissions(userId);
    toast('Reverted to role default', 'success');
  }

  const loadGroupMenuPermissions = useCallback(async (groupId: string) => {
    setGroupMenuPermsLoading(true);
    try {
      const { items } = await api.getMenuPermissionOverrides({ groupId });
      setGroupMenuOverrides(items);
    } finally {
      setGroupMenuPermsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedGroupForPermissions) void loadGroupMenuPermissions(selectedGroupForPermissions.id);
    else setGroupMenuOverrides([]);
  }, [selectedGroupForPermissions, loadGroupMenuPermissions]);

  async function handleGroupMenuLevelChange(groupId: string, menuKey: string, level: MenuPermissionLevel) {
    await api.setMenuPermission({ groupId, menuKey, level });
    await loadGroupMenuPermissions(groupId);
    toast('Group menu permission updated', 'success');
  }

  async function handleGroupMenuOverrideReset(groupId: string, overrideId: string) {
    await api.deleteMenuPermission(overrideId);
    await loadGroupMenuPermissions(groupId);
    toast('Group override removed', 'success');
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.inviteMember(inviteEmail.trim(), inviteRole);
      toast(`Invitation sent to ${inviteEmail.trim()} with role "${ENTERPRISE_ROLES.find(r => r.value === inviteRole)?.label ?? inviteRole}"${inviteProjectAccess.length > 0 ? ` and access to ${inviteProjectAccess.length} project(s)` : ''}`, 'success');
      setInviteEmail('');
      setInviteProjectAccess([]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send this invite.');
    }
  }

  async function handleRoleChange(roleGrantId: string, role: Role) {
    setError(null);
    try {
      await api.updateRoleGrant(roleGrantId, role);
      toast(`Role updated to "${ENTERPRISE_ROLES.find(r => r.value === role)?.label ?? role}"`, 'success');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this role.');
    }
  }

  async function handleRemove(roleGrantId: string) {
    if (!(await confirm('Remove this member from the organization? They will lose access to all resources.'))) return;
    setError(null);
    try {
      await api.deleteRoleGrant(roleGrantId);
      toast('Member removed from organization', 'success');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove this member.');
    }
  }

  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    setGroupError(null);
    try {
      await api.createGroup(newGroupName.trim());
      toast(`Group "${newGroupName.trim()}" created`, 'success');
      setNewGroupName('');
      await load();
    } catch (err) {
      setGroupError(err instanceof Error ? err.message : 'Could not create this group.');
    }
  }

  async function handleDeleteGroup(id: string) {
    if (!(await confirm('Delete this group?'))) return;
    setGroupError(null);
    try {
      await api.deleteGroup(id);
      toast('Group deleted', 'success');
      await load();
    } catch (err) {
      setGroupError(err instanceof Error ? err.message : 'Could not delete this group.');
    }
  }

  async function handleAddGroupMember(groupId: string) {
    if (!addMemberUserId) return;
    setGroupError(null);
    try {
      await api.addGroupMember(groupId, addMemberUserId);
      toast('Member added to group', 'success');
      setAddMemberUserId('');
      await load();
    } catch (err) {
      setGroupError(err instanceof Error ? err.message : 'Could not add this member to the group.');
    }
  }

  async function handleRemoveGroupMember(groupId: string, userId: string) {
    setGroupError(null);
    try {
      await api.removeGroupMember(groupId, userId);
      toast('Member removed from group', 'success');
      await load();
    } catch (err) {
      setGroupError(err instanceof Error ? err.message : 'Could not remove this member from the group.');
    }
  }

  async function handleCreateKey(e: React.FormEvent) {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setKeyError(null);
    try {
      const created = await api.createApiKey(newKeyName.trim());
      setNewKeyName('');
      setNewlyCreatedKey({ apiKey: created.apiKey, name: created.name });
      await load();
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : 'Could not create this API key.');
    }
  }

  async function handleRevokeKey(id: string) {
    if (!(await confirm('Revoke this API key? Any integration using it will stop working immediately.'))) return;
    setKeyError(null);
    try {
      await api.revokeApiKey(id);
      toast('API key revoked', 'success');
      await load();
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : 'Could not revoke this API key.');
    }
  }

  function memberName(userId: string): string {
    const m = members.find(x => x.userId === userId);
    return m?.fullName ?? m?.email ?? userId;
  }

  async function copyKey(key: string) {
    try { await navigator.clipboard.writeText(key); toast('API key copied to clipboard', 'success'); } catch { /* clipboard unavailable */ }
  }

  function toggleProjectAccess(projectId: string) {
    setInviteProjectAccess(prev => prev.includes(projectId) ? prev.filter(id => id !== projectId) : [...prev, projectId]);
  }

  return (
    <div>
      <FilterBar title="Users & Groups" breadcrumb={<Breadcrumb />} showAccountFilter={false} />

      <div className="flex gap-1 mb-4 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`text-sm px-3 py-2 border-b-2 -mb-px whitespace-nowrap ${tab === t ? 'border-brand-600 text-brand-600 dark:text-brand-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Users' && (
        <div className="flex flex-col gap-4">
          {/* Members Table */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300">Organization Members</h3>
              <span className="text-xs text-slate-400">{members.length} member{members.length === 1 ? '' : 's'}</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500 dark:text-slate-400">
                  <th className="py-2">Email</th><th className="py-2">Name</th><th className="py-2">MFA</th><th className="py-2">Role</th><th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.roleGrantId} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="py-2 text-slate-700 dark:text-slate-200">{m.email ?? '—'}</td>
                    <td className="py-2 text-slate-500 dark:text-slate-400">{m.fullName ?? '—'}</td>
                    <td className="py-2">{m.mfaEnabled ? <Badge tone="good">enabled</Badge> : <Badge tone="neutral">disabled</Badge>}</td>
                    <td className="py-2">
                      <select value={m.role} onChange={e => void handleRoleChange(m.roleGrantId, e.target.value as Role)} className="text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-slate-700 dark:text-slate-200">
                        {ENTERPRISE_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </td>
                    <td className="py-2 flex gap-2">
                      <button onClick={() => setSelectedMemberForPermissions(m)} className="text-xs text-brand-600 dark:text-brand-400 hover:underline">Permissions</button>
                      <button onClick={() => void handleRemove(m.roleGrantId)} className="text-xs text-red-500 hover:underline">Remove</button>
                    </td>
                  </tr>
                ))}
                {members.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-sm text-slate-400">No members yet. Invite your first team member below.</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Pending Invites */}
          {pendingInvites.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h4 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Pending Invites</h4>
              <ul className="flex flex-col gap-1">
                {pendingInvites.map(pi => (
                  <li key={pi.id} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <Badge tone="warning">pending</Badge> {pi.email} <span className="text-xs text-slate-400">({ENTERPRISE_ROLES.find(r => r.value === pi.role)?.label ?? pi.role})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Invite Form with Project Access */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Invite New Member</h3>
            <form onSubmit={handleInvite} className="flex flex-col gap-3">
              <div className="flex gap-3 items-end flex-wrap">
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Email Address</span>
                  <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} type="email" required placeholder="teammate@company.com" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white w-64" />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Role</span>
                  <select value={inviteRole} onChange={e => setInviteRole(e.target.value as Role)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm text-slate-900 dark:text-white">
                    {ENTERPRISE_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </label>
                <button type="submit" className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm px-4 py-2">Send Invitation</button>
              </div>

              {/* Role Description */}
              <div className="rounded-md bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  <strong className="text-slate-700 dark:text-slate-200">{ENTERPRISE_ROLES.find(r => r.value === inviteRole)?.label}:</strong> {ENTERPRISE_ROLES.find(r => r.value === inviteRole)?.description}
                </p>
              </div>

              {/* Project Access Selector */}
              {projects.length > 0 && (
                <div className="rounded-md border border-slate-200 dark:border-slate-700 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Project Access (Optional)</span>
                    <span className="text-xs text-slate-400">Limit access to specific projects</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {projects.map(p => (
                      <label key={p.id} className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={inviteProjectAccess.includes(p.id)}
                          onChange={() => toggleProjectAccess(p.id)}
                          className="rounded border-slate-300 dark:border-slate-600"
                        />
                        <span className="text-slate-600 dark:text-slate-300">{p.name}</span>
                      </label>
                    ))}
                  </div>
                  {inviteProjectAccess.length > 0 && (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2">
                      ✓ User will only see {inviteProjectAccess.length} selected project(s)
                    </p>
                  )}
                </div>
              )}
            </form>
            {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
          </div>
        </div>
      )}

      {tab === 'Groups' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">User Groups</h3>
          <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 mb-4">
            {groups.map(g => (
              <li key={g.id} className="py-2 text-sm">
                <div className="flex items-center justify-between">
                  <button onClick={() => setExpandedGroup(v => v === g.id ? null : g.id)} className="text-left flex-1">
                    <span className="font-medium text-slate-700 dark:text-slate-200">{g.name}</span> <span className="text-xs text-slate-400">({g.memberIds.length} members)</span>
                  </button>
                  <button onClick={() => setSelectedGroupForPermissions(g)} className="text-xs text-brand-600 dark:text-brand-400 hover:underline mr-3">Menu Access</button>
                  <button onClick={() => void handleDeleteGroup(g.id)} className="text-xs text-red-500 hover:underline">Delete</button>
                </div>
                {expandedGroup === g.id && (
                  <div className="mt-2 pl-2 border-l border-slate-200 dark:border-slate-700">
                    <ul className="flex flex-col gap-1 mb-2">
                      {g.memberIds.map(uid => (
                        <li key={uid} className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                          <span>{memberName(uid)}</span>
                          <button onClick={() => void handleRemoveGroupMember(g.id, uid)} className="text-red-500 hover:underline">Remove</button>
                        </li>
                      ))}
                      {g.memberIds.length === 0 && <li className="text-xs text-slate-400">No members in this group.</li>}
                    </ul>
                    <div className="flex gap-2">
                      <select value={addMemberUserId} onChange={e => setAddMemberUserId(e.target.value)} className="text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 flex-1">
                        <option value="">Add member…</option>
                        {members.filter(m => !g.memberIds.includes(m.userId)).map(m => <option key={m.userId} value={m.userId}>{m.email ?? m.fullName ?? m.userId}</option>)}
                      </select>
                      <button onClick={() => void handleAddGroupMember(g.id)} className="text-xs rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">Add</button>
                    </div>
                  </div>
                )}
              </li>
            ))}
            {groups.length === 0 && <li className="py-2 text-sm text-slate-400">No groups yet. Create a group to manage permissions for multiple users at once.</li>}
          </ul>
          <form onSubmit={handleCreateGroup} className="flex gap-2">
            <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="New group name (e.g. DevOps Team)" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white w-64" />
            <button type="submit" className="rounded-md border border-slate-200 dark:border-slate-700 text-sm px-3 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">Create Group</button>
          </form>
          {groupError && <p className="text-sm text-red-500 mt-2">{groupError}</p>}
        </div>
      )}

      {tab === 'Roles & Permissions' && (
        <div className="flex flex-col gap-4">
          {/* Role Definitions */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Enterprise Role Definitions</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {ENTERPRISE_ROLES.map(r => (
                <div key={r.value} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{r.label}</span>
                    <Badge tone={r.level === 'org' ? 'good' : 'neutral'}>{r.level}</Badge>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{r.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(ROLE_PERMISSIONS[r.value] ?? []).slice(0, 5).map(p => (
                      <span key={p} className="text-[10px] rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-slate-500 dark:text-slate-400">{p}</span>
                    ))}
                    {(ROLE_PERMISSIONS[r.value] ?? []).length > 5 && (
                      <span className="text-[10px] text-slate-400">+{(ROLE_PERMISSIONS[r.value] ?? []).length - 5} more</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Permission Matrix */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 overflow-x-auto">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Permission Matrix</h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className="py-2 text-left text-slate-500 dark:text-slate-400 sticky left-0 bg-white dark:bg-slate-900">Permission</th>
                  {ENTERPRISE_ROLES.map(r => (
                    <th key={r.value} className="py-2 text-center text-slate-500 dark:text-slate-400 px-2" title={r.description}>{r.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERMISSION_ACTIONS.map(action => (
                  <tr key={action.key} className="border-b border-slate-100 dark:border-slate-800/60">
                    <td className="py-2 text-left text-slate-700 dark:text-slate-200 sticky left-0 bg-white dark:bg-slate-900" title={action.description}>
                      <span className="font-medium">{action.label}</span>
                    </td>
                    {ENTERPRISE_ROLES.map(r => {
                      const hasPermission = (ROLE_PERMISSIONS[r.value] ?? []).includes(action.key);
                      return (
                        <td key={r.value} className="py-2 text-center">
                          {hasPermission ? (
                            <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">✓</span>
                          ) : (
                            <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Your Permissions */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Your Current Permissions</h3>
            {myPermissions ? (
              <div className="flex flex-col gap-3">
                <div>
                  <span className="text-xs text-slate-400 block mb-1">Your role in this organization</span>
                  <Badge tone="neutral">{ENTERPRISE_ROLES.find(r => r.value === myPermissions.role)?.label ?? myPermissions.role.replace(/_/g, ' ')}</Badge>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300">{myPermissions.description}</p>
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-xs text-slate-400 block mb-2">Granted permissions ({(ROLE_PERMISSIONS[myPermissions.role] ?? []).length} total)</span>
                  <div className="flex flex-wrap gap-1.5">
                    {(ROLE_PERMISSIONS[myPermissions.role] ?? []).map(p => (
                      <span key={p} className="text-xs rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-1 text-slate-600 dark:text-slate-300">{PERMISSION_ACTIONS.find(a => a.key === p)?.label ?? p}</span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Loading permissions…</p>
            )}
          </div>
        </div>
      )}

      {tab === 'Project Access' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Project-Level Access Control</h3>
          <p className="text-xs text-slate-400 mb-4">Manage which projects each user can access. Users without project access will only see projects explicitly assigned to them.</p>
          {projects.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">No projects created yet. Create projects under Organization Management to enable project-level access control.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500 dark:text-slate-400">
                  <th className="py-2">Member</th>
                  <th className="py-2">Role</th>
                  {projects.map(p => <th key={p.id} className="py-2 text-center text-xs">{p.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.roleGrantId} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                    <td className="py-2 text-slate-700 dark:text-slate-200">{m.email ?? m.fullName ?? '—'}</td>
                    <td className="py-2"><Badge tone="neutral">{ENTERPRISE_ROLES.find(r => r.value === m.role)?.label ?? m.role}</Badge></td>
                    {projects.map(p => (
                      <td key={p.id} className="py-2 text-center">
                        {(m.role === 'owner' || m.role === 'admin') ? (
                          <span className="text-emerald-600 dark:text-emerald-400" title="Full access (org-level role)">✓</span>
                        ) : (
                          <input type="checkbox" defaultChecked={false} className="rounded border-slate-300 dark:border-slate-600" title={`Grant access to ${p.name}`} />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
                {members.length === 0 && <tr><td colSpan={projects.length + 2} className="py-4 text-center text-sm text-slate-400">No members yet.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'API Keys' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">API Keys</h3>
          <table className="w-full text-sm mb-4">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500 dark:text-slate-400">
                <th className="py-2">Name</th><th className="py-2">Prefix</th><th className="py-2">Created</th><th className="py-2">Status</th><th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {apiKeys.map(k => (
                <tr key={k.id} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                  <td className="py-2 text-slate-700 dark:text-slate-200">{k.name}</td>
                  <td className="py-2 font-mono text-xs text-slate-500 dark:text-slate-400">{k.key_prefix}…</td>
                  <td className="py-2 text-slate-500 dark:text-slate-400">{new Date(k.created_at).toLocaleDateString()}</td>
                  <td className="py-2">{k.revoked_at ? <Badge tone="neutral">revoked</Badge> : <Badge tone="good">active</Badge>}</td>
                  <td className="py-2">
                    {!k.revoked_at && <button onClick={() => void handleRevokeKey(k.id)} className="text-xs text-red-500 hover:underline">Revoke</button>}
                  </td>
                </tr>
              ))}
              {apiKeys.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-sm text-slate-400">No API keys yet. Create one for CI/CD pipelines or integrations.</td></tr>}
            </tbody>
          </table>
          <form onSubmit={handleCreateKey} className="flex gap-2">
            <input value={newKeyName} onChange={e => setNewKeyName(e.target.value)} placeholder="Key name (e.g. CI pipeline)" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white w-64" />
            <button type="submit" className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm px-3 py-1.5">Create Key</button>
          </form>
          {keyError && <p className="text-sm text-red-500 mt-2">{keyError}</p>}
        </div>
      )}

      {tab === 'Audit Logs' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Audit Logs</h3>
          <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
            {auditLog.map(entry => (
              <li key={entry.id} className="py-2 text-sm flex justify-between gap-3">
                <span className="text-slate-700 dark:text-slate-200">{entry.action.replace(/_/g, ' ').replace(/\./g, ' — ')} <span className="text-slate-400">by {entry.actor?.email ?? 'system'}</span></span>
                <span className="text-xs text-slate-400 shrink-0">{new Date(entry.occurredAt).toLocaleString()}</span>
              </li>
            ))}
            {auditLog.length === 0 && <li className="py-2 text-sm text-slate-400">No activity recorded yet.</li>}
          </ul>
        </div>
      )}

      {/* Member Permissions Modal */}
      {selectedMemberForPermissions && (
        <Modal open={!!selectedMemberForPermissions} onClose={() => setSelectedMemberForPermissions(null)} title={`Permissions — ${selectedMemberForPermissions.email ?? selectedMemberForPermissions.fullName ?? 'Member'}`}>
          <div className="flex flex-col gap-4">
            <div>
              <span className="text-xs text-slate-400 block mb-1">Current Role</span>
              <Badge tone="neutral">{ENTERPRISE_ROLES.find(r => r.value === selectedMemberForPermissions.role)?.label ?? selectedMemberForPermissions.role}</Badge>
            </div>
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
              <span className="text-xs text-slate-400 block mb-2">Granted Permissions ({(ROLE_PERMISSIONS[selectedMemberForPermissions.role] ?? []).length} total)</span>
              <div className="grid grid-cols-2 gap-2">
                {PERMISSION_ACTIONS.map(action => {
                  const hasPermission = (ROLE_PERMISSIONS[selectedMemberForPermissions.role] ?? []).includes(action.key);
                  return (
                    <div key={action.key} className="flex items-center gap-2 text-xs">
                      <span className={`inline-flex items-center justify-center h-4 w-4 rounded-full ${hasPermission ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600'}`}>
                        {hasPermission ? '✓' : '—'}
                      </span>
                      <span className="text-slate-600 dark:text-slate-300">{action.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
              <span className="text-xs text-slate-400 block mb-2">
                Menu Access — overrides {selectedMemberForPermissions.email ?? 'this user'}'s access to a specific menu, independent of their role. Menus with no override use the role default shown by their current role above.
              </span>
              {menuPermsLoading ? (
                <p className="text-xs text-slate-400">Loading…</p>
              ) : (
                <div className="max-h-64 overflow-y-auto flex flex-col gap-1.5">
                  {NAV_MODULES.map((mod) => {
                    const override = menuOverrides.find((o) => o.menu_key === mod.icon);
                    const level = menuEffective[mod.icon] ?? 'read';
                    return (
                      <div key={mod.icon} className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-slate-600 dark:text-slate-300 truncate">{mod.label}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {override && (
                            <button
                              onClick={() => void handleMenuOverrideReset(selectedMemberForPermissions.userId, override.id)}
                              title="Revert to role default"
                              className="text-[10px] text-slate-400 hover:text-brand-600 dark:hover:text-brand-400"
                            >
                              reset
                            </button>
                          )}
                          <select
                            value={level}
                            onChange={(e) => void handleMenuLevelChange(selectedMemberForPermissions.userId, mod.icon, e.target.value as MenuPermissionLevel)}
                            className={`rounded-md border px-1.5 py-1 text-[11px] ${override ? 'border-brand-300 dark:border-brand-700 text-brand-700 dark:text-brand-300' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'} bg-white dark:bg-slate-800`}
                          >
                            {MENU_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {projects.length > 0 && (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                <span className="text-xs text-slate-400 block mb-2">Project Access</span>
                <div className="flex flex-wrap gap-2">
                  {projects.map(p => (
                    <label key={p.id} className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input type="checkbox" defaultChecked={selectedMemberForPermissions.role === 'owner' || selectedMemberForPermissions.role === 'admin'} className="rounded border-slate-300 dark:border-slate-600" />
                      <span className="text-slate-600 dark:text-slate-300">{p.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Group Permissions Modal */}
      {selectedGroupForPermissions && (
        <Modal open={!!selectedGroupForPermissions} onClose={() => setSelectedGroupForPermissions(null)} title={`Menu Access — ${selectedGroupForPermissions.name}`}>
          <div className="flex flex-col gap-3">
            <p className="text-xs text-slate-400">
              Grants set here apply to every member of this group, unless a member has their own individual override (which always wins). When a member belongs to more than one group, the most permissive grant across their groups applies.
            </p>
            {groupMenuPermsLoading ? (
              <p className="text-xs text-slate-400">Loading…</p>
            ) : (
              <div className="max-h-72 overflow-y-auto flex flex-col gap-1.5">
                {NAV_MODULES.map((mod) => {
                  const override = groupMenuOverrides.find((o) => o.menu_key === mod.icon);
                  return (
                    <div key={mod.icon} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-600 dark:text-slate-300 truncate">{mod.label}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {override && (
                          <button
                            onClick={() => void handleGroupMenuOverrideReset(selectedGroupForPermissions.id, override.id)}
                            title="Remove this group grant"
                            className="text-[10px] text-slate-400 hover:text-brand-600 dark:hover:text-brand-400"
                          >
                            reset
                          </button>
                        )}
                        <select
                          value={override?.level ?? ''}
                          onChange={(e) => void handleGroupMenuLevelChange(selectedGroupForPermissions.id, mod.icon, e.target.value as MenuPermissionLevel)}
                          className={`rounded-md border px-1.5 py-1 text-[11px] ${override ? 'border-brand-300 dark:border-brand-700 text-brand-700 dark:text-brand-300' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'} bg-white dark:bg-slate-800`}
                        >
                          <option value="" disabled>No grant set — choose a level to add one</option>
                          {MENU_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Modal>
      )}

      <Modal open={!!newlyCreatedKey} onClose={() => setNewlyCreatedKey(null)} title="API Key Created">
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
          Copy this key now — <strong>"{newlyCreatedKey?.name}"</strong>'s secret won't be shown again.
        </p>
        <pre className="rounded-md bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs text-slate-800 dark:text-slate-100 overflow-x-auto whitespace-pre-wrap break-all mb-3">{newlyCreatedKey?.apiKey}</pre>
        <div className="flex justify-end gap-2">
          <button onClick={() => newlyCreatedKey && void copyKey(newlyCreatedKey.apiKey)} className="text-sm rounded-md border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">Copy</button>
          <button onClick={() => setNewlyCreatedKey(null)} className="text-sm rounded-md bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5">Done</button>
        </div>
      </Modal>
      {confirmDialog}
    </div>
  );
}