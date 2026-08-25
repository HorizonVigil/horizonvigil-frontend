import { useEffect, useState, useCallback } from 'react';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { useConfirm } from '../components/ConfirmDialog';
import { useTabParam } from '../lib/useTabParam';
import { useSubmenuAccess } from '../lib/useCanSeeSubmenu';
import { useToast } from '../lib/toast';
import { useAuth } from '../lib/auth';
import { api, type Member, type PendingInvite, type UserGroup, type Role, type ApiKeySummary, type ActivityEntry, type MenuPermissionRow, type MenuPermissionLevel, type ResourceGrantRow, type AbacPolicyRow, type AbacCondition, type AbacTestResult, type ScimTokenSummary } from '../lib/api';
import { fetchAllPages } from '../lib/fetchAllPages';
import { MenuAccessTree } from '../components/MenuAccessTree';

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

const TABS = ['Users', 'Groups', 'Roles & Permissions', 'Project Access', 'API Keys', 'ABAC Policies', 'SCIM Provisioning', 'Audit Logs'] as const;
type Tab = typeof TABS[number];

const ABAC_OPERATORS: { value: AbacCondition['operator']; label: string }[] = [
  { value: 'eq', label: 'equals' }, { value: 'neq', label: 'does not equal' },
  { value: 'in', label: 'is one of (comma-separated)' }, { value: 'not_in', label: 'is not one of (comma-separated)' },
  { value: 'contains', label: 'contains' },
];

