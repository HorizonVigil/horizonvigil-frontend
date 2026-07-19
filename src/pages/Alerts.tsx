import { useEffect, useState, useCallback } from 'react';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { StatCard } from '../components/StatCard';
import { Donut } from '../components/charts/Donut';
import { DataTable, type Column } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { supabase } from '../lib/supabase';
import { useOrg } from '../lib/orgContext';
import { useFilters } from '../lib/filterContext';

interface Alert {
  id: string; severity: string; alert_name: string; status: string; triggered_at: string; resolved_at: string | null;
}

interface AlertRule {
  id: string; name: string; severity: string; enabled: boolean; created_at: string;
}

const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const STATUSES = ['open', 'acknowledged', 'in_progress', 'resolved'];

export function Alerts() {
  const { currentOrg } = useOrg();
  // Alert rules are org-wide definitions, not tied to one AWS account, so
  // only the fired-alerts query below is scoped by the account filter.
  const { account, refreshToken } = useFilters();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [ruleName, setRuleName] = useState('');
  const [ruleSeverity, setRuleSeverity] = useState('medium');

  const load = useCallback(async () => {
    if (!currentOrg) return;
    let alertsQuery = supabase.from('alerts').select('id,severity,alert_name,status,triggered_at,resolved_at').eq('org_id', currentOrg.id);
    if (account !== 'all') alertsQuery = alertsQuery.eq('connection_id', account);
    const [{ data: alertRows }, { data: ruleRows }] = await Promise.all([
      alertsQuery.order('triggered_at', { ascending: false }).limit(500),
      supabase.from('alert_rules').select('id,name,severity,enabled,created_at').eq('org_id', currentOrg.id).order('created_at', { ascending: false }),
    ]);
    setAlerts(alertRows ?? []);
    setRules(ruleRows ?? []);
  }, [currentOrg, account]);

  useEffect(() => { void load(); }, [load, refreshToken]);

  async function updateStatus(id: string, status: string) {
    await supabase.from('alerts').update({ status }).eq('id', id);
    await load();
  }

  async function createRule(e: React.FormEvent) {
    e.preventDefault();
    if (!currentOrg) return;
    await supabase.from('alert_rules').insert({ org_id: currentOrg.id, name: ruleName, severity: ruleSeverity });
    setRuleModalOpen(false);
    setRuleName('');
    await load();
  }

  async function toggleRule(id: string, enabled: boolean) {
    await supabase.from('alert_rules').update({ enabled: !enabled }).eq('id', id);
    await load();
  }

  async function deleteRule(id: string) {
    await supabase.from('alert_rules').delete().eq('id', id);
    await load();
  }

  const bySeverity: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const a of alerts) { bySeverity[a.severity] = (bySeverity[a.severity] ?? 0) + 1; byStatus[a.status] = (byStatus[a.status] ?? 0) + 1; }

  const columns: Column<Alert>[] = [
    { key: 'severity', header: 'Severity', render: a => <Badge>{a.severity}</Badge>, sortValue: a => a.severity },
    { key: 'name', header: 'Alert', render: a => a.alert_name, sortValue: a => a.alert_name },
    { key: 'status', header: 'Status', render: a => <Badge>{a.status}</Badge>, sortValue: a => a.status },
    { key: 'triggered', header: 'Triggered At', render: a => new Date(a.triggered_at).toLocaleString(), sortValue: a => a.triggered_at },
    {
      key: 'actions', header: 'Actions', render: a => (
        <div className="flex gap-2 text-xs">
          {a.status !== 'acknowledged' && <button onClick={e => { e.stopPropagation(); void updateStatus(a.id, 'acknowledged'); }} className="text-brand-600 dark:text-brand-400 hover:underline">Acknowledge</button>}
          {a.status !== 'resolved' && <button onClick={e => { e.stopPropagation(); void updateStatus(a.id, 'resolved'); }} className="text-emerald-600 dark:text-emerald-400 hover:underline">Resolve</button>}
        </div>
      ),
    },
  ];

  return (
    <div>
      <FilterBar title="Alerts" breadcrumb={<Breadcrumb />} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Total Alerts" value={String(alerts.length)} />
        {SEVERITIES.slice(0, 3).map(s => <StatCard key={s} label={s[0].toUpperCase() + s.slice(1)} value={String(bySeverity[s] ?? 0)} />)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Alerts by Severity</h3>
          <Donut data={SEVERITIES.map(s => ({ label: s, value: bySeverity[s] ?? 0 })).filter(d => d.value > 0)} />
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Alerts by Status</h3>
          <Donut data={STATUSES.map(s => ({ label: s, value: byStatus[s] ?? 0 })).filter(d => d.value > 0)} />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-5">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300">Alert Rules</h3>
          <button onClick={() => setRuleModalOpen(true)} className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm px-3 py-2">Create Alert Rule</button>
        </div>
        {rules.length === 0 ? (
          <p className="text-sm text-slate-400">No alert rules yet — create one above. Trigger logic (evaluating rules against synced data) isn't wired up yet, so rules won't produce alerts on their own until that lands, but they're saved here and can be edited or removed.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {rules.map(r => (
              <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                <div className="flex items-center gap-2">
                  <Badge>{r.severity}</Badge>
                  <span className={r.enabled ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 line-through'}>{r.name}</span>
                </div>
                <div className="flex gap-3 text-xs">
                  <button onClick={() => void toggleRule(r.id, r.enabled)} className="text-brand-600 dark:text-brand-400 hover:underline">{r.enabled ? 'Disable' : 'Enable'}</button>
                  <button onClick={() => void deleteRule(r.id)} className="text-red-500 hover:underline">Delete</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <DataTable columns={columns} rows={alerts} rowKey={a => a.id} emptyMessage="No alerts yet. Alert rules evaluate against synced resource/cost/security data — trigger logic isn't wired up yet, but rules and alerts you create here persist and display normally." />

      <Modal open={ruleModalOpen} onClose={() => setRuleModalOpen(false)} title="Create Alert Rule">
        <form onSubmit={createRule} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-300">Rule name</span>
            <input required value={ruleName} onChange={e => setRuleName(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-300">Severity</span>
            <select value={ruleSeverity} onChange={e => setRuleSeverity(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white">
              {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <button type="submit" className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium py-2">Save Rule</button>
        </form>
      </Modal>
    </div>
  );
}
