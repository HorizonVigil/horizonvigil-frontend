import { useCallback, useEffect, useRef, useState } from 'react';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { useConfirm } from '../components/ConfirmDialog';
import { useTabParam } from '../lib/useTabParam';
import { useSubmenuAccess } from '../lib/useCanSeeSubmenu';
import { useToast } from '../lib/toast';
import { useAuth } from '../lib/auth';
import { api, type Member, type UserGroup, type Role, type ApiKeySummary, type ActivityEntry, type MenuPermissionRow, type MenuPermissionLevel, type ResourceGrantRow, type AbacPolicyRow, type AbacCondition, type AbacTestResult, type ScimTokenSummary } from '../lib/api';
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

const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;
const MAX_ATTRIBUTE_KEY_LENGTH = 100;
const MAX_ATTRIBUTE_VALUE_LENGTH = 500;
const MAX_ABAC_VALUE_LENGTH = 500;
const MAX_ABAC_CONDITIONS_IN_UI = 1;

function normalizeError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function safeDate(value: string | null | undefined, withTime = false): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return withTime ? date.toLocaleString() : date.toLocaleDateString();
}

function isValidEmail(value: string): boolean {
  if (!value || value.length > MAX_EMAIL_LENGTH) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function isSafeIdentifier(value: string): boolean {
  return /^[A-Za-z0-9_.:-]+$/.test(value);
}

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
  const [groups, setGroups] = useState<UserGroup[]>([]);
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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [connectionsLoading, setConnectionsLoading] = useState(true);
  const [connectionsError, setConnectionsError] = useState<string | null>(null);

  const loadRequestId = useRef(0);
  const connectionsRequestId = useRef(0);
  const memberPermissionsRequestId = useRef(0);
  const resourcePermissionsRequestId = useRef(0);
  const groupPermissionsRequestId = useRef(0);
  const mutationKeys = useRef(new Set<string>());

  const load = useCallback(async () => {
    const requestId = ++loadRequestId.current;
    setLoading(true);
    setLoadError(null);

    const results = await Promise.allSettled([
      api.getMembers(),
      api.getGroups(),
      api.getRoles(),
      api.getApiKeys(),
      api.getAbacPolicies(),
      api.getScimTokens(),
      api.getUserAuditLog({ page: 1, limit: 15 }),
      api.getMyPermissions(),
    ]);

    if (requestId !== loadRequestId.current) return;

    const [
      membersResult,
      groupsResult,
      rolesResult,
      apiKeysResult,
      abacResult,
      scimResult,
      auditResult,
      permissionsResult,
    ] = results;

    const failures: string[] = [];

    if (membersResult.status === 'fulfilled') {
      setMembers(membersResult.value.members ?? []);
    } else {
      failures.push('members');
    }

    if (groupsResult.status === 'fulfilled') {
      setGroups(groupsResult.value.groups ?? []);
    } else {
      failures.push('groups');
    }

    if (rolesResult.status === 'fulfilled') {
      // Keep the server response validated/available for future role metadata without duplicating the static matrix.
    } else {
      failures.push('roles');
    }

    if (apiKeysResult.status === 'fulfilled') {
      setApiKeys(apiKeysResult.value.apiKeys ?? []);
    } else {
      failures.push('API keys');
    }

    if (abacResult.status === 'fulfilled') {
      setAbacPolicies(abacResult.value.items ?? []);
    } else {
      failures.push('ABAC policies');
    }

    if (scimResult.status === 'fulfilled') {
      setScimTokens(scimResult.value.items ?? []);
    } else {
      failures.push('SCIM');
    }

    if (auditResult.status === 'fulfilled') {
      setAuditLog(auditResult.value.items ?? []);
    } else {
      failures.push('audit logs');
    }

    if (permissionsResult.status === 'fulfilled') {
      setMyPermissions(permissionsResult.value);
    } else {
      failures.push('permissions');
    }

    if (failures.length > 0) {
      const message = `Some Users & Groups data could not be loaded: ${failures.join(', ')}.`;
      setLoadError(message);
      toast(message, 'error');
    }

    setLoading(false);
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // Every connected account across all three clouds, paginated to
  // completion (not a single limit:1000 fetch, which silently clamped to
  // the server's 200-per-request cap and also never included Azure at
  // all) -- scoping a user/role/resource grant to an account past #200 or
  // to any Azure subscription was previously impossible from this picker.
  useEffect(() => {
    const requestId = ++connectionsRequestId.current;
    setConnectionsLoading(true);
    setConnectionsError(null);

    void Promise.allSettled([
      fetchAllPages((page, limit) => api.getAccounts({ page, limit })),
      fetchAllPages((page, limit) => api.getGcpAccounts({ page, limit })),
      fetchAllPages((page, limit) => api.getAzureAccounts({ page, limit })),
    ]).then(results => {
      if (requestId !== connectionsRequestId.current) return;

      const [aws, gcp, azure] = results;
      const failures: string[] = [];

      const awsItems = aws.status === 'fulfilled' ? aws.value : (failures.push('AWS'), []);
      const gcpItems = gcp.status === 'fulfilled' ? gcp.value : (failures.push('GCP'), []);
      const azureItems = azure.status === 'fulfilled' ? azure.value : (failures.push('Azure'), []);

      setConnections([
        ...awsItems.map(c => ({
          id: c.id,
          label: `${c.connection_name ?? c.aws_account_id} (AWS)`,
        })),
        ...gcpItems.map(c => ({
          id: c.id,
          label: `${c.connection_name ?? c.gcp_project_id} (GCP)`,
        })),
        ...azureItems.map(c => ({
          id: c.id,
          label: `${c.connection_name ?? c.azure_subscription_id} (Azure)`,
        })),
      ]);

      if (failures.length > 0) {
        const message = `Some cloud connections could not be loaded: ${failures.join(', ')}.`;
        setConnectionsError(message);
        toast(message, 'error');
      }

      setConnectionsLoading(false);
    });
  }, [toast]);

  const loadMenuPermissions = useCallback(async (userId: string) => {
    const requestId = ++memberPermissionsRequestId.current;
    setMenuPermsLoading(true);

    try {
      const results = await Promise.allSettled([
        api.getMenuPermissionOverrides({ userId }),
        api.getEffectiveMenuPermissions(userId),
      ]);

      if (requestId !== memberPermissionsRequestId.current) return;

      const [overridesResult, effectiveResult] = results;

      if (overridesResult.status === 'fulfilled') {
        setMenuOverrides(overridesResult.value.items ?? []);
      }

      if (effectiveResult.status === 'fulfilled') {
        setMenuEffective(effectiveResult.value.permissions ?? {});
      }

      if (overridesResult.status === 'rejected' || effectiveResult.status === 'rejected') {
        toast('Could not fully load this member’s menu permissions.', 'error');
      }
    } finally {
      if (requestId === memberPermissionsRequestId.current) {
        setMenuPermsLoading(false);
      }
    }
  }, [toast]);

  useEffect(() => {
    if (selectedMemberForPermissions) void loadMenuPermissions(selectedMemberForPermissions.userId);
    else { setMenuOverrides([]); setMenuEffective({}); }
  }, [selectedMemberForPermissions, loadMenuPermissions]);

  const loadResourceGrants = useCallback(async (userId: string) => {
    const requestId = ++resourcePermissionsRequestId.current;
    setResourcePermsLoading(true);

    try {
      const results = await Promise.allSettled([
        api.getResourceGrants(userId),
        api.getEffectiveResourceGrants(userId),
      ]);

      if (requestId !== resourcePermissionsRequestId.current) return;

      const [grantsResult, effectiveResult] = results;

      if (grantsResult.status === 'fulfilled') {
        setResourceGrants(grantsResult.value.items ?? []);
      }

      if (effectiveResult.status === 'fulfilled') {
        setResourceRestricted(Boolean(effectiveResult.value.restricted));
      }

      if (grantsResult.status === 'rejected' || effectiveResult.status === 'rejected') {
        toast('Could not fully load this member’s resource access.', 'error');
      }
    } finally {
      if (requestId === resourcePermissionsRequestId.current) {
        setResourcePermsLoading(false);
      }
    }
  }, [toast]);

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
    if (!beginMutation(`attributes:${userId}`)) return;

    setSavingAttributes(true);
    try {
      const attributes: Record<string, string> = {};
      const seenKeys = new Set<string>();

      for (const row of attributeRows) {
        const key = row.key.trim();
        const value = row.value.trim();

        if (!key && !value) continue;
        if (!key || !isSafeIdentifier(key)) {
          throw new Error('Attribute keys may contain only letters, numbers, dots, underscores, colons, and hyphens.');
        }
        if (key.length > MAX_ATTRIBUTE_KEY_LENGTH) {
          throw new Error(`Attribute keys must be ${MAX_ATTRIBUTE_KEY_LENGTH} characters or fewer.`);
        }
        if (value.length > MAX_ATTRIBUTE_VALUE_LENGTH) {
          throw new Error(`Attribute values must be ${MAX_ATTRIBUTE_VALUE_LENGTH} characters or fewer.`);
        }
        if (seenKeys.has(key)) {
          throw new Error(`Duplicate attribute key: ${key}`);
        }

        seenKeys.add(key);
        attributes[key] = value;
      }

      await api.updateMemberAttributes(userId, attributes);
      toast('Attributes updated', 'success');
      setAttributesDirty(false);
      setSelectedMemberForPermissions(prev => (prev ? { ...prev, attributes } : prev));
      await load();
    } catch (err) {
      toast(normalizeError(err, 'Could not save attributes.'), 'error');
    } finally {
      setSavingAttributes(false);
      endMutation(`attributes:${userId}`);
    }
  }

  async function handleAddResourceGrant(userId: string) {
    const connectionId = addGrantConnectionId.trim();
    if (!connectionId || !beginMutation(`grant:add:${userId}:${connectionId}`)) return;

    try {
      await api.setResourceGrant(userId, connectionId);
      setAddGrantConnectionId('');
      await loadResourceGrants(userId);
      toast('Resource access granted', 'success');
    } catch (err) {
      toast(normalizeError(err, 'Could not grant resource access.'), 'error');
    } finally {
      endMutation(`grant:add:${userId}:${connectionId}`);
    }
  }

  async function handleRemoveResourceGrant(userId: string, grantId: string) {
    if (!beginMutation(`grant:remove:${grantId}`)) return;

    try {
      await api.deleteResourceGrant(grantId);
      await loadResourceGrants(userId);
      toast('Resource access revoked', 'success');
    } catch (err) {
      toast(normalizeError(err, 'Could not revoke resource access.'), 'error');
    } finally {
      endMutation(`grant:remove:${grantId}`);
    }
  }

  async function handleMenuLevelChange(userId: string, menuKey: string, level: MenuPermissionLevel) {
    const key = `menu:set:${userId}:${menuKey}`;
    if (!beginMutation(key)) return;

    try {
      await api.setMenuPermission({ userId, menuKey, level });
      await loadMenuPermissions(userId);
      toast('Menu permission updated', 'success');
    } catch (err) {
      toast(normalizeError(err, 'Could not update menu permission.'), 'error');
    } finally {
      endMutation(key);
    }
  }

  async function handleMenuOverrideReset(userId: string, overrideId: string) {
    if (!beginMutation(`menu:delete:${overrideId}`)) return;

    try {
      await api.deleteMenuPermission(overrideId);
      await loadMenuPermissions(userId);
      toast('Reverted to role default', 'success');
    } catch (err) {
      toast(normalizeError(err, 'Could not reset menu permission.'), 'error');
    } finally {
      endMutation(`menu:delete:${overrideId}`);
    }
  }

  const loadGroupMenuPermissions = useCallback(async (groupId: string) => {
    const requestId = ++groupPermissionsRequestId.current;
    setGroupMenuPermsLoading(true);

    try {
      const { items } = await api.getMenuPermissionOverrides({ groupId });

      if (requestId !== groupPermissionsRequestId.current) return;

      setGroupMenuOverrides(items ?? []);
    } catch (error) {
      if (requestId === groupPermissionsRequestId.current) {
        toast(normalizeError(error, 'Could not load group menu permissions.'), 'error');
      }
    } finally {
      if (requestId === groupPermissionsRequestId.current) {
        setGroupMenuPermsLoading(false);
      }
    }
  }, [toast]);

  useEffect(() => {
    if (selectedGroupForPermissions) void loadGroupMenuPermissions(selectedGroupForPermissions.id);
    else setGroupMenuOverrides([]);
  }, [selectedGroupForPermissions, loadGroupMenuPermissions]);

  async function handleGroupMenuLevelChange(groupId: string, menuKey: string, level: MenuPermissionLevel) {
    const key = `group-menu:set:${groupId}:${menuKey}`;
    if (!beginMutation(key)) return;

    try {
      await api.setMenuPermission({ groupId, menuKey, level });
      await loadGroupMenuPermissions(groupId);
      toast('Group menu permission updated', 'success');
    } catch (err) {
      toast(normalizeError(err, 'Could not update group menu permission.'), 'error');
    } finally {
      endMutation(key);
    }
  }

  async function handleGroupMenuOverrideReset(groupId: string, overrideId: string) {
    if (!beginMutation(`group-menu:delete:${overrideId}`)) return;

    try {
      await api.deleteMenuPermission(overrideId);
      await loadGroupMenuPermissions(groupId);
      toast('Group override removed', 'success');
    } catch (err) {
      toast(normalizeError(err, 'Could not reset group menu permission.'), 'error');
    } finally {
      endMutation(`group-menu:delete:${overrideId}`);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    const email = inviteEmail.trim().toLowerCase();

    if (!isValidEmail(email)) {
      setError('Enter a valid email address.');
      return;
    }

    if (!beginMutation(`invite:${email}:${inviteRole}`)) return;

    setError(null);
    try {
      const result = await api.inviteMember(email, inviteRole);
      const roleLabel = ENTERPRISE_ROLES.find(r => r.value === inviteRole)?.label ?? inviteRole;
      const what = result.accountCreated
        ? `Account created for ${email} (role "${roleLabel}")`
        : `${email} added to the organization (role "${roleLabel}")`;
      toast(
        result.emailSent
          ? result.accountCreated
            ? `${what} — login credentials emailed.`
            : `${what} — notification emailed.`
          : `${what}, but the email could not be sent${result.accountCreated ? ' — reset their password so they can sign in' : ''}.`,
        result.emailSent ? 'success' : 'info',
      );
      setInviteEmail('');
      await load();
    } catch (err) {
      const message = normalizeError(err, 'Could not add this member.');
      setError(message);
      toast(message, 'error');
    } finally {
      endMutation(`invite:${email}:${inviteRole}`);
    }
  }

  async function handleRoleChange(roleGrantId: string, role: Role) {
    const member = members.find(m => m.roleGrantId === roleGrantId);
    if (!member) return;

    if (!beginMutation(`role:${roleGrantId}`)) return;

    setError(null);
    try {
      await api.updateRoleGrant(roleGrantId, role);
      toast(`Role updated to "${ENTERPRISE_ROLES.find(r => r.value === role)?.label ?? role}"`, 'success');
      await load();
    } catch (err) {
      const message = normalizeError(err, 'Could not update this role.');
      setError(message);
      toast(message, 'error');
    } finally {
      endMutation(`role:${roleGrantId}`);
    }
  }

  async function handleTransferOwnership(targetUserId: string, targetLabel: string) {
    if (targetUserId === user?.id) return;

    if (!(await confirm(
      `Transfer ownership to ${targetLabel}? You will become Organization Admin and will not be able to undo this yourself.`
    ))) return;

    if (!beginMutation(`owner-transfer:${targetUserId}`)) return;

    setError(null);
    try {
      await api.transferOwnership(targetUserId);
      toast(`Ownership transferred to ${targetLabel}.`, 'success');
      await load();
    } catch (err) {
      const message = normalizeError(err, 'Could not transfer ownership.');
      setError(message);
      toast(message, 'error');
    } finally {
      endMutation(`owner-transfer:${targetUserId}`);
    }
  }

  async function handleRemove(roleGrantId: string) {
    if (!(await confirm('Remove this member from the organization? They will lose access to all resources.'))) return;
    if (!beginMutation(`member-remove:${roleGrantId}`)) return;

    setError(null);
    try {
      await api.deleteRoleGrant(roleGrantId);
      toast('Member removed from organization', 'success');

      if (selectedMemberForPermissions?.roleGrantId === roleGrantId) {
        setSelectedMemberForPermissions(null);
      }

      await load();
    } catch (err) {
      const message = normalizeError(err, 'Could not remove this member.');
      setError(message);
      toast(message, 'error');
    } finally {
      endMutation(`member-remove:${roleGrantId}`);
    }
  }

  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault();
    const name = normalizeName(newGroupName);

    if (!name) {
      setGroupError('Enter a group name.');
      return;
    }
    if (name.length > MAX_NAME_LENGTH) {
      setGroupError(`Group names must be ${MAX_NAME_LENGTH} characters or fewer.`);
      return;
    }
    if (!beginMutation(`group-create:${name.toLowerCase()}`)) return;

    setGroupError(null);
    try {
      await api.createGroup(name);
      toast(`Group "${name}" created`, 'success');
      setNewGroupName('');
      await load();
    } catch (err) {
      setGroupError(normalizeError(err, 'Could not create this group.'));
    } finally {
      endMutation(`group-create:${name.toLowerCase()}`);
    }
  }

  async function handleDeleteGroup(id: string) {
    if (!(await confirm('Delete this group? Members will not be deleted, but the group membership and group permissions will be removed.'))) return;
    if (!beginMutation(`group-delete:${id}`)) return;

    setGroupError(null);
    try {
      await api.deleteGroup(id);
      if (selectedGroupForPermissions?.id === id) {
        setSelectedGroupForPermissions(null);
      }
      if (expandedGroup === id) {
        setExpandedGroup(null);
      }
      toast('Group deleted', 'success');
      await load();
    } catch (err) {
      setGroupError(normalizeError(err, 'Could not delete this group.'));
    } finally {
      endMutation(`group-delete:${id}`);
    }
  }

  async function handleAddGroupMember(groupId: string) {
    const userId = addMemberUserId.trim();
    if (!userId || !beginMutation(`group-member:add:${groupId}:${userId}`)) return;

    setGroupError(null);
    try {
      await api.addGroupMember(groupId, userId);
      toast('Member added to group', 'success');
      setAddMemberUserId('');
      await load();
    } catch (err) {
      setGroupError(normalizeError(err, 'Could not add this member to the group.'));
    } finally {
      endMutation(`group-member:add:${groupId}:${userId}`);
    }
  }

  async function handleRemoveGroupMember(groupId: string, userId: string) {
    if (!(await confirm('Remove this member from the group?'))) return;
    if (!beginMutation(`group-member:remove:${groupId}:${userId}`)) return;

    setGroupError(null);
    try {
      await api.removeGroupMember(groupId, userId);
      toast('Member removed from group', 'success');
      await load();
    } catch (err) {
      setGroupError(normalizeError(err, 'Could not remove this member from the group.'));
    } finally {
      endMutation(`group-member:remove:${groupId}:${userId}`);
    }
  }

  async function handleCreateKey(e: React.FormEvent) {
    e.preventDefault();
    const name = normalizeName(newKeyName);

    if (!name) {
      setKeyError('Enter an API key name.');
      return;
    }
    if (name.length > MAX_NAME_LENGTH) {
      setKeyError(`API key names must be ${MAX_NAME_LENGTH} characters or fewer.`);
      return;
    }
    if (!beginMutation(`api-key:create:${name.toLowerCase()}`)) return;

    setKeyError(null);
    try {
      const created = await api.createApiKey(name);

      if (!created.apiKey) {
        throw new Error('The API key was created but the secret was not returned. Contact an administrator.');
      }

      setNewKeyName('');
      setNewlyCreatedKey({ apiKey: created.apiKey, name: created.name });
      await load();
    } catch (err) {
      setKeyError(normalizeError(err, 'Could not create this API key.'));
    } finally {
      endMutation(`api-key:create:${name.toLowerCase()}`);
    }
  }

  async function handleRevokeKey(id: string) {
    if (!(await confirm('Revoke this API key? Any integration using it will stop working immediately.'))) return;
    if (!beginMutation(`api-key:revoke:${id}`)) return;

    setKeyError(null);
    try {
      await api.revokeApiKey(id);
      toast('API key revoked', 'success');
      await load();
    } catch (err) {
      setKeyError(normalizeError(err, 'Could not revoke this API key.'));
    } finally {
      endMutation(`api-key:revoke:${id}`);
    }
  }

  function buildConditionValue(): unknown {
    if (newPolicyOperator === 'in' || newPolicyOperator === 'not_in') return newPolicyValue.split(',').map(v => v.trim()).filter(Boolean);
    return newPolicyValue;
  }

  async function handleCreateAbacPolicy(e: React.FormEvent) {
    e.preventDefault();

    const name = normalizeName(newPolicyName);
    const menuKey = newPolicyMenuKey.trim();
    const attrKey = newPolicyAttrKey.trim();
    const rawValue = newPolicyValue.trim();

    if (!name || !menuKey || !attrKey || !rawValue) {
      setAbacError('Policy name, menu key, attribute key, and value are required.');
      return;
    }

    if (name.length > MAX_NAME_LENGTH || menuKey.length > MAX_NAME_LENGTH || attrKey.length > MAX_ATTRIBUTE_KEY_LENGTH) {
      setAbacError('One or more ABAC fields are too long.');
      return;
    }

    if (!isSafeIdentifier(menuKey) || !isSafeIdentifier(attrKey)) {
      setAbacError('Menu keys and attribute keys may contain only letters, numbers, dots, underscores, colons, and hyphens.');
      return;
    }

    if (rawValue.length > MAX_ABAC_VALUE_LENGTH) {
      setAbacError(`ABAC values must be ${MAX_ABAC_VALUE_LENGTH} characters or fewer.`);
      return;
    }

    const conditionValue = buildConditionValue();
    if (Array.isArray(conditionValue) && conditionValue.length === 0) {
      setAbacError('Provide at least one value for an "in" condition.');
      return;
    }

    const mutationKey = `abac:create:${name.toLowerCase()}`;
    if (!beginMutation(mutationKey)) return;

    setAbacError(null);
    try {
      const condition: AbacCondition = {
        attribute: `${newPolicySubject}.${attrKey}`,
        operator: newPolicyOperator,
        value: conditionValue,
      };

      await api.createAbacPolicy({
        name,
        effect: newPolicyEffect,
        menuKey,
        conditions: [condition].slice(0, MAX_ABAC_CONDITIONS_IN_UI),
      });

      toast(`Policy "${name}" created`, 'success');
      setNewPolicyName('');
      setNewPolicyValue('');
      await load();
    } catch (err) {
      setAbacError(normalizeError(err, 'Could not create this policy.'));
    } finally {
      endMutation(mutationKey);
    }
  }

  async function handleTogglePolicyEnabled(policy: AbacPolicyRow) {
    const key = `abac:toggle:${policy.id}`;
    if (!beginMutation(key)) return;

    setAbacError(null);
    try {
      await api.updateAbacPolicy(policy.id, { enabled: !policy.enabled });
      toast(policy.enabled ? 'Policy disabled' : 'Policy enabled', 'success');
      await load();
    } catch (err) {
      setAbacError(normalizeError(err, 'Could not update this policy.'));
    } finally {
      endMutation(key);
    }
  }

  async function handleDeleteAbacPolicy(id: string, name: string) {
    if (!(await confirm(`Delete the policy "${name}"? This cannot be undone.`))) return;
    if (!beginMutation(`abac:delete:${id}`)) return;

    setAbacError(null);
    try {
      await api.deleteAbacPolicy(id);
      toast('Policy deleted', 'success');
      await load();
    } catch (err) {
      setAbacError(normalizeError(err, 'Could not delete this policy.'));
    } finally {
      endMutation(`abac:delete:${id}`);
    }
  }

  async function handleRunAbacTest(e: React.FormEvent) {
    e.preventDefault();

    const userId = testUserId.trim();
    const menuKey = testMenuKey.trim();
    const attrKey = testAttrKey.trim();
    const attrValue = testAttrValue.trim();

    if (!userId || !menuKey) return;

    if (menuKey.length > MAX_NAME_LENGTH || attrKey.length > MAX_ATTRIBUTE_KEY_LENGTH || attrValue.length > MAX_ABAC_VALUE_LENGTH) {
      toast('ABAC test input is too long.', 'error');
      return;
    }

    if (menuKey && !isSafeIdentifier(menuKey)) {
      toast('Invalid menu key.', 'error');
      return;
    }

    if (attrKey && !isSafeIdentifier(attrKey)) {
      toast('Invalid attribute key.', 'error');
      return;
    }

    if (testRunning) return;

    setTestRunning(true);
    setTestResult(null);

    try {
      const resourceAttributes = attrKey ? { [attrKey]: attrValue } : {};
      const result = await api.testAbacPolicy({
        userId,
        menuKey,
        resourceAttributes,
      });
      setTestResult(result);
    } catch (err) {
      toast(normalizeError(err, 'Could not run this test.'), 'error');
    } finally {
      setTestRunning(false);
    }
  }

  async function handleCreateScimToken(e: React.FormEvent) {
    e.preventDefault();

    const name = normalizeName(newScimTokenName);

    if (!name) {
      setScimError('Enter a SCIM token name.');
      return;
    }
    if (name.length > MAX_NAME_LENGTH) {
      setScimError(`SCIM token names must be ${MAX_NAME_LENGTH} characters or fewer.`);
      return;
    }

    const mutationKey = `scim:create:${name.toLowerCase()}`;
    if (!beginMutation(mutationKey)) return;

    setScimError(null);
    try {
      const created = await api.createScimToken(name);

      if (!created.token) {
        throw new Error('The SCIM token was created but the secret was not returned. Contact an administrator.');
      }

      setNewScimTokenName('');
      setNewlyCreatedScimToken({ token: created.token, name: created.name });
      await load();
    } catch (err) {
      setScimError(normalizeError(err, 'Could not create this SCIM token.'));
    } finally {
      endMutation(mutationKey);
    }
  }

  async function handleRevokeScimToken(id: string) {
    if (!(await confirm('Revoke this SCIM token? Your identity provider will immediately be unable to provision or deprovision users through it.'))) return;
    if (!beginMutation(`scim:revoke:${id}`)) return;

    setScimError(null);
    try {
      await api.revokeScimToken(id);
      toast('SCIM token revoked', 'success');
      await load();
    } catch (err) {
      setScimError(normalizeError(err, 'Could not revoke this token.'));
    } finally {
      endMutation(`scim:revoke:${id}`);
    }
  }

  function beginMutation(key: string): boolean {
    if (mutationKeys.current.has(key)) return false;
    mutationKeys.current.add(key);
    return true;
  }

  function endMutation(key: string): void {
    mutationKeys.current.delete(key);
  }

  function memberName(userId: string): string {
    const m = members.find(x => x.userId === userId);
    return m?.fullName ?? m?.email ?? userId;
  }

  async function copyKey(secret: string, label = 'Secret') {
    if (!secret) return;

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard access is unavailable.');
      }

      await navigator.clipboard.writeText(secret);
      toast(`${label} copied to clipboard`, 'success');
    } catch {
      toast(`Could not copy the ${label.toLowerCase()}. Copy it manually instead.`, 'error');
    }
  }


  return (
    <div>
      <FilterBar title="Users & Groups" breadcrumb={<Breadcrumb />} showAccountFilter={false} showRegionFilter={false} showDateFilter={false} />

      <div className="flex gap-1 mb-4 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
        {visibleTabs.map(t => (
          <button type="button" key={t} onClick={() => setTab(t)} className={`text-sm px-3 py-2 border-b-2 -mb-px whitespace-nowrap ${tab === t ? 'border-brand-600 text-brand-600 dark:text-brand-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}>
            {t}
          </button>
        ))}
      </div>

      {visibleTabs.length === 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Access restricted</h2>
          <p className="mt-1 text-sm text-slate-400">You do not have permission to manage users and organization access.</p>
        </div>
      )}

      {loadError && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 px-3 py-2.5">
          <p className="text-xs text-red-700 dark:text-red-300">{loadError}</p>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="shrink-0 text-xs font-semibold text-red-700 dark:text-red-300 hover:underline disabled:opacity-50"
          >
            Retry
          </button>
        </div>
      )}

      {connectionsError && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5">
          <p className="text-xs text-amber-700 dark:text-amber-300">{connectionsError}</p>
        </div>
      )}

      {loading && members.length === 0 && groups.length === 0 && (
        <div className="mb-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-8 text-center text-sm text-slate-400">
          Loading organization access controls…
        </div>
      )}

      {tab === 'Users' && (
        <div className="flex flex-col gap-4">
          {/* Members Table */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300">Organization Members</h3>
              <span className="text-xs text-slate-400">{members.length} member{members.length === 1 ? '' : 's'}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
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
                      <button type="button" aria-label={`Manage permissions for ${m.email ?? m.fullName ?? "member"}`} onClick={() => setSelectedMemberForPermissions(m)} className="text-xs text-brand-600 dark:text-brand-400 hover:underline">Permissions</button>
                      {myPermissions?.role === 'owner' && m.userId !== user?.id && (
                        <button type="button" onClick={() => void handleTransferOwnership(m.userId, m.email ?? m.fullName ?? 'this member')} className="text-xs text-amber-600 dark:text-amber-400 hover:underline">Make owner</button>
                      )}
                      <button type="button" onClick={() => void handleRemove(m.roleGrantId)} className="text-xs text-red-500 hover:underline">Remove</button>
                    </td>
                  </tr>
                ))}
                {members.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-sm text-slate-400">No members yet. Invite your first team member below.</td></tr>}
              </tbody>
              </table>
            </div>
          </div>

          {/* Invite Form with Project Access */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Invite New Member</h3>
            <form onSubmit={handleInvite} className="flex flex-col gap-3">
              <div className="flex gap-3 items-end flex-wrap">
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Email Address</span>
                  <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} type="email" required maxLength={MAX_EMAIL_LENGTH} autoComplete="email" placeholder="teammate@company.com" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white w-64" />
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
                  <button type="button" onClick={() => setExpandedGroup(v => v === g.id ? null : g.id)} className="text-left flex-1">
                    <span className="font-medium text-slate-700 dark:text-slate-200">{g.name}</span> <span className="text-xs text-slate-400">({g.memberIds.length} members)</span>
                  </button>
                  <button type="button" aria-label={`Manage menu access for ${g.name}`} onClick={() => setSelectedGroupForPermissions(g)} className="text-xs text-brand-600 dark:text-brand-400 hover:underline mr-3">Menu Access</button>
                  <button type="button" onClick={() => void handleDeleteGroup(g.id)} className="text-xs text-red-500 hover:underline">Delete</button>
                </div>
                {expandedGroup === g.id && (
                  <div className="mt-2 pl-2 border-l border-slate-200 dark:border-slate-700">
                    <ul className="flex flex-col gap-1 mb-2">
                      {g.memberIds.map(uid => (
                        <li key={uid} className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                          <span>{memberName(uid)}</span>
                          <button type="button" onClick={() => void handleRemoveGroupMember(g.id, uid)} className="text-red-500 hover:underline">Remove</button>
                        </li>
                      ))}
                      {g.memberIds.length === 0 && <li className="text-xs text-slate-400">No members in this group.</li>}
                    </ul>
                    <div className="flex gap-2">
                      <select value={addMemberUserId} onChange={e => setAddMemberUserId(e.target.value)} className="text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 flex-1">
                        <option value="">Add member…</option>
                        {members.filter(m => !g.memberIds.includes(m.userId)).map(m => <option key={m.userId} value={m.userId}>{m.email ?? m.fullName ?? m.userId}</option>)}
                      </select>
                      <button type="button" onClick={() => void handleAddGroupMember(g.id)} className="text-xs rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">Add</button>
                    </div>
                  </div>
                )}
              </li>
            ))}
            {groups.length === 0 && <li className="py-2 text-sm text-slate-400">No groups yet. Create a group to manage permissions for multiple users at once.</li>}
          </ul>
          <form onSubmit={handleCreateGroup} className="flex gap-2">
            <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} maxLength={MAX_NAME_LENGTH} placeholder="New group name (e.g. DevOps Team)" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white w-64" />
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm mb-4">
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
                  <td className="py-2 text-slate-500 dark:text-slate-400">{safeDate(k.created_at)}</td>
                  <td className="py-2">{k.revoked_at ? <Badge tone="neutral">revoked</Badge> : <Badge tone="good">active</Badge>}</td>
                  <td className="py-2">
                    {!k.revoked_at && <button type="button" onClick={() => void handleRevokeKey(k.id)} className="text-xs text-red-500 hover:underline">Revoke</button>}
                  </td>
                </tr>
              ))}
              {apiKeys.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-sm text-slate-400">No API keys yet. Create one for CI/CD pipelines or integrations.</td></tr>}
            </tbody>
            </table>
          </div>
          <form onSubmit={handleCreateKey} className="flex gap-2">
            <input value={newKeyName} onChange={e => setNewKeyName(e.target.value)} maxLength={MAX_NAME_LENGTH} placeholder="Key name (e.g. CI pipeline)" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white w-64" />
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
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm mb-4">
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
                      <button type="button" onClick={() => void handleTogglePolicyEnabled(p)} className="cursor-pointer">
                        <Badge tone={p.enabled ? 'good' : 'neutral'}>{p.enabled ? 'enabled' : 'disabled'}</Badge>
                      </button>
                    </td>
                    <td className="py-2">
                      <button type="button" onClick={() => void handleDeleteAbacPolicy(p.id, p.name)} className="text-xs text-red-500 hover:underline">Delete</button>
                    </td>
                  </tr>
                ))}
                {abacPolicies.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-sm text-slate-400">No ABAC policies yet — access is governed by roles alone.</td></tr>}
              </tbody>
              </table>
            </div>
            <form onSubmit={handleCreateAbacPolicy} className="flex flex-col gap-2">
              <div className="flex gap-2 flex-wrap items-center">
                <input value={newPolicyName} onChange={e => setNewPolicyName(e.target.value)} maxLength={MAX_NAME_LENGTH} placeholder="Policy name" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white w-48" />
                <select value={newPolicyEffect} onChange={e => setNewPolicyEffect(e.target.value as 'allow' | 'deny')} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white">
                  <option value="deny">Deny</option>
                  <option value="allow">Allow</option>
                </select>
                <input value={newPolicyMenuKey} onChange={e => setNewPolicyMenuKey(e.target.value)} maxLength={MAX_NAME_LENGTH} placeholder="Menu key (e.g. cloud)" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white w-36" />
              </div>
              <div className="flex gap-2 flex-wrap items-center">
                <span className="text-xs text-slate-400">when</span>
                <select value={newPolicySubject} onChange={e => setNewPolicySubject(e.target.value as 'user' | 'resource')} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white">
                  <option value="resource">resource.</option>
                  <option value="user">user.</option>
                </select>
                <input value={newPolicyAttrKey} onChange={e => setNewPolicyAttrKey(e.target.value)} maxLength={MAX_ATTRIBUTE_KEY_LENGTH} placeholder="attribute key (e.g. environment)" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white w-52" />
                <select value={newPolicyOperator} onChange={e => setNewPolicyOperator(e.target.value as AbacCondition['operator'])} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white">
                  {ABAC_OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <input value={newPolicyValue} onChange={e => setNewPolicyValue(e.target.value)} maxLength={MAX_ABAC_VALUE_LENGTH} placeholder="value" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white w-40" />
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
              <input value={testMenuKey} onChange={e => setTestMenuKey(e.target.value)} maxLength={MAX_NAME_LENGTH} placeholder="Menu key" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white w-32" />
              <span className="text-xs text-slate-400">resource.</span>
              <input value={testAttrKey} onChange={e => setTestAttrKey(e.target.value)} maxLength={MAX_ATTRIBUTE_KEY_LENGTH} placeholder="attribute key" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white w-36" />
              <input value={testAttrValue} onChange={e => setTestAttrValue(e.target.value)} maxLength={MAX_ABAC_VALUE_LENGTH} placeholder="value" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white w-32" />
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm mb-4">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500 dark:text-slate-400">
                <th className="py-2">Name</th><th className="py-2">Created</th><th className="py-2">Last Used</th><th className="py-2">Status</th><th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {scimTokens.map(t => (
                <tr key={t.id} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                  <td className="py-2 text-slate-700 dark:text-slate-200">{t.name}</td>
                  <td className="py-2 text-slate-500 dark:text-slate-400">{safeDate(t.created_at)}</td>
                  <td className="py-2 text-slate-500 dark:text-slate-400">{t.last_used_at ? safeDate(t.last_used_at) : 'Never'}</td>
                  <td className="py-2">{t.revoked_at ? <Badge tone="neutral">revoked</Badge> : <Badge tone="good">active</Badge>}</td>
                  <td className="py-2">
                    {!t.revoked_at && <button type="button" onClick={() => void handleRevokeScimToken(t.id)} className="text-xs text-red-500 hover:underline">Revoke</button>}
                  </td>
                </tr>
              ))}
              {scimTokens.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-sm text-slate-400">No SCIM tokens yet. Create one to connect an identity provider.</td></tr>}
            </tbody>
            </table>
          </div>
          <form onSubmit={handleCreateScimToken} className="flex gap-2">
            <input value={newScimTokenName} onChange={e => setNewScimTokenName(e.target.value)} maxLength={MAX_NAME_LENGTH} placeholder="Token name (e.g. Okta)" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white w-64" />
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
                <span className="text-xs text-slate-400 shrink-0">{safeDate(entry.occurredAt, true)}</span>
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
                          <button type="button"
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
                    <button type="button"
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
                    <input value={row.key} onChange={e => updateAttributeRow(i, 'key', e.target.value)} maxLength={MAX_ATTRIBUTE_KEY_LENGTH} placeholder="key" className="w-1/3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-1.5 py-1 text-[11px] text-slate-600 dark:text-slate-300" />
                    <input value={row.value} onChange={e => updateAttributeRow(i, 'value', e.target.value)} maxLength={MAX_ATTRIBUTE_VALUE_LENGTH} placeholder="value" className="flex-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-1.5 py-1 text-[11px] text-slate-600 dark:text-slate-300" />
                    <button type="button" onClick={() => removeAttributeRow(i)} className="text-[10px] text-slate-400 hover:text-red-600 dark:hover:text-red-400 shrink-0">remove</button>
                  </div>
                ))}
                {attributeRows.length === 0 && <p className="text-xs text-slate-400">No attributes set.</p>}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={addAttributeRow} className="text-[11px] rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1 text-slate-600 dark:text-slate-300">+ Add attribute</button>
                {attributesDirty && (
                  <button type="button" onClick={() => void handleSaveAttributes(selectedMemberForPermissions.userId)} disabled={savingAttributes} className="text-[11px] rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-2 py-1">
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
        <pre aria-label="Secret value" className="rounded-md bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs text-slate-800 dark:text-slate-100 overflow-x-auto whitespace-pre-wrap break-all mb-3">{newlyCreatedKey?.apiKey}</pre>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => newlyCreatedKey && void copyKey(newlyCreatedKey.apiKey, 'API key')} className="text-sm rounded-md border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">Copy</button>
          <button type="button" onClick={() => setNewlyCreatedKey(null)} className="text-sm rounded-md bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5">Done</button>
        </div>
      </Modal>

      <Modal open={!!newlyCreatedScimToken} onClose={() => setNewlyCreatedScimToken(null)} title="SCIM Token Created">
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
          Copy this token now — <strong>"{newlyCreatedScimToken?.name}"</strong>'s secret won't be shown again. Paste it into your identity provider's SCIM app config as the bearer token.
        </p>
        <pre aria-label="Secret value" className="rounded-md bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs text-slate-800 dark:text-slate-100 overflow-x-auto whitespace-pre-wrap break-all mb-3">{newlyCreatedScimToken?.token}</pre>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => newlyCreatedScimToken && void copyKey(newlyCreatedScimToken.token, 'SCIM token')} className="text-sm rounded-md border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">Copy</button>
          <button type="button" onClick={() => setNewlyCreatedScimToken(null)} className="text-sm rounded-md bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5">Done</button>
        </div>
      </Modal>
      {confirmDialog}
    </div>
  );
}