import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { StatCard } from '../components/StatCard';
import { Donut } from '../components/charts/Donut';
import { DataTable, type Column } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { useConfirm } from '../components/ConfirmDialog';
import { useFilters } from '../lib/filterContext';
import { useTabParam } from '../lib/useTabParam';
import {
  api,
  type AlertRow, type AlertRule, type NotificationChannel, type EscalationPolicy, type MaintenanceWindow,
} from '../lib/api';

const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const STATUSES = ['open', 'acknowledged', 'in_progress', 'resolved'];
const CHANNEL_TYPES = ['email', 'slack', 'webhook', 'sms', 'pagerduty'];
const CHANNEL_TYPE_LABELS: Record<string, string> = { email: 'Email', slack: 'Slack', webhook: 'Webhook', sms: 'SMS', pagerduty: 'PagerDuty' };
const CHANNEL_TARGET_LABEL: Record<string, string> = {
  email: 'Email address', slack: 'Slack webhook URL', webhook: 'Webhook URL', sms: 'Phone number', pagerduty: 'PagerDuty integration key',
};

// One tab per navConfig submenu item under Alerts — Active Alerts and Alert
// History used to be a single "Alerts" tab with a buried view toggle, which
// meant the "Alert History" submenu item landed on the same default (Active)
// view as "Active Alerts" with no visible differentiation. Splitting them
// into their own top-level tabs makes each submenu item's promise real.
type Tab = 'active' | 'rules' | 'channels' | 'escalations' | 'history' | 'maintenance';
const TABS: { key: Tab; label: string }[] = [
  { key: 'active', label: 'Active Alerts' },
  { key: 'rules', label: 'Alert Rules' },
  { key: 'channels', label: 'Notification Channels' },
  { key: 'escalations', label: 'Escalation Policies' },
  { key: 'history', label: 'Alert History' },
  { key: 'maintenance', label: 'Maintenance Windows' },
];
const TAB_KEYS = TABS.map((t) => t.key);

interface EscalationStepDraft { afterMinutes: number; channelId: string }

function buildChannelConfig(type: string, target: string): unknown {
  switch (type) {
    case 'email': return { email: target };
    case 'slack': return { webhookUrl: target };
    case 'webhook': return { url: target };
    case 'sms': return { phoneNumber: target };
    case 'pagerduty': return { integrationKey: target };
    default: return { target };
  }
}

export function Alerts() {
  const { account, connections, refreshToken } = useFilters();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [activeTab, setActiveTab] = useTabParam<Tab>(TAB_KEYS, 'active');
  const [activeAlerts, setActiveAlerts] = useState<AlertRow[]>([]);
  const [historyAlerts, setHistoryAlerts] = useState<AlertRow[]>([]);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [escalations, setEscalations] = useState<EscalationPolicy[]>([]);
  const [maintenanceWindows, setMaintenanceWindows] = useState<MaintenanceWindow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(async () => {
    const connectionId = account === 'all' ? undefined : account;
    const [activeRes, historyRes, rulesRes, channelsRes, escalationsRes, maintenanceRes] = await Promise.all([
      api.getActiveAlerts({ connection_id: connectionId, limit: 200 }),
      api.getAlertHistory({ connection_id: connectionId, limit: 200 }),
      api.getAlertRules({ limit: 200 }),
      api.getNotificationChannels({ limit: 200 }),
      api.getEscalationPolicies({ limit: 200 }),
      api.getMaintenanceWindows({ limit: 200 }),
    ]);
    setActiveAlerts(activeRes.items);
    setHistoryAlerts(historyRes.items);
    setRules(rulesRes.items);
    setChannels(channelsRes.items);
    setEscalations(escalationsRes.items);
    setMaintenanceWindows(maintenanceRes.items);
  }, [account]);

  useEffect(() => { void load(); }, [load, refreshToken]);

  // ── Alerts ──────────────────────────────────────────────────────────────

  async function updateStatus(id: string, status: AlertRow['status']) {
    setBusyId(id);
    try {
      await api.updateAlertStatus(id, status);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // No dedicated bulk-status endpoint exists yet — this drives the same
  // single-alert PATCH the per-row buttons use, once per selected id. Real
  // requests, real results; just not a single round trip.
  async function bulkUpdateStatus(status: AlertRow['status']) {
    setBulkBusy(true);
    try {
      await Promise.all([...selectedIds].map(id => api.updateAlertStatus(id, status)));
      setSelectedIds(new Set());
      await load();
    } finally {
      setBulkBusy(false);
    }
  }

  const alertColumns: Column<AlertRow>[] = [
    ...(bulkMode && activeTab === 'active' ? [{
      key: 'select', header: '',
      render: (a: AlertRow) => <input type="checkbox" checked={selectedIds.has(a.id)} onChange={() => toggleSelected(a.id)} onClick={e => e.stopPropagation()} />,
    }] : []),
    { key: 'severity', header: 'Severity', render: a => <Badge>{a.severity}</Badge>, sortValue: a => a.severity },
    { key: 'name', header: 'Alert', render: a => a.alert_name, sortValue: a => a.alert_name },
    { key: 'status', header: 'Status', render: a => <Badge>{a.status}</Badge>, sortValue: a => a.status },
    { key: 'triggered', header: 'Triggered At', render: a => new Date(a.triggered_at).toLocaleString(), sortValue: a => a.triggered_at },
    { key: 'resolved', header: 'Resolved At', render: a => a.resolved_at ? new Date(a.resolved_at).toLocaleString() : '—', sortValue: a => a.resolved_at ?? '' },
    {
      key: 'actions', header: 'Actions', render: a => {
        const busy = busyId === a.id;
        return (
          <div className="flex gap-2 text-xs">
            {a.status === 'open' && <button disabled={busy} onClick={e => { e.stopPropagation(); void updateStatus(a.id, 'acknowledged'); }} className="text-brand-600 dark:text-brand-400 hover:underline disabled:opacity-50">Acknowledge</button>}
            {a.status !== 'resolved' && <button disabled={busy} onClick={e => { e.stopPropagation(); void updateStatus(a.id, 'resolved'); }} className="text-emerald-600 dark:text-emerald-400 hover:underline disabled:opacity-50">Resolve</button>}
          </div>
        );
      },
    },
  ];

  const bySeverity: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const a of activeAlerts) {
    bySeverity[a.severity] = (bySeverity[a.severity] ?? 0) + 1;
    byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
  }

  // ── Alert Rules ─────────────────────────────────────────────────────────

  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [ruleName, setRuleName] = useState('');
  const [ruleSeverity, setRuleSeverity] = useState('medium');
  const [ruleEnabled, setRuleEnabled] = useState(true);
  const [ruleChannelIds, setRuleChannelIds] = useState<string[]>([]);
  const [ruleConditionText, setRuleConditionText] = useState('{}');
  const [ruleError, setRuleError] = useState('');

  function resetRuleForm() {
    setRuleName(''); setRuleSeverity('medium'); setRuleEnabled(true); setRuleChannelIds([]); setRuleConditionText('{}'); setRuleError('');
  }

  async function createRule(e: FormEvent) {
    e.preventDefault();
    let condition: unknown;
    if (ruleConditionText.trim()) {
      try { condition = JSON.parse(ruleConditionText); } catch { setRuleError('Condition must be valid JSON.'); return; }
    }
    await api.createAlertRule({ name: ruleName, severity: ruleSeverity, enabled: ruleEnabled, notificationChannels: ruleChannelIds, condition });
    setRuleModalOpen(false);
    resetRuleForm();
    await load();
  }

  async function toggleRule(rule: AlertRule) {
    await api.updateAlertRule(rule.id, { enabled: !rule.enabled });
    await load();
  }

  async function deleteRule(id: string) {
    if (!(await confirm('Delete this alert rule?'))) return;
    await api.deleteAlertRule(id);
    await load();
  }

  const ruleColumns: Column<AlertRule>[] = [
    { key: 'name', header: 'Name', render: r => r.name, sortValue: r => r.name },
    { key: 'severity', header: 'Severity', render: r => <Badge>{r.severity}</Badge>, sortValue: r => r.severity },
    { key: 'enabled', header: 'Enabled', render: r => <Badge tone={r.enabled ? 'good' : 'neutral'}>{r.enabled ? 'enabled' : 'disabled'}</Badge>, sortValue: r => (r.enabled ? 1 : 0) },
    { key: 'channels', header: 'Channels', render: r => String(Array.isArray(r.notification_channels) ? r.notification_channels.length : 0), sortValue: r => (Array.isArray(r.notification_channels) ? r.notification_channels.length : 0) },
    { key: 'created', header: 'Created', render: r => new Date(r.created_at).toLocaleDateString(), sortValue: r => r.created_at },
    {
      key: 'actions', header: 'Actions', render: r => (
        <div className="flex gap-2 text-xs">
          <button onClick={e => { e.stopPropagation(); void toggleRule(r); }} className="text-brand-600 dark:text-brand-400 hover:underline">{r.enabled ? 'Disable' : 'Enable'}</button>
          <button onClick={e => { e.stopPropagation(); void deleteRule(r.id); }} className="text-red-500 hover:underline">Delete</button>
        </div>
      ),
    },
  ];

  // ── Notification Channels ──────────────────────────────────────────────

  const [channelModalOpen, setChannelModalOpen] = useState(false);
  const [channelName, setChannelName] = useState('');
  const [channelType, setChannelType] = useState('email');
  const [channelTarget, setChannelTarget] = useState('');
  const [channelEnabled, setChannelEnabled] = useState(true);

  function resetChannelForm() {
    setChannelName(''); setChannelType('email'); setChannelTarget(''); setChannelEnabled(true);
  }

  async function createChannel(e: FormEvent) {
    e.preventDefault();
    await api.createNotificationChannel({ name: channelName, channelType, config: buildChannelConfig(channelType, channelTarget), enabled: channelEnabled });
    setChannelModalOpen(false);
    resetChannelForm();
    await load();
  }

  async function toggleChannel(channel: NotificationChannel) {
    await api.updateNotificationChannel(channel.id, { enabled: !channel.enabled });
    await load();
  }

  async function deleteChannel(id: string) {
    if (!(await confirm('Delete this notification channel? Alert rules or escalation policies referencing it will no longer be able to notify through it.'))) return;
    await api.deleteNotificationChannel(id);
    await load();
  }

  const channelColumns: Column<NotificationChannel>[] = [
    { key: 'name', header: 'Name', render: c => c.name, sortValue: c => c.name },
    { key: 'type', header: 'Type', render: c => CHANNEL_TYPE_LABELS[c.channel_type] ?? c.channel_type, sortValue: c => c.channel_type },
    { key: 'enabled', header: 'Enabled', render: c => <Badge tone={c.enabled ? 'good' : 'neutral'}>{c.enabled ? 'enabled' : 'disabled'}</Badge>, sortValue: c => (c.enabled ? 1 : 0) },
    { key: 'created', header: 'Created', render: c => new Date(c.created_at).toLocaleDateString(), sortValue: c => c.created_at },
    {
      key: 'actions', header: 'Actions', render: c => (
        <div className="flex gap-2 text-xs">
          <button onClick={e => { e.stopPropagation(); void toggleChannel(c); }} className="text-brand-600 dark:text-brand-400 hover:underline">{c.enabled ? 'Disable' : 'Enable'}</button>
          <button onClick={e => { e.stopPropagation(); void deleteChannel(c.id); }} className="text-red-500 hover:underline">Delete</button>
        </div>
      ),
    },
  ];

  // ── Escalation Policies ────────────────────────────────────────────────

  const [escalationModalOpen, setEscalationModalOpen] = useState(false);
  const [escalationName, setEscalationName] = useState('');
  const [escalationSteps, setEscalationSteps] = useState<EscalationStepDraft[]>([{ afterMinutes: 5, channelId: '' }]);

  function resetEscalationForm() {
    setEscalationName(''); setEscalationSteps([{ afterMinutes: 5, channelId: '' }]);
  }

  function addEscalationStep() {
    setEscalationSteps(prev => [...prev, { afterMinutes: 15, channelId: '' }]);
  }
  function removeEscalationStep(i: number) {
    setEscalationSteps(prev => prev.filter((_, idx) => idx !== i));
  }
  function updateEscalationStep(i: number, patch: Partial<EscalationStepDraft>) {
    setEscalationSteps(prev => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  async function createEscalation(e: FormEvent) {
    e.preventDefault();
    await api.createEscalationPolicy({ name: escalationName, steps: escalationSteps.filter(s => s.channelId) });
    setEscalationModalOpen(false);
    resetEscalationForm();
    await load();
  }

  async function deleteEscalation(id: string) {
    if (!(await confirm('Delete this escalation policy?'))) return;
    await api.deleteEscalationPolicy(id);
    await load();
  }

  const escalationColumns: Column<EscalationPolicy>[] = [
    { key: 'name', header: 'Name', render: e => e.name, sortValue: e => e.name },
    { key: 'steps', header: 'Steps', render: e => String(Array.isArray(e.steps) ? e.steps.length : 0), sortValue: e => (Array.isArray(e.steps) ? e.steps.length : 0) },
    { key: 'created', header: 'Created', render: e => new Date(e.created_at).toLocaleDateString(), sortValue: e => e.created_at },
    {
      key: 'actions', header: 'Actions', render: e => (
        <div className="flex gap-2 text-xs">
          <button onClick={ev => { ev.stopPropagation(); void deleteEscalation(e.id); }} className="text-red-500 hover:underline">Delete</button>
        </div>
      ),
    },
  ];

  // ── Maintenance Windows ────────────────────────────────────────────────

  const [maintenanceModalOpen, setMaintenanceModalOpen] = useState(false);
  const [maintenanceName, setMaintenanceName] = useState('');
  const [maintenanceConnectionId, setMaintenanceConnectionId] = useState('');
  const [maintenanceStart, setMaintenanceStart] = useState('');
  const [maintenanceEnd, setMaintenanceEnd] = useState('');

  function resetMaintenanceForm() {
    setMaintenanceName(''); setMaintenanceConnectionId(''); setMaintenanceStart(''); setMaintenanceEnd('');
  }

  async function createMaintenanceWindow(e: FormEvent) {
    e.preventDefault();
    if (!maintenanceStart || !maintenanceEnd) return;
    await api.createMaintenanceWindow({
      name: maintenanceName,
      connectionId: maintenanceConnectionId || undefined,
      startsAt: new Date(maintenanceStart).toISOString(),
      endsAt: new Date(maintenanceEnd).toISOString(),
    });
    setMaintenanceModalOpen(false);
    resetMaintenanceForm();
    await load();
  }

  async function deleteMaintenanceWindow(id: string) {
    if (!(await confirm('Delete this maintenance window?'))) return;
    await api.deleteMaintenanceWindow(id);
    await load();
  }

  function connectionName(id: string | null): string {
    if (!id) return 'All accounts';
    return connections.find(c => c.id === id)?.name ?? id;
  }

  const maintenanceColumns: Column<MaintenanceWindow>[] = [
    { key: 'name', header: 'Name', render: w => w.name, sortValue: w => w.name },
    { key: 'connection', header: 'Scope', render: w => connectionName(w.connection_id), sortValue: w => connectionName(w.connection_id) },
    { key: 'starts', header: 'Starts', render: w => new Date(w.starts_at).toLocaleString(), sortValue: w => w.starts_at },
    { key: 'ends', header: 'Ends', render: w => new Date(w.ends_at).toLocaleString(), sortValue: w => w.ends_at },
    {
      key: 'actions', header: 'Actions', render: w => (
        <div className="flex gap-2 text-xs">
          <button onClick={e => { e.stopPropagation(); void deleteMaintenanceWindow(w.id); }} className="text-red-500 hover:underline">Delete</button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <FilterBar title="Alerts" breadcrumb={<Breadcrumb />} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Active Alerts" value={String(activeAlerts.length)} />
        {SEVERITIES.slice(0, 3).map(s => <StatCard key={s} label={s[0].toUpperCase() + s.slice(1)} value={String(bySeverity[s] ?? 0)} />)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Active Alerts by Severity</h3>
          <Donut data={SEVERITIES.map(s => ({ label: s, value: bySeverity[s] ?? 0 })).filter(d => d.value > 0)} />
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Active Alerts by Status</h3>
          <Donut data={STATUSES.map(s => ({ label: s, value: byStatus[s] ?? 0 })).filter(d => d.value > 0)} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4 border-b border-slate-200 dark:border-slate-800">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`text-sm px-3 py-2 border-b-2 -mb-px ${activeTab === t.key ? 'border-brand-600 text-brand-600 dark:text-brand-400 font-medium' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'active' && (
        <div>
          <div className="flex items-center justify-end gap-2 mb-3">
            {bulkMode && selectedIds.size > 0 && (
              <>
                <button disabled={bulkBusy} onClick={() => void bulkUpdateStatus('acknowledged')} className="text-xs rounded-md border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-brand-600 dark:text-brand-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">
                  Acknowledge {selectedIds.size} selected
                </button>
                <button disabled={bulkBusy} onClick={() => void bulkUpdateStatus('resolved')} className="text-xs rounded-md border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-emerald-600 dark:text-emerald-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">
                  {bulkBusy ? 'Working…' : `Resolve ${selectedIds.size} selected`}
                </button>
              </>
            )}
            <button
              onClick={() => { setBulkMode(v => !v); setSelectedIds(new Set()); }}
              className={`text-xs rounded-md border px-3 py-1.5 ${bulkMode ? 'bg-brand-600 border-brand-600 text-white' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
            >
              {bulkMode ? 'Exit Bulk Operations' : 'Bulk Operations'}
            </button>
          </div>
          <DataTable
            columns={alertColumns}
            rows={activeAlerts}
            rowKey={a => a.id}
            emptyMessage="No active alerts right now."
          />
        </div>
      )}

      {activeTab === 'history' && (
        <div>
          <p className="text-xs text-slate-400 mb-3">Every alert that has been triggered, regardless of current status — including ones since acknowledged or resolved.</p>
          <DataTable
            columns={alertColumns}
            rows={historyAlerts}
            rowKey={a => a.id}
            emptyMessage="No alert history yet."
          />
        </div>
      )}

      {activeTab === 'rules' && (
        <div>
          <div className="flex justify-end mb-3">
            <button onClick={() => setRuleModalOpen(true)} className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-3 py-2">+ Create Alert Rule</button>
          </div>
          <DataTable columns={ruleColumns} rows={rules} rowKey={r => r.id} emptyMessage="No alert rules yet — create one to define when an alert should fire." />
        </div>
      )}

      {activeTab === 'channels' && (
        <div>
          <div className="flex justify-end mb-3">
            <button onClick={() => setChannelModalOpen(true)} className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-3 py-2">+ Add Notification Channel</button>
          </div>
          <DataTable columns={channelColumns} rows={channels} rowKey={c => c.id} emptyMessage="No notification channels yet — add one so alert rules and escalation policies have somewhere to notify." />
        </div>
      )}

      {activeTab === 'escalations' && (
        <div>
          <div className="flex justify-end mb-3">
            <button onClick={() => setEscalationModalOpen(true)} className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-3 py-2">+ Create Escalation Policy</button>
          </div>
          <DataTable columns={escalationColumns} rows={escalations} rowKey={e => e.id} emptyMessage="No escalation policies yet." />
        </div>
      )}

      {activeTab === 'maintenance' && (
        <div>
          <div className="flex justify-end mb-3">
            <button onClick={() => setMaintenanceModalOpen(true)} className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-3 py-2">+ Schedule Maintenance Window</button>
          </div>
          <DataTable columns={maintenanceColumns} rows={maintenanceWindows} rowKey={w => w.id} emptyMessage="No maintenance windows scheduled." />
        </div>
      )}

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
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={ruleEnabled} onChange={e => setRuleEnabled(e.target.checked)} />
            <span className="text-slate-600 dark:text-slate-300">Enabled</span>
          </label>
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-300">Notification channels</span>
            {channels.length === 0 && <span className="text-xs text-slate-400">No channels yet — add one under the Notification Channels tab first.</span>}
            <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
              {channels.map(c => (
                <label key={c.id} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={ruleChannelIds.includes(c.id)}
                    onChange={e => setRuleChannelIds(prev => e.target.checked ? [...prev, c.id] : prev.filter(id => id !== c.id))}
                  />
                  {c.name} <span className="text-slate-400">({CHANNEL_TYPE_LABELS[c.channel_type] ?? c.channel_type})</span>
                </label>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-300">Condition (JSON, optional)</span>
            <textarea rows={3} value={ruleConditionText} onChange={e => { setRuleConditionText(e.target.value); setRuleError(''); }} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white font-mono text-xs" />
            {ruleError && <span className="text-xs text-red-500">{ruleError}</span>}
          </label>
          <button type="submit" className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium py-2 mt-1">Save Rule</button>
        </form>
      </Modal>

      <Modal open={channelModalOpen} onClose={() => setChannelModalOpen(false)} title="Add Notification Channel">
        <form onSubmit={createChannel} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-300">Channel name</span>
            <input required value={channelName} onChange={e => setChannelName(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-300">Type</span>
            <select value={channelType} onChange={e => setChannelType(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white">
              {CHANNEL_TYPES.map(t => <option key={t} value={t}>{CHANNEL_TYPE_LABELS[t]}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-300">{CHANNEL_TARGET_LABEL[channelType]}</span>
            <input required value={channelTarget} onChange={e => setChannelTarget(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={channelEnabled} onChange={e => setChannelEnabled(e.target.checked)} />
            <span className="text-slate-600 dark:text-slate-300">Enabled</span>
          </label>
          <button type="submit" className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium py-2 mt-1">Save Channel</button>
        </form>
      </Modal>

      <Modal open={escalationModalOpen} onClose={() => setEscalationModalOpen(false)} title="Create Escalation Policy">
        <form onSubmit={createEscalation} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-300">Policy name</span>
            <input required value={escalationName} onChange={e => setEscalationName(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white" />
          </label>
          <div className="flex flex-col gap-2 text-sm">
            <span className="text-slate-600 dark:text-slate-300">Steps</span>
            {channels.length === 0 && <span className="text-xs text-slate-400">No channels yet — add one under the Notification Channels tab first.</span>}
            {escalationSteps.map((step, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-slate-400 shrink-0">After</span>
                <input
                  type="number" min="0" value={step.afterMinutes}
                  onChange={e => updateEscalationStep(i, { afterMinutes: Number(e.target.value) || 0 })}
                  className="w-16 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-slate-900 dark:text-white text-xs"
                />
                <span className="text-xs text-slate-400 shrink-0">min, notify</span>
                <select
                  value={step.channelId}
                  onChange={e => updateEscalationStep(i, { channelId: e.target.value })}
                  className="flex-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-slate-900 dark:text-white text-xs"
                >
                  <option value="">Select channel…</option>
                  {channels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {escalationSteps.length > 1 && (
                  <button type="button" onClick={() => removeEscalationStep(i)} className="text-xs text-red-500 hover:underline shrink-0">Remove</button>
                )}
              </div>
            ))}
            <button type="button" onClick={addEscalationStep} className="text-xs text-brand-600 dark:text-brand-400 hover:underline self-start">+ Add step</button>
          </div>
          <button type="submit" className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium py-2 mt-1">Save Escalation Policy</button>
        </form>
      </Modal>

      <Modal open={maintenanceModalOpen} onClose={() => setMaintenanceModalOpen(false)} title="Schedule Maintenance Window">
        <form onSubmit={createMaintenanceWindow} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-300">Name</span>
            <input required value={maintenanceName} onChange={e => setMaintenanceName(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-300">Scope</span>
            <select value={maintenanceConnectionId} onChange={e => setMaintenanceConnectionId(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white">
              <option value="">All accounts</option>
              {connections.map(c => <option key={c.id} value={c.id}>{c.provider === 'gcp' ? 'GCP' : 'AWS'} — {c.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-300">Starts at</span>
            <input required type="datetime-local" value={maintenanceStart} onChange={e => setMaintenanceStart(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-300">Ends at</span>
            <input required type="datetime-local" value={maintenanceEnd} onChange={e => setMaintenanceEnd(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white" />
          </label>
          <button type="submit" className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium py-2 mt-1">Save Maintenance Window</button>
        </form>
      </Modal>

      {confirmDialog}
    </div>
  );
}
