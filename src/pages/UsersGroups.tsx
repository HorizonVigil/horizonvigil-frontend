import { useEffect, useState, useCallback } from 'react';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { useConfirm } from '../components/ConfirmDialog';
import { api, type Member, type PendingInvite, type UserGroup, type Role, type ApiKeySummary, type ActivityEntry } from '../lib/api';

const ROLES: Role[] = ['owner', 'admin', 'editor', 'viewer', 'billing_admin'];

export function UsersGroups() {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [members, setMembers] = useState<Member[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [roles, setRoles] = useState<{ role: Role; description: string }[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeySummary[]>([]);
  const [auditLog, setAuditLog] = useState<ActivityEntry[]>([]);

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

  const load = useCallback(async () => {
    const [{ members: m, pendingInvites: pi }, { groups: g }, { roles: r }, { apiKeys: keys }, auditRes] = await Promise.all([
      api.getMembers(),
      api.getGroups(),
      api.getRoles(),
      api.getApiKeys(),
      api.getUserAuditLog({ page: 1, limit: 10 }),
    ]);
    setMembers(m);
    setPendingInvites(pi);
    setGroups(g);
    setRoles(r);
    setApiKeys(keys);
    setAuditLog(auditRes.items);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.inviteMember(inviteEmail.trim(), inviteRole);
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
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this role.');
    }
  }

  async function handleRemove(roleGrantId: string) {
    if (!(await confirm('Remove this member from the organization?'))) return;
    setError(null);
    try {
      await api.deleteRoleGrant(roleGrantId);
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
    try { await navigator.clipboard.writeText(key); } catch { /* clipboard unavailable — user can still select the text */ }
  }

  return (
    <div>
      <FilterBar title="Users & Groups" breadcrumb={<Breadcrumb />} showAccountFilter={false} />

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-5">
        <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Members</h3>
        <table className="w-full text-sm mb-4">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500 dark:text-slate-400">
              <th className="py-2">Email</th><th className="py-2">Name</th><th className="py-2">MFA</th><th className="py-2">Role</th><th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {members.map(m => (
              <tr key={m.roleGrantId} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                <td className="py-2 text-slate-700 dark:text-slate-200">{m.email ?? '—'}</td>
                <td className="py-2 text-slate-500 dark:text-slate-400">{m.fullName ?? '—'}</td>
                <td className="py-2">{m.mfaEnabled ? <Badge tone="good">enabled</Badge> : <Badge tone="neutral">disabled</Badge>}</td>
                <td className="py-2">
                  <select value={m.role} onChange={e => void handleRoleChange(m.roleGrantId, e.target.value as Role)} className="text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-1.5 py-1">
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td className="py-2"><button onClick={() => void handleRemove(m.roleGrantId)} className="text-xs text-red-500 hover:underline">Remove</button></td>
              </tr>
            ))}
            {members.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-sm text-slate-400">No members yet.</td></tr>}
          </tbody>
        </table>

        {pendingInvites.length > 0 && (
          <div className="mb-4">
            <h4 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Pending Invites</h4>
            <ul className="flex flex-col gap-1">
              {pendingInvites.map(pi => (
                <li key={pi.id} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <Badge tone="warning">pending</Badge> {pi.email} <span className="text-xs text-slate-400">({pi.role})</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <form onSubmit={handleInvite} className="flex gap-2 items-end flex-wrap">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-500 dark:text-slate-400">Invite by email</span>
            <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} type="email" required placeholder="teammate@company.com" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white w-64" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-500 dark:text-slate-400">Role</span>
            <select value={inviteRole} onChange={e => setInviteRole(e.target.value as Role)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm text-slate-900 dark:text-white">
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <button type="submit" className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm px-3 py-1.5">Invite</button>
        </form>
        {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Groups</h3>
          <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 mb-4">
            {groups.map(g => (
              <li key={g.id} className="py-2 text-sm">
                <div className="flex items-center justify-between">
                  <button onClick={() => setExpandedGroup(v => v === g.id ? null : g.id)} className="text-left flex-1">
                    <span className="font-medium text-slate-700 dark:text-slate-200">{g.name}</span> <span className="text-xs text-slate-400">({g.memberIds.length} members)</span>
                  </button>
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
            {groups.length === 0 && <li className="py-2 text-sm text-slate-400">No groups yet.</li>}
          </ul>
          <form onSubmit={handleCreateGroup} className="flex gap-2">
            <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="New group name" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white w-56" />
            <button type="submit" className="rounded-md border border-slate-200 dark:border-slate-700 text-sm px-3 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">Create Group</button>
          </form>
          {groupError && <p className="text-sm text-red-500 mt-2">{groupError}</p>}
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Roles Reference</h3>
          <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
            {roles.map(r => (
              <li key={r.role} className="py-2 text-sm flex flex-col gap-0.5">
                <span className="font-medium text-slate-700 dark:text-slate-200 capitalize">{r.role.replace(/_/g, ' ')}</span>
                <span className="text-xs text-slate-400">{r.description}</span>
              </li>
            ))}
            {roles.length === 0 && <li className="py-2 text-sm text-slate-400">No role definitions available.</li>}
          </ul>
        </div>
      </div>

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
            {apiKeys.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-sm text-slate-400">No API keys yet.</td></tr>}
          </tbody>
        </table>
        <form onSubmit={handleCreateKey} className="flex gap-2">
          <input value={newKeyName} onChange={e => setNewKeyName(e.target.value)} placeholder="Key name (e.g. CI pipeline)" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white w-64" />
          <button type="submit" className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm px-3 py-1.5">Create Key</button>
        </form>
        {keyError && <p className="text-sm text-red-500 mt-2">{keyError}</p>}
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mt-5">
        <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Recent User Activity</h3>
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
