import { useEffect, useState, useCallback, useMemo, type FormEvent } from 'react';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { StatCard } from '../components/StatCard';
import { Donut } from '../components/charts/Donut';
import { DataTable, type Column } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { useConfirm } from '../components/ConfirmDialog';
import { Icon } from '../components/icons';
import { useFilters } from '../lib/filterContext';
import { useTabParam } from '../lib/useTabParam';
import { useSubmenuAccess } from '../lib/useCanSeeSubmenu';
import { useToast } from '../lib/toast';
import {
  api, friendlyErrorMessage,
  type AlertRow, type AlertRule, type NotificationChannel, type EscalationPolicy, type MaintenanceWindow,
} from '../lib/api';

const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const STATUSES = ['open', 'acknowledged', 'in_progress', 'resolved'];
const CHANNEL_TYPES = ['email', 'slack', 'webhook', 'sms', 'pagerduty'];
const CHANNEL_TYPE_LABELS: Record<string, string> = { email: 'Email', slack: 'Slack', webhook: 'Webhook', sms: 'SMS', pagerduty: 'PagerDuty' };
const CHANNEL_TARGET_LABEL: Record<string, string> = {
  email: 'Email address', slack: 'Slack webhook URL', webhook: 'Webhook URL', sms: 'Phone number', pagerduty: 'PagerDuty integration key',
};

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
});

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : DATE_TIME_FORMATTER.format(date);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : DATE_FORMATTER.format(date);
}