export function UsersGroups() {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { toast } = useToast();
  const { user } = useAuth();
  const canSeeTab = useSubmenuAccess('users');
  const visibleTabs = TABS.filter(canSeeTab);
  const [tab, setTab] = useTabParam<Tab>(TABS, 'Users');
  useEffect(() => {
    if (!canSeeTab(tab) && visibleTabs.length > 0) setTab(visibleTabs[0]);
  }, [tab, canSeeTab, visibleTabs, setTab]);
  const [members, setMembers] = useState<Member[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [roles, setRoles] = useState<{ role: Role; description: string }[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeySummary[]>([]);
  const [abacPolicies, setAbacPolicies] = useState<AbacPolicyRow[]>([]);
  const [scimTokens, setScimTokens] = useState<ScimTokenSummary[]>([]);
  const [auditLog, setAuditLog] = useState<ActivityEntry[]>([]);
  const [myPermissions, setMyPermissions] = useState<MyPermissions | null>(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('viewer');
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
  const [connections, setConnections] = useState<{ id: string; label: string }[]>([]);
  const [resourceGrants, setResourceGrants] = useState<ResourceGrantRow[]>([]);
  const [resourceRestricted, setResourceRestricted] = useState(false);
  const [resourcePermsLoading, setResourcePermsLoading] = useState(false);
  const [addGrantConnectionId, setAddGrantConnectionId] = useState('');

  // ABAC — Policies tab
  const [newPolicyName, setNewPolicyName] = useState('');
  const [newPolicyEffect, setNewPolicyEffect] = useState<'allow' | 'deny'>('deny');
  const [newPolicyMenuKey, setNewPolicyMenuKey] = useState('cloud');
  const [newPolicySubject, setNewPolicySubject] = useState<'user' | 'resource'>('resource');
  const [newPolicyAttrKey, setNewPolicyAttrKey] = useState('environment');
  const [newPolicyOperator, setNewPolicyOperator] = useState<AbacCondition['operator']>('eq');
  const [newPolicyValue, setNewPolicyValue] = useState('');
  const [abacError, setAbacError] = useState<string | null>(null);
  const [testUserId, setTestUserId] = useState('');
  const [testMenuKey, setTestMenuKey] = useState('cloud');
  const [testAttrKey, setTestAttrKey] = useState('environment');
  const [testAttrValue, setTestAttrValue] = useState('');
  const [testResult, setTestResult] = useState<AbacTestResult | null>(null);
  const [testRunning, setTestRunning] = useState(false);

  // SCIM — Provisioning tab
  const [newScimTokenName, setNewScimTokenName] = useState('');
  const [scimError, setScimError] = useState<string | null>(null);
  const [newlyCreatedScimToken, setNewlyCreatedScimToken] = useState<{ token: string; name: string } | null>(null);

  // Member Permissions modal — ABAC attribute bag, a simple flat string-value
  // key/value editor (matching the doc's own "department == Finance"-style
  // examples) rather than a typed JSON editor -- ABAC conditions compare
  // against plain strings, so that's what's worth making easy to edit here.
  const [attributeRows, setAttributeRows] = useState<{ key: string; value: string }[]>([]);
  const [attributesDirty, setAttributesDirty] = useState(false);
  const [savingAttributes, setSavingAttributes] = useState(false);

  const load = useCallback(async () => {
    const [{ members: m, pendingInvites: pi }, { groups: g }, { roles: r }, { apiKeys: keys }, { items: abac }, { items: scim }, auditRes, perms] = await Promise.all([
      api.getMembers(),
      api.getGroups(),
      api.getRoles(),
      api.getApiKeys(),
      api.getAbacPolicies(),
      api.getScimTokens(),
      api.getUserAuditLog({ page: 1, limit: 15 }),
      api.getMyPermissions(),
    ]);
    setMembers(m);
    setPendingInvites(pi);
    setGroups(g);
    setRoles(r);
    setApiKeys(keys);
    setAbacPolicies(abac);
    setScimTokens(scim);
    setAuditLog(auditRes.items);
    setMyPermissions(perms);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Every connected account across all three clouds, paginated to
  // completion (not a single limit:1000 fetch, which silently clamped to
  // the server's 200-per-request cap and also never included Azure at
  // all) -- scoping a user/role/resource grant to an account past #200 or
  // to any Azure subscription was previously impossible from this picker.
  useEffect(() => {
    void Promise.all([
      fetchAllPages((page, limit) => api.getAccounts({ page, limit })),
      fetchAllPages((page, limit) => api.getGcpAccounts({ page, limit })),
      fetchAllPages((page, limit) => api.getAzureAccounts({ page, limit })),
    ]).then(([aws, gcp, azure]) => {
      setConnections([
        ...aws.map((c) => ({ id: c.id, label: `${c.connection_name ?? c.aws_account_id} (AWS)` })),
        ...gcp.map((c) => ({ id: c.id, label: `${c.connection_name ?? c.gcp_project_id} (GCP)` })),
        ...azure.map((c) => ({ id: c.id, label: `${c.connection_name ?? c.azure_subscription_id} (Azure)` })),
      ]);
    });
  }, []);

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

  const loadResourceGrants = useCallback(async (userId: string) => {
    setResourcePermsLoading(true);
    try {
      const [{ items }, { restricted }] = await Promise.all([
        api.getResourceGrants(userId),
        api.getEffectiveResourceGrants(userId),
      ]);
      setResourceGrants(items);
      setResourceRestricted(restricted);
    } finally {
      setResourcePermsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedMemberForPermissions) void loadResourceGrants(selectedMemberForPermissions.userId);
    else { setResourceGrants([]); setResourceRestricted(false); setAddGrantConnectionId(''); }
  }, [selectedMemberForPermissions, loadResourceGrants]);

  useEffect(() => {
    setAttributeRows(selectedMemberForPermissions ? Object.entries(selectedMemberForPermissions.attributes).map(([key, value]) => ({ key, value: String(value) })) : []);
    setAttributesDirty(false);
  }, [selectedMemberForPermissions]);

  function addAttributeRow() { setAttributeRows(prev => [...prev, { key: '', value: '' }]); setAttributesDirty(true); }
  function updateAttributeRow(i: number, field: 'key' | 'value', value: string) {
    setAttributeRows(prev => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
    setAttributesDirty(true);
  }
  function removeAttributeRow(i: number) { setAttributeRows(prev => prev.filter((_, idx) => idx !== i)); setAttributesDirty(true); }

  async function handleSaveAttributes(userId: string) {
    setSavingAttributes(true);
    try {
      const attributes = Object.fromEntries(attributeRows.filter(r => r.key.trim()).map(r => [r.key.trim(), r.value]));
      await api.updateMemberAttributes(userId, attributes);
      toast('Attributes updated', 'success');
      setAttributesDirty(false);
      await load();
      setSelectedMemberForPermissions(prev => (prev ? { ...prev, attributes } : prev));
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save attributes.', 'error');
    } finally {
      setSavingAttributes(false);
    }
  }

  async function handleAddResourceGrant(userId: string) {
    if (!addGrantConnectionId) return;
    await api.setResourceGrant(userId, addGrantConnectionId);
    setAddGrantConnectionId('');
    await loadResourceGrants(userId);
    toast('Resource access granted', 'success');
  }

  async function handleRemoveResourceGrant(userId: string, grantId: string) {
    await api.deleteResourceGrant(grantId);
    await loadResourceGrants(userId);
    toast('Resource access revoked', 'success');
  }

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
      const result = await api.inviteMember(inviteEmail.trim(), inviteRole);
      const roleLabel = ENTERPRISE_ROLES.find(r => r.value === inviteRole)?.label ?? inviteRole;
      toast(
        result.emailSent
          ? `Invitation emailed to ${inviteEmail.trim()} with role "${roleLabel}".`
          : `Invitation created for ${inviteEmail.trim()} with role "${roleLabel}", but the invite email couldn't be sent (email delivery isn't configured in this environment yet) — share the accept link with them directly for now.`,
        result.emailSent ? 'success' : 'info',
      );
      setInviteEmail('');
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
      // Also toasted, not just set into `error` -- that state only renders
      // far down the page inside the Invite New Member card, nowhere near
      // the members table this action was actually taken from (e.g. the
      // last-owner guard's "Cannot change the role of the last owner"
      // rejection was previously invisible unless you happened to scroll
      // all the way down after the dropdown silently reverted).
      const message = err instanceof Error ? err.message : 'Could not update this role.';
      setError(message);
      toast(message, 'error');
    }
  }

  async function handleTransferOwnership(targetUserId: string, targetLabel: string) {
    if (!(await confirm(`Transfer ownership to ${targetLabel}? You'll be moved to Organization Admin and lose the ability to undo this yourself — only they could transfer it back.`))) return;
    setError(null);
    try {
      await api.transferOwnership(targetUserId);
      toast(`Ownership transferred to ${targetLabel}.`, 'success');
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not transfer ownership.';
      setError(message);
      toast(message, 'error');
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
      const message = err instanceof Error ? err.message : 'Could not remove this member.';
      setError(message);
      toast(message, 'error');
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

  function buildConditionValue(): unknown {
    if (newPolicyOperator === 'in' || newPolicyOperator === 'not_in') return newPolicyValue.split(',').map(v => v.trim()).filter(Boolean);
    return newPolicyValue;
  }

  async function handleCreateAbacPolicy(e: React.FormEvent) {
    e.preventDefault();
    if (!newPolicyName.trim() || !newPolicyAttrKey.trim() || !newPolicyValue.trim()) return;
    setAbacError(null);
    try {
      const condition: AbacCondition = { attribute: `${newPolicySubject}.${newPolicyAttrKey.trim()}`, operator: newPolicyOperator, value: buildConditionValue() };
      await api.createAbacPolicy({ name: newPolicyName.trim(), effect: newPolicyEffect, menuKey: newPolicyMenuKey, conditions: [condition] });
      toast(`Policy "${newPolicyName.trim()}" created`, 'success');
      setNewPolicyName(''); setNewPolicyValue('');
      await load();
    } catch (err) {
      setAbacError(err instanceof Error ? err.message : 'Could not create this policy.');
    }
  }

  async function handleTogglePolicyEnabled(policy: AbacPolicyRow) {
    setAbacError(null);
    try {
      await api.updateAbacPolicy(policy.id, { enabled: !policy.enabled });
      toast(policy.enabled ? 'Policy disabled' : 'Policy enabled', 'success');
      await load();
    } catch (err) {
      setAbacError(err instanceof Error ? err.message : 'Could not update this policy.');
    }
  }

  async function handleDeleteAbacPolicy(id: string, name: string) {
    if (!(await confirm(`Delete the policy "${name}"?`))) return;
    setAbacError(null);
    try {
      await api.deleteAbacPolicy(id);
      toast('Policy deleted', 'success');
      await load();
    } catch (err) {
      setAbacError(err instanceof Error ? err.message : 'Could not delete this policy.');
    }
  }

  async function handleRunAbacTest(e: React.FormEvent) {
    e.preventDefault();
    if (!testUserId) return;
    setTestRunning(true);
    setTestResult(null);
    try {
      const resourceAttributes = testAttrKey.trim() ? { [testAttrKey.trim()]: testAttrValue } : {};
      const result = await api.testAbacPolicy({ userId: testUserId, menuKey: testMenuKey, resourceAttributes });
      setTestResult(result);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not run this test.', 'error');
    } finally {
      setTestRunning(false);
    }
  }

  async function handleCreateScimToken(e: React.FormEvent) {
    e.preventDefault();
    if (!newScimTokenName.trim()) return;
    setScimError(null);
    try {
      const created = await api.createScimToken(newScimTokenName.trim());
      setNewScimTokenName('');
      setNewlyCreatedScimToken({ token: created.token, name: created.name });
      await load();
    } catch (err) {
      setScimError(err instanceof Error ? err.message : 'Could not create this SCIM token.');
    }
  }

  async function handleRevokeScimToken(id: string) {
    if (!(await confirm('Revoke this SCIM token? Your identity provider will immediately be unable to provision or deprovision users through it.'))) return;
    setScimError(null);
    try {
      await api.revokeScimToken(id);
      toast('SCIM token revoked', 'success');
      await load();
    } catch (err) {
      setScimError(err instanceof Error ? err.message : 'Could not revoke this token.');
    }
  }

  function memberName(userId: string): string {
    const m = members.find(x => x.userId === userId);
    return m?.fullName ?? m?.email ?? userId;
  }

  async function copyKey(key: string) {
    try { await navigator.clipboard.writeText(key); toast('API key copied to clipboard', 'success'); } catch { /* clipboard unavailable */ }
  }


  return (
    <div>
      <FilterBar title="Users & Groups" breadcrumb={<Breadcrumb />} showAccountFilter={false} showRegionFilter={false} showDateFilter={false} />

      <div className="flex gap-1 mb-4 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
        {visibleTabs.map(t => (
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
                      {myPermissions?.role === 'owner' && m.userId !== user?.id && (
                        <button onClick={() => void handleTransferOwnership(m.userId, m.email ?? m.fullName ?? 'this member')} className="text-xs text-amber-600 dark:text-amber-400 hover:underline">Make owner</button>
                      )}
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
            </form>
            <p className="text-xs text-slate-400 mt-2">
              Need to restrict which cloud accounts this person can see? Set that up for them after they join, from their row in the table above.
            </p>
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
          <p className="text-sm text-slate-400 py-6 text-center max-w-md mx-auto">
            Project-level access control isn't available yet — access today is scoped by cloud account (connection), not by project. Open a member's row on the Users tab to grant or revoke their access to specific connections.
          </p>
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

      {tab === 'ABAC Policies' && (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Attribute-Based Policies</h3>
            <p className="text-xs text-slate-400 mb-3">Layered on top of roles — a policy only fires when its condition matches; everything else falls through to ordinary role-based access unchanged.</p>
            <table className="w-full text-sm mb-4">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500 dark:text-slate-400">
                  <th className="py-2">Name</th><th className="py-2">Effect</th><th className="py-2">Menu</th><th className="py-2">Condition</th><th className="py-2">Status</th><th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {abacPolicies.map(p => (
                  <tr key={p.id} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                    <td className="py-2 text-slate-700 dark:text-slate-200">{p.name}</td>
                    <td className="py-2"><Badge tone={p.effect === 'deny' ? 'critical' : 'good'}>{p.effect}</Badge></td>
                    <td className="py-2 text-slate-500 dark:text-slate-400">{p.menu_key ?? 'any'}</td>
                    <td className="py-2 font-mono text-xs text-slate-500 dark:text-slate-400">
                      {p.conditions.map((c, i) => <span key={i}>{i > 0 && ' AND '}{c.attribute} {c.operator} {JSON.stringify(c.value)}</span>)}
                    </td>
                    <td className="py-2">
                      <button onClick={() => void handleTogglePolicyEnabled(p)} className="cursor-pointer">
                        <Badge tone={p.enabled ? 'good' : 'neutral'}>{p.enabled ? 'enabled' : 'disabled'}</Badge>
                      </button>
                    </td>
                    <td className="py-2">
                      <button onClick={() => void handleDeleteAbacPolicy(p.id, p.name)} className="text-xs text-red-500 hover:underline">Delete</button>
                    </td>
                  </tr>
                ))}
                {abacPolicies.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-sm text-slate-400">No ABAC policies yet — access is governed by roles alone.</td></tr>}
              </tbody>
            </table>
            <form onSubmit={handleCreateAbacPolicy} className="flex flex-col gap-2">
              <div className="flex gap-2 flex-wrap items-center">
                <input value={newPolicyName} onChange={e => setNewPolicyName(e.target.value)} placeholder="Policy name" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white w-48" />
                <select value={newPolicyEffect} onChange={e => setNewPolicyEffect(e.target.value as 'allow' | 'deny')} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white">
                  <option value="deny">Deny</option>
                  <option value="allow">Allow</option>
                </select>
                <input value={newPolicyMenuKey} onChange={e => setNewPolicyMenuKey(e.target.value)} placeholder="Menu key (e.g. cloud)" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white w-36" />
              </div>
              <div className="flex gap-2 flex-wrap items-center">
                <span className="text-xs text-slate-400">when</span>
                <select value={newPolicySubject} onChange={e => setNewPolicySubject(e.target.value as 'user' | 'resource')} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white">
                  <option value="resource">resource.</option>
                  <option value="user">user.</option>
                </select>
                <input value={newPolicyAttrKey} onChange={e => setNewPolicyAttrKey(e.target.value)} placeholder="attribute key (e.g. environment)" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white w-52" />
                <select value={newPolicyOperator} onChange={e => setNewPolicyOperator(e.target.value as AbacCondition['operator'])} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white">
                  {ABAC_OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <input value={newPolicyValue} onChange={e => setNewPolicyValue(e.target.value)} placeholder="value" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white w-40" />
                <button type="submit" className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm px-3 py-1.5">Create Policy</button>
              </div>
            </form>
            {abacError && <p className="text-sm text-red-500 mt-2">{abacError}</p>}
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Test a Policy</h3>
            <p className="text-xs text-slate-400 mb-3">Dry-run only — never touches real access. Shows exactly what the policy engine would decide for a given user, menu, and resource attribute.</p>
            <form onSubmit={handleRunAbacTest} className="flex gap-2 flex-wrap items-center">
              <select value={testUserId} onChange={e => setTestUserId(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white w-52">
                <option value="">Select a member…</option>
                {members.map(m => <option key={m.userId} value={m.userId}>{m.email ?? m.fullName ?? m.userId}</option>)}
              </select>
              <input value={testMenuKey} onChange={e => setTestMenuKey(e.target.value)} placeholder="Menu key" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white w-32" />
              <span className="text-xs text-slate-400">resource.</span>
              <input value={testAttrKey} onChange={e => setTestAttrKey(e.target.value)} placeholder="attribute key" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white w-36" />
              <input value={testAttrValue} onChange={e => setTestAttrValue(e.target.value)} placeholder="value" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white w-32" />
              <button type="submit" disabled={testRunning || !testUserId} className="rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm px-3 py-1.5">{testRunning ? 'Running…' : 'Run Test'}</button>
            </form>
            {testResult && (
              <div className="mt-3">
                {testResult.result === 'not_applicable' ? (
                  <Badge tone="neutral">not_applicable — no policy matched, RBAC decides as normal</Badge>
                ) : (
                  <Badge tone={testResult.result === 'deny' ? 'critical' : 'good'}>{testResult.result} — matched "{testResult.matchedPolicyName}"</Badge>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'SCIM Provisioning' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">SCIM 2.0 Provisioning</h3>
          <p className="text-xs text-slate-400 mb-3">
            Issue a bearer token here and paste it into your identity provider's SCIM app config (Okta, Entra ID, ...) along with the base URL below — the IdP then provisions and deprovisions users directly, no manual invites needed.
          </p>
          <div className="rounded-md bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 px-3 py-2 mb-4 text-xs">
            <span className="text-slate-400 block mb-0.5">SCIM base URL</span>
            <code className="text-slate-700 dark:text-slate-200">{import.meta.env.VITE_USERS_API_URL || '(not configured in this environment)'}/scim/v2</code>
          </div>
          <table className="w-full text-sm mb-4">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500 dark:text-slate-400">
                <th className="py-2">Name</th><th className="py-2">Created</th><th className="py-2">Last Used</th><th className="py-2">Status</th><th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {scimTokens.map(t => (
                <tr key={t.id} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                  <td className="py-2 text-slate-700 dark:text-slate-200">{t.name}</td>
                  <td className="py-2 text-slate-500 dark:text-slate-400">{new Date(t.created_at).toLocaleDateString()}</td>
                  <td className="py-2 text-slate-500 dark:text-slate-400">{t.last_used_at ? new Date(t.last_used_at).toLocaleDateString() : 'Never'}</td>
                  <td className="py-2">{t.revoked_at ? <Badge tone="neutral">revoked</Badge> : <Badge tone="good">active</Badge>}</td>
                  <td className="py-2">
                    {!t.revoked_at && <button onClick={() => void handleRevokeScimToken(t.id)} className="text-xs text-red-500 hover:underline">Revoke</button>}
                  </td>
                </tr>
              ))}
              {scimTokens.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-sm text-slate-400">No SCIM tokens yet. Create one to connect an identity provider.</td></tr>}
            </tbody>
          </table>
          <form onSubmit={handleCreateScimToken} className="flex gap-2">
            <input value={newScimTokenName} onChange={e => setNewScimTokenName(e.target.value)} placeholder="Token name (e.g. Okta)" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white w-64" />
            <button type="submit" className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm px-3 py-1.5">Create Token</button>
          </form>
          {scimError && <p className="text-sm text-red-500 mt-2">{scimError}</p>}
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
                <MenuAccessTree
                  overrides={menuOverrides}
                  effective={menuEffective}
                  onLevelChange={(menuKey, level) => void handleMenuLevelChange(selectedMemberForPermissions.userId, menuKey, level)}
                  onReset={(_menuKey, overrideId) => void handleMenuOverrideReset(selectedMemberForPermissions.userId, overrideId)}
                />
              )}
            </div>
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
              <span className="text-xs text-slate-400 block mb-2">
                Resource Access — restricts {selectedMemberForPermissions.email ?? 'this user'} to specific AWS accounts / GCP projects instead of every connection in the org. With no grants (the default), they see everything.
              </span>
              {resourcePermsLoading ? (
                <p className="text-xs text-slate-400">Loading…</p>
              ) : (
                <>
                  <div className="mb-2">
                    <Badge tone={resourceRestricted ? 'warning' : 'neutral'}>{resourceRestricted ? 'Restricted' : 'Unrestricted — sees all connections'}</Badge>
                  </div>
                  {resourceGrants.length > 0 && (
                    <div className="max-h-40 overflow-y-auto flex flex-col gap-1.5 mb-2">
                      {resourceGrants.map((g) => (
                        <div key={g.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-slate-600 dark:text-slate-300 truncate">{connections.find((c) => c.id === g.connection_id)?.label ?? g.connection_id}</span>
                          <button
                            onClick={() => void handleRemoveResourceGrant(selectedMemberForPermissions.userId, g.id)}
                            className="text-[10px] text-slate-400 hover:text-red-600 dark:hover:text-red-400 shrink-0"
                          >
                            revoke
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <select
                      value={addGrantConnectionId}
                      onChange={(e) => setAddGrantConnectionId(e.target.value)}
                      className="flex-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-1.5 py-1 text-[11px] text-slate-600 dark:text-slate-300"
                    >
                      <option value="">Grant access to…</option>
                      {connections.filter((c) => !resourceGrants.some((g) => g.connection_id === c.id)).map((c) => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => void handleAddResourceGrant(selectedMemberForPermissions.userId)}
                      disabled={!addGrantConnectionId}
                      className="text-[11px] rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1 text-slate-600 dark:text-slate-300 disabled:opacity-40"
                    >
                      Add
                    </button>
                  </div>
                </>
              )}
            </div>
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
              <span className="text-xs text-slate-400 block mb-2">
                ABAC Attributes — what an attribute-based policy's <code className="text-[10px]">user.&lt;key&gt;</code> conditions read for {selectedMemberForPermissions.email ?? 'this user'} (see the ABAC Policies tab). Plain key/value pairs, e.g. <code className="text-[10px]">department = Finance</code>.
              </span>
              <div className="flex flex-col gap-1.5 mb-2">
                {attributeRows.map((row, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input value={row.key} onChange={e => updateAttributeRow(i, 'key', e.target.value)} placeholder="key" className="w-1/3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-1.5 py-1 text-[11px] text-slate-600 dark:text-slate-300" />
                    <input value={row.value} onChange={e => updateAttributeRow(i, 'value', e.target.value)} placeholder="value" className="flex-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-1.5 py-1 text-[11px] text-slate-600 dark:text-slate-300" />
                    <button onClick={() => removeAttributeRow(i)} className="text-[10px] text-slate-400 hover:text-red-600 dark:hover:text-red-400 shrink-0">remove</button>
                  </div>
                ))}
                {attributeRows.length === 0 && <p className="text-xs text-slate-400">No attributes set.</p>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={addAttributeRow} className="text-[11px] rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1 text-slate-600 dark:text-slate-300">+ Add attribute</button>
                {attributesDirty && (
                  <button onClick={() => void handleSaveAttributes(selectedMemberForPermissions.userId)} disabled={savingAttributes} className="text-[11px] rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-2 py-1">
                    {savingAttributes ? 'Saving…' : 'Save attributes'}
                  </button>
                )}
              </div>
            </div>
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
              <MenuAccessTree
                overrides={groupMenuOverrides}
                onLevelChange={(menuKey, level) => void handleGroupMenuLevelChange(selectedGroupForPermissions.id, menuKey, level)}
                onReset={(_menuKey, overrideId) => void handleGroupMenuOverrideReset(selectedGroupForPermissions.id, overrideId)}
              />
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

      <Modal open={!!newlyCreatedScimToken} onClose={() => setNewlyCreatedScimToken(null)} title="SCIM Token Created">
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
          Copy this token now — <strong>"{newlyCreatedScimToken?.name}"</strong>'s secret won't be shown again. Paste it into your identity provider's SCIM app config as the bearer token.
        </p>
        <pre className="rounded-md bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs text-slate-800 dark:text-slate-100 overflow-x-auto whitespace-pre-wrap break-all mb-3">{newlyCreatedScimToken?.token}</pre>
        <div className="flex justify-end gap-2">
          <button onClick={() => newlyCreatedScimToken && void copyKey(newlyCreatedScimToken.token)} className="text-sm rounded-md border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">Copy</button>
          <button onClick={() => setNewlyCreatedScimToken(null)} className="text-sm rounded-md bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5">Done</button>
        </div>
      </Modal>
      {confirmDialog}
    </div>
  );
}