import { useEffect, useState, useCallback } from 'react';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { StatCard } from '../components/StatCard';
import { Badge } from '../components/Badge';
import { supabase } from '../lib/supabase';
import { useOrg } from '../lib/orgContext';

interface Integration { id: string; category: string; provider_name: string; status: string; connected_on: string | null; last_sync_at: string | null }

const CATEGORIES = ['monitoring', 'security', 'devops', 'notifications', 'others'];
const POPULAR = [
  { name: 'Datadog', category: 'monitoring' }, { name: 'GuardDuty', category: 'security' }, { name: 'Security Hub', category: 'security' },
  { name: 'Slack', category: 'notifications' }, { name: 'Microsoft Teams', category: 'notifications' }, { name: 'Jira', category: 'devops' },
  { name: 'PagerDuty', category: 'notifications' }, { name: 'S3 Log Archive', category: 'others' },
];

export function Integrations() {
  const { currentOrg } = useOrg();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [tab, setTab] = useState<string>('all');

  const load = useCallback(async () => {
    if (!currentOrg) return;
    const { data } = await supabase.from('integrations').select('id,category,provider_name,status,connected_on,last_sync_at').eq('org_id', currentOrg.id);
    setIntegrations(data ?? []);
  }, [currentOrg]);

  useEffect(() => { void load(); }, [load]);

  // None of these providers have a real OAuth/API-key flow wired up yet —
  // there's nothing behind "Quick Connect" but an instant status flip, which
  // means the UI could claim "Connected" for a provider the platform has
  // never actually talked to. That's a real credibility risk for a
  // security/ops product, so these stay disabled (no fake-connect path)
  // until each provider's real auth flow exists.
  async function disconnect(id: string) {
    await supabase.from('integrations').update({ status: 'disconnected', connected_on: null, last_sync_at: null }).eq('id', id);
    await load();
  }

  const filtered = tab === 'all' ? integrations : integrations.filter(i => i.category === tab);
  const connected = integrations.filter(i => i.status === 'connected').length;

  return (
    <div>
      <FilterBar title="Integrations" breadcrumb={<Breadcrumb />} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Total Integrations" value={String(integrations.length)} />
        <StatCard label="Connected" value={String(connected)} />
        <StatCard label="Disconnected" value={String(integrations.filter(i => i.status === 'disconnected').length)} />
        <StatCard label="Errors" value={String(integrations.filter(i => i.status === 'error').length)} />
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-5">
        <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Popular Integrations</h3>
        <p className="text-xs text-slate-400 mb-3">Real OAuth/API-key setup for these providers isn't built yet — shown here so you can see what's planned, not to imply any of them are connected.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {POPULAR.map(p => (
            <div key={p.name} title="Requires a real OAuth/API-key flow — not implemented yet" className="text-left rounded-lg border border-slate-200 dark:border-slate-700 p-3 opacity-60 cursor-not-allowed">
              <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{p.name}</div>
              <div className="text-xs text-slate-400 mt-1">Coming soon</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-1 mb-4 border-b border-slate-200 dark:border-slate-800">
        {['all', ...CATEGORIES].map(c => (
          <button key={c} onClick={() => setTab(c)} className={`text-sm px-3 py-2 border-b-2 -mb-px capitalize ${tab === c ? 'border-brand-600 text-brand-600 dark:text-brand-400' : 'border-transparent text-slate-500 dark:text-slate-400'}`}>{c}</button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500 dark:text-slate-400">
              <th className="px-3 py-2">Provider</th><th className="px-3 py-2">Category</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Connected On</th><th className="px-3 py-2">Last Sync</th><th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(i => (
              <tr key={i.id} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{i.provider_name}</td>
                <td className="px-3 py-2 text-slate-500 dark:text-slate-400 capitalize">{i.category}</td>
                <td className="px-3 py-2"><Badge>{i.status}</Badge></td>
                <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{i.connected_on ? new Date(i.connected_on).toLocaleDateString() : '—'}</td>
                <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{i.last_sync_at ? new Date(i.last_sync_at).toLocaleString() : '—'}</td>
                <td className="px-3 py-2 text-right">
                  {i.status === 'connected' && <button onClick={() => void disconnect(i.id)} className="text-xs text-red-500 hover:underline">Disconnect</button>}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">No integrations in this category yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