function cleanText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

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
  const { toast } = useToast();

  const canSeeNavTab = useSubmenuAccess('alerts');
  const canSeeTab = useCallback((k: Tab) => canSeeNavTab(TABS.find(t => t.key === k)?.label ?? k), [canSeeNavTab]);
  const visibleTabs = TABS.filter(t => canSeeTab(t.key));
  const [activeTab, setActiveTab] = useTabParam<Tab>(TAB_KEYS, 'active');
  useEffect(() => {
    if (!canSeeTab(activeTab) && visibleTabs.length > 0) setActiveTab(visibleTabs[0].key);
  }, [activeTab, canSeeTab, visibleTabs, setActiveTab]);
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [everLoadedOk, setEverLoadedOk] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
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
      setEverLoadedOk(true);
    } catch (err) {
      const message = friendlyErrorMessage(err, 'Failed to load alerts.');
      setLoadError(message);
      if (everLoadedOk) toast(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [account, everLoadedOk, toast]);

  useEffect(() => { void load(); }, [load, refreshToken]);
  async function runAction(action: () => Promise<void>, errorMessage: string) {
    try {
      await action();
    } catch (err) {
      toast(friendlyErrorMessage(err, errorMessage), 'error');
    }
  }

  // ── Alerts ──────────────────────────────────────────────────────────────

  async function updateStatus(id: string, status: AlertRow['status']) {
    setBusyId(id);
    try {
      await runAction(async () => {
        await api.updateAlertStatus(id, status);
        await load();
      }, 'Failed to update alert status.');
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
  async function bulkUpdateStatus(status: AlertRow['status']) {
    setBulkBusy(true);
    try {
      const ids = [...selectedIds];
      const results = await Promise.allSettled(ids.map(id => api.updateAlertStatus(id, status)));
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      const succeeded = results.length - failed.length;
      if (failed.length === 0) {
        toast(`${succeeded} alert${succeeded === 1 ? '' : 's'} updated.`, 'success');
      } else if (succeeded === 0) {
        toast(`Failed to update ${failed.length} alert${failed.length === 1 ? '' : 's'}: ${friendlyErrorMessage(failed[0].reason, 'unknown error')}`, 'error');
      } else {
        toast(`${succeeded} of ${results.length} alerts updated — ${failed.length} failed: ${friendlyErrorMessage(failed[0].reason, 'unknown error')}`, 'error');
      }
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
    { key: 'triggered', header: 'Triggered At', render: a => formatDateTime(a.triggered_at), sortValue: a => a.triggered_at },
    { key: 'resolved', header: 'Resolved At', render: a => formatDateTime(a.resolved_at), sortValue: a => a.resolved_at ?? '' },
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

  const { bySeverity, byStatus } = useMemo(() => {
    const severity: Record<string, number> = {};
    const status: Record<string, number> = {};

    for (const alert of activeAlerts) {
      severity[alert.severity] = (severity[alert.severity] ?? 0) + 1;
      status[alert.status] = (status[alert.status] ?? 0) + 1;
    }

    return { bySeverity: severity, byStatus: status };
  }, [activeAlerts]);

  // ── Alert Rules ─────────────────────────────────────────────────────────

  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [ruleName, setRuleName] = useState('');
  const [ruleSeverity, setRuleSeverity] = useState('medium');
  const [ruleEnabled, setRuleEnabled] = useState(true);
  const [ruleChannelIds, setRuleChannelIds] = useState<string[]>([]);
  const [ruleEscalationPolicyId, setRuleEscalationPolicyId] = useState('');
  const [ruleConditionText, setRuleConditionText] = useState('{}');
  const [ruleError, setRuleError] = useState('');
  const [evaluating, setEvaluating] = useState(false);

  async function evaluateNow() {
    setEvaluating(true);
    try {
      const result = await api.evaluateAlertRules();
      toast(result.created > 0 ? `Evaluated ${result.evaluated} rule${result.evaluated === 1 ? '' : 's'} — ${result.created} new alert${result.created === 1 ? '' : 's'} created` : `Evaluated ${result.evaluated} rule${result.evaluated === 1 ? '' : 's'} — no new matches`, 'success');
    } catch (err) {
      toast(friendlyErrorMessage(err, 'Could not evaluate alert rules.'), 'error');
    } finally {
      setEvaluating(false);
    }
  }

  function resetRuleForm() {
    setRuleName(''); setRuleSeverity('medium'); setRuleEnabled(true); setRuleChannelIds([]); setRuleEscalationPolicyId(''); setRuleConditionText('{}'); setRuleError('');
  }

  async function createRule(e: FormEvent) {
    e.preventDefault();
    const name = cleanText(ruleName);

    if (!name) {
      setRuleError('Enter a name for this alert rule.');
      return;
    }

    let condition: unknown;
    if (ruleConditionText.trim()) {
      try { condition = JSON.parse(ruleConditionText); } catch { setRuleError('Condition must be valid JSON.'); return; }
    }
    await runAction(async () => {
      await api.createAlertRule({
        name,
        severity: ruleSeverity,
        enabled: ruleEnabled,
        notificationChannels: ruleChannelIds,
        escalationPolicyId: ruleEscalationPolicyId || null,
        condition,
      });
      setRuleModalOpen(false);
      resetRuleForm();
      await load();
    }, 'Failed to create alert rule.');
  }

  async function toggleRule(rule: AlertRule) {
    await runAction(async () => {
      await api.updateAlertRule(rule.id, { enabled: !rule.enabled });
      await load();
    }, 'Failed to update alert rule.');
  }

  async function deleteRule(id: string) {
    if (!(await confirm('Delete this alert rule?'))) return;
    await runAction(async () => {
      await api.deleteAlertRule(id);
      await load();
    }, 'Failed to delete alert rule.');
  }

  const ruleColumns: Column<AlertRule>[] = [
    { key: 'name', header: 'Name', render: r => r.name, sortValue: r => r.name },
    { key: 'severity', header: 'Severity', render: r => <Badge>{r.severity}</Badge>, sortValue: r => r.severity },
    { key: 'enabled', header: 'Enabled', render: r => <Badge tone={r.enabled ? 'good' : 'neutral'}>{r.enabled ? 'enabled' : 'disabled'}</Badge>, sortValue: r => (r.enabled ? 1 : 0) },
    { key: 'channels', header: 'Channels', render: r => String(Array.isArray(r.notification_channels) ? r.notification_channels.length : 0), sortValue: r => (Array.isArray(r.notification_channels) ? r.notification_channels.length : 0) },
    { key: 'created', header: 'Created', render: r => formatDate(r.created_at), sortValue: r => r.created_at },
    {
      key: 'actions', header: 'Actions', render: r => (
        <div className="flex gap-2 text-xs">
          <button type="button" onClick={e => { e.stopPropagation(); void toggleRule(r); }} className="text-brand-600 dark:text-brand-400 hover:underline">{r.enabled ? 'Disable' : 'Enable'}</button>
          <button type="button" onClick={e => { e.stopPropagation(); void deleteRule(r.id); }} className="text-red-500 hover:underline">Delete</button>
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

    const name = cleanText(channelName);
    const target = channelTarget.trim();

    if (!name || !target) {
      toast('Enter a channel name and destination.', 'error');
      return;
    }

    if (channelType === 'email' && !isValidEmail(target)) {
      toast('Enter a valid email address.', 'error');
      return;
    }

    if ((channelType === 'slack' || channelType === 'webhook') && !isValidUrl(target)) {
      toast('Enter a valid HTTP(S) webhook URL.', 'error');
      return;
    }

    await runAction(async () => {
      await api.createNotificationChannel({
        name,
        channelType,
        config: buildChannelConfig(channelType, target),
        enabled: channelEnabled,
      });
      setChannelModalOpen(false);
      resetChannelForm();
      await load();
    }, 'Failed to create notification channel.');
  }

  async function toggleChannel(channel: NotificationChannel) {
    await runAction(async () => {
      await api.updateNotificationChannel(channel.id, { enabled: !channel.enabled });
      await load();
    }, 'Failed to update notification channel.');
  }

  async function deleteChannel(id: string) {
    if (!(await confirm('Delete this notification channel? Alert rules or escalation policies referencing it will no longer be able to notify through it.'))) return;
    await runAction(async () => {
      await api.deleteNotificationChannel(id);
      await load();
    }, 'Failed to delete notification channel.');
  }

  const channelColumns: Column<NotificationChannel>[] = [
    { key: 'name', header: 'Name', render: c => c.name, sortValue: c => c.name },
    { key: 'type', header: 'Type', render: c => CHANNEL_TYPE_LABELS[c.channel_type] ?? c.channel_type, sortValue: c => c.channel_type },
    { key: 'enabled', header: 'Enabled', render: c => <Badge tone={c.enabled ? 'good' : 'neutral'}>{c.enabled ? 'enabled' : 'disabled'}</Badge>, sortValue: c => (c.enabled ? 1 : 0) },
    { key: 'created', header: 'Created', render: c => formatDate(c.created_at), sortValue: c => c.created_at },
    {
      key: 'actions', header: 'Actions', render: c => (
        <div className="flex gap-2 text-xs">
          <button type="button" onClick={e => { e.stopPropagation(); void toggleChannel(c); }} className="text-brand-600 dark:text-brand-400 hover:underline">{c.enabled ? 'Disable' : 'Enable'}</button>
          <button type="button" onClick={e => { e.stopPropagation(); void deleteChannel(c.id); }} className="text-red-500 hover:underline">Delete</button>
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

    const name = cleanText(escalationName);
    const steps = escalationSteps.filter(s => s.channelId);

    if (!name) {
      toast('Enter a policy name.', 'error');
      return;
    }

    if (steps.length === 0) {
      toast('Add at least one notification channel to the escalation policy.', 'error');
      return;
    }

    if (steps.some(step => !Number.isFinite(step.afterMinutes) || step.afterMinutes < 0)) {
      toast('Escalation delays must be zero or greater.', 'error');
      return;
    }

    await runAction(async () => {
      await api.createEscalationPolicy({ name, steps });
      setEscalationModalOpen(false);
      resetEscalationForm();
      await load();
    }, 'Failed to create escalation policy.');
  }

  async function deleteEscalation(id: string) {
    if (!(await confirm('Delete this escalation policy?'))) return;
    await runAction(async () => {
      await api.deleteEscalationPolicy(id);
      await load();
    }, 'Failed to delete escalation policy.');
  }

  const escalationColumns: Column<EscalationPolicy>[] = [
    { key: 'name', header: 'Name', render: e => e.name, sortValue: e => e.name },
    { key: 'steps', header: 'Steps', render: e => String(Array.isArray(e.steps) ? e.steps.length : 0), sortValue: e => (Array.isArray(e.steps) ? e.steps.length : 0) },
    { key: 'created', header: 'Created', render: e => formatDate(e.created_at), sortValue: e => e.created_at },
    {
      key: 'actions', header: 'Actions', render: e => (
        <div className="flex gap-2 text-xs">
          <button type="button" onClick={ev => { ev.stopPropagation(); void deleteEscalation(e.id); }} className="text-red-500 hover:underline">Delete</button>
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

    const name = cleanText(maintenanceName);
    if (!name || !maintenanceStart || !maintenanceEnd) {
      toast('Enter a name, start time, and end time.', 'error');
      return;
    }

    const start = new Date(maintenanceStart);
    const end = new Date(maintenanceEnd);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      toast('Enter valid maintenance window dates.', 'error');
      return;
    }

    if (end <= start) {
      toast('The end time must be after the start time.', 'error');
      return;
    }

    await runAction(async () => {
      await api.createMaintenanceWindow({
        name,
        connectionId: maintenanceConnectionId || undefined,
        startsAt: new Date(maintenanceStart).toISOString(),
        endsAt: new Date(maintenanceEnd).toISOString(),
      });
      setMaintenanceModalOpen(false);
      resetMaintenanceForm();
      await load();
    }, 'Failed to create maintenance window.');
  }

  async function deleteMaintenanceWindow(id: string) {
    if (!(await confirm('Delete this maintenance window?'))) return;
    await runAction(async () => {
      await api.deleteMaintenanceWindow(id);
      await load();
    }, 'Failed to delete maintenance window.');
  }

  function connectionName(id: string | null): string {
    if (!id) return 'All accounts';
    return connections.find(c => c.id === id)?.name ?? id;
  }

  const maintenanceColumns: Column<MaintenanceWindow>[] = [
    { key: 'name', header: 'Name', render: w => w.name, sortValue: w => w.name },
    { key: 'connection', header: 'Scope', render: w => connectionName(w.connection_id), sortValue: w => connectionName(w.connection_id) },
    { key: 'starts', header: 'Starts', render: w => formatDateTime(w.starts_at), sortValue: w => w.starts_at },
    { key: 'ends', header: 'Ends', render: w => formatDateTime(w.ends_at), sortValue: w => w.ends_at },
    {
      key: 'actions', header: 'Actions', render: w => (
        <div className="flex gap-2 text-xs">
          <button type="button" onClick={e => { e.stopPropagation(); void deleteMaintenanceWindow(w.id); }} className="text-red-500 hover:underline">Delete</button>
        </div>
      ),
    },
  ];

  if (loadError && !everLoadedOk) {
    return (
      <div>
        <FilterBar title="Alerts" breadcrumb={<Breadcrumb />} showRegionFilter={false} showDateFilter={false} />
        <div className="flex items-start gap-2.5 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm">
          <Icon name="alert-triangle" size={16} className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-red-800 dark:text-red-300 font-medium">Couldn't load alerts</p>
            <p className="text-red-700 dark:text-red-400 text-xs mt-0.5">{loadError}</p>
          </div>
          <button onClick={() => void load()} className="text-xs font-medium text-red-700 dark:text-red-300 hover:underline whitespace-nowrap shrink-0">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <FilterBar title="Alerts" breadcrumb={<Breadcrumb />} showRegionFilter={false} showDateFilter={false} />

      <div className="mb-5">
        <p className="max-w-3xl text-sm text-slate-500 dark:text-slate-400">
          Monitor active incidents, define alerting rules, manage notification delivery, and control maintenance windows from one place.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Active alerts" value={String(activeAlerts.length)} />
        {SEVERITIES.slice(0, 3).map((severity) => (
          <StatCard
            key={severity}
            label={`${severity.charAt(0).toUpperCase()}${severity.slice(1)}`}
            value={String(bySeverity[severity] ?? 0)}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Alerts by severity</h2>
            <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">Current active alerts grouped by severity.</p>
          </div>
          <Donut data={SEVERITIES.map(s => ({ label: s, value: bySeverity[s] ?? 0 })).filter(d => d.value > 0)} />
        </section>
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Alerts by status</h2>
            <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">Current lifecycle state of active alerts.</p>
          </div>
          <Donut data={STATUSES.map(s => ({ label: s, value: byStatus[s] ?? 0 })).filter(d => d.value > 0)} />
        </section>
      </div>

      <div className="flex flex-wrap gap-1 mb-4 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
        {visibleTabs.map(t => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={activeTab === t.key}
            onClick={() => setActiveTab(t.key)}
            className={`shrink-0 border-b-2 px-3 py-2 text-sm transition-colors ${
              activeTab === t.key
                ? 'border-brand-600 text-brand-600 dark:text-brand-400 font-medium'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
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
          {loading ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-12 text-center">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Loading alerts…</p>
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Fetching the latest alert state.</p>
            </div>
          ) : (
            <DataTable
              columns={alertColumns}
              rows={activeAlerts}
            rowKey={a => a.id}
              emptyMessage="No active alerts right now."
            />
          )}
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
          <div className="flex justify-end gap-2 mb-3">
            <button onClick={() => void evaluateNow()} disabled={evaluating} title="Evaluates every enabled rule against current CloudWatch alarm state and resource state right now, instead of waiting for the next Discover Resources run" className="rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-medium px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">
              {evaluating ? 'Evaluating…' : 'Evaluate Now'}
            </button>
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
            <span className="form-label">Rule name</span>
            <input required value={ruleName} onChange={e => setRuleName(e.target.value)} className="form-input w-full" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="form-label">Severity</span>
            <select value={ruleSeverity} onChange={e => setRuleSeverity(e.target.value)} className="form-input w-full">
              {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={ruleEnabled} onChange={e => setRuleEnabled(e.target.checked)} />
            <span className="form-label">Enabled</span>
          </label>
          <div className="flex flex-col gap-1 text-sm">
            <span className="form-label">Notification channels</span>
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
            <span className="form-label">Escalation policy (optional)</span>
            <select value={ruleEscalationPolicyId} onChange={e => setRuleEscalationPolicyId(e.target.value)} className="form-input w-full">
              <option value="">None — use the org-wide critical broadcast only</option>
              {escalations.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <p className="text-[11px] text-slate-400 leading-snug">
              When this rule fires, the policy's first step is notified immediately (Slack/webhook channels only — email/SMS/PagerDuty channels aren't wired to escalations yet). Timed escalation to later steps isn't built yet either; a policy currently applies its first step only.
            </p>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="form-label">Condition (JSON, optional)</span>
            <p className="text-[11px] text-slate-400 leading-snug">
              Two real, evaluated shapes — anything else saves fine but never fires:{' '}
              <code className="font-mono">{'{"type":"cloudwatch_alarm_state","state":"ALARM"}'}</code> (matches any CloudWatch alarm in this state; optionally add <code className="font-mono">namespace</code> or <code className="font-mono">alarmNameContains</code>), or{' '}
              <code className="font-mono">{'{"type":"resource_state","status":"stopped"}'}</code> (matches cloud_resources; combine with <code className="font-mono">resourceTypeKey</code>/<code className="font-mono">category</code>/<code className="font-mono">state</code> to narrow it — at least one field is required).
            </p>
            <textarea rows={3} value={ruleConditionText} onChange={e => { setRuleConditionText(e.target.value); setRuleError(''); }} className="form-input w-full min-h-24 font-mono text-xs" />
            {ruleError && <span className="text-xs text-red-500">{ruleError}</span>}
          </label>
          <button type="submit" className="btn-primary w-full justify-center mt-1">Save Rule</button>
        </form>
      </Modal>

      <Modal open={channelModalOpen} onClose={() => setChannelModalOpen(false)} title="Add Notification Channel">
        <form onSubmit={createChannel} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="form-label">Channel name</span>
            <input required value={channelName} onChange={e => setChannelName(e.target.value)} className="form-input w-full" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="form-label">Type</span>
            <select value={channelType} onChange={e => setChannelType(e.target.value)} className="form-input w-full">
              {CHANNEL_TYPES.map(t => <option key={t} value={t}>{CHANNEL_TYPE_LABELS[t]}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="form-label">{CHANNEL_TARGET_LABEL[channelType]}</span>
            <input required value={channelTarget} onChange={e => setChannelTarget(e.target.value)} className="form-input w-full" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={channelEnabled} onChange={e => setChannelEnabled(e.target.checked)} />
            <span className="form-label">Enabled</span>
          </label>
          <button type="submit" className="btn-primary w-full justify-center mt-1">Save Channel</button>
        </form>
      </Modal>

      <Modal open={escalationModalOpen} onClose={() => setEscalationModalOpen(false)} title="Create Escalation Policy">
        <form onSubmit={createEscalation} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="form-label">Policy name</span>
            <input required value={escalationName} onChange={e => setEscalationName(e.target.value)} className="form-input w-full" />
          </label>
          <div className="flex flex-col gap-2 text-sm">
            <span className="form-label">Steps</span>
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
                  className="form-select flex-1 text-xs"
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
          <button type="submit" className="btn-primary w-full justify-center mt-1">Save Escalation Policy</button>
        </form>
      </Modal>

      <Modal open={maintenanceModalOpen} onClose={() => setMaintenanceModalOpen(false)} title="Schedule Maintenance Window">
        <form onSubmit={createMaintenanceWindow} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="form-label">Name</span>
            <input required value={maintenanceName} onChange={e => setMaintenanceName(e.target.value)} className="form-input w-full" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="form-label">Scope</span>
            <select value={maintenanceConnectionId} onChange={e => setMaintenanceConnectionId(e.target.value)} className="form-input w-full">
              <option value="">All accounts</option>
              {connections.map(c => <option key={c.id} value={c.id}>{c.provider === 'gcp' ? 'GCP' : c.provider === 'azure' ? 'Azure' : 'AWS'} — {c.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="form-label">Starts at</span>
            <input required type="datetime-local" value={maintenanceStart} onChange={e => setMaintenanceStart(e.target.value)} className="form-input w-full" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="form-label">Ends at</span>
            <input required type="datetime-local" value={maintenanceEnd} onChange={e => setMaintenanceEnd(e.target.value)} className="form-input w-full" />
          </label>
          <button type="submit" className="btn-primary w-full justify-center mt-1">Save Maintenance Window</button>
        </form>
      </Modal>

      {confirmDialog}
    </div>
  );
}