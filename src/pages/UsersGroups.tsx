import { useEffect, useState, useCallback } from 'react';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { Badge } from '../components/Badge';
import { useOrg } from '../lib/orgContext';
import { api, type Member, type PendingInvite, type Group, type Role } from '../lib/api';

const ROLES: Role[] = ['owner', 'admin', 'editor', 'viewer', 'billing_admin'];

export function UsersGroups() {
  const { currentOrg } = useOrg();
  const [members, setMembers] = useState<Member[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('viewer');
  const [newGroupName, setNewGroupName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!currentOrg) return;
    const [{ members: m, pendingInvites: pi }, { groups: g }] = await Promise.all([
      api.getMembers(currentOrg.id),
      api.getGroups(currentOrg.id),
    ]);
    setMembers(m);
    setPendingInvites(pi);
    setGroups(g);
  }, [currentOrg]);

  useEffect(() => { void load(); }, [load]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!currentOrg) return;
    setError(null);
    try {
      await api.inviteMember(currentOrg.id, inviteEmail.trim(), inviteRole);
      setInviteEmail('');
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleRoleChange(roleGrantId: string, role: Role) {
    await api.updateRoleGrant(roleGrantId, role);
    await load();
  }

  async function handleRemove(roleGrantId: string) {
    if (!confirm('Remove this member from the organization?')) return;
    await api.deleteRoleGrant(roleGrantId);
    await load();
  }

  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!currentOrg || !newGroupName.trim()) return;
    await api.createGroup(currentOrg.id, newGroupName.trim());
    setNewGroupName('');
    await load();
  }

  return (
    <div>
      <FilterBar title="Users & Groups" breadcrumb={<Breadcrumb />} />

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-5">
        <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Members</h3>
        <table className="w-full text-sm mb-4">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500 dark:text-slate-400">
              <th className="py-2">Email</th><th className="py-2">Name</th><th className="py-2">Role</th><th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {members.map(m => (
              <tr key={m.roleGrantId} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                <td className="py-2 text-slate-700 dark:text-slate-200">{m.email}</td>
                <td className="py-2 text-slate-500 dark:text-slate-400">{m.fullName ?? '—'}</td>
                <td className="py-2">
                  <select value={m.role} onChange={e => void handleRoleChange(m.roleGrantId, e.target.value as Role)} className="text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-1.5 py-1">
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td className="py-2"><button onClick={() => void handleRemove(m.roleGrantId)} className="text-xs text-red-500 hover:underline">Remove</button></td>
              </tr>
            ))}
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

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Groups</h3>
        <ul className="flex flex-col gap-2 mb-4">
          {groups.map(g => (
            <li key={g.id} className="text-sm text-slate-700 dark:text-slate-200">
              <span className="font-medium">{g.name}</span> <span className="text-xs text-slate-400">({g.members.length} members)</span>
            </li>
          ))}
          {groups.length === 0 && <li className="text-sm text-slate-400">No groups yet.</li>}
        </ul>
        <form onSubmit={handleCreateGroup} className="flex gap-2">
          <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="New group name" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white w-56" />
          <button type="submit" className="rounded-md border border-slate-200 dark:border-slate-700 text-sm px-3 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">Create Group</button>
        </form>
      </div>
    </div>
  );
}
