import { useEffect, useState, useCallback, useMemo } from 'react';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { DataTable, type Column } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { StatCard } from '../components/StatCard';
import { Modal } from '../components/Modal';
import { useConfirm } from '../components/ConfirmDialog';
import { useTabParam } from '../lib/useTabParam';
import { useSubmenuAccess } from '../lib/useCanSeeSubmenu';
import { api, type Runbook, type Workflow, type ScheduledJob, type Webhook, type Integration, type AutomationExecution, type RemediationRequest } from '../lib/api';

type JiraConfigState = { siteUrl: string; email: string; defaultProjectKey: string | null; defaultIssueType: string; autoFileEvents: string[] };
const DISPATCH_EVENTS = ['cost.recommendation.high_priority', 'cost.anomaly.detected', 'remediation.completed', 'remediation.failed'] as const;

type Tab = 'runbooks' | 'workflows' | 'scheduled' | 'remediation' | 'webhooks' | 'integrations' | 'history';
const TAB_KEYS: Tab[] = ['runbooks', 'workflows', 'scheduled', 'remediation', 'webhooks', 'integrations', 'history'];
type Editable = Runbook | Workflow | ScheduledJob | Webhook;

// This page's tab keys are internal identifiers, not navConfig.ts's sidebar
// labels for the same items -- useSubmenuAccess keys off the label, so the
// two have to be bridged by hand.
const TAB_TO_NAV_LABEL: Record<Tab, string> = {
  runbooks: 'Runbooks', workflows: 'Workflows', scheduled: 'Scheduled Jobs', remediation: 'Remediation',
  webhooks: 'Webhooks', integrations: 'Integrations', history: 'Execution History',
};

export function Automation() {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const canSeeNavTab = useSubmenuAccess('automation');
  const canSeeTab = useCallback((t: Tab) => canSeeNavTab(TAB_TO_NAV_LABEL[t]), [canSeeNavTab]);
  const visibleTabs = TAB_KEYS.filter(canSeeTab);
  const [tab, setTab] = useTabParam<Tab>(TAB_KEYS, 'runbooks');
  useEffect(() => {
    if (!canSeeTab(tab) && visibleTabs.length > 0) setTab(visibleTabs[0]);
  }, [tab, canSeeTab, visibleTabs, setTab]);
  const [runbooks, setRunbooks] = useState<Runbook[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [scheduledJobs, setScheduledJobs] = useState<ScheduledJob[]>([]);
  const [remediation, setRemediation] = useState<RemediationRequest[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [history, setHistory] = useState<AutomationExecution[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Editable | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [jiraConnected, setJiraConnected] = useState(false);
  const [jiraConfig, setJiraConfig] = useState<JiraConfigState | null>(null);
  const [jiraForm, setJiraForm] = useState({ siteUrl: '', email: '', apiToken: '', defaultProjectKey: '', defaultIssueType: 'Task', autoFileEvents: [] as string[] });
  const [jiraSaving, setJiraSaving] = useState(false);
  const [jiraError, setJiraError] = useState<string | null>(null);

  const loadJira = useCallback(async () => {
    const res = await api.getJiraIntegration();
    setJiraConnected(res.connected);
    setJiraConfig(res.config ?? null);
    if (res.config) {
      setJiraForm(f => ({ ...f, siteUrl: res.config!.siteUrl, email: res.config!.email, defaultProjectKey: res.config!.defaultProjectKey ?? '', defaultIssueType: res.config!.defaultIssueType, autoFileEvents: res.config!.autoFileEvents, apiToken: '' }));
    }
  }, []);

  // Merges AWS's and GCP's remediation queues client-side (each provider's
  // requests are written by its own Worker, aws-accounts-api /
  // gcp-accounts-api, to the same remediation_requests table) — same
  // pattern as Issues.tsx's cross-service merge, not a shared backend
  // aggregation endpoint.
  const loadRemediation = useCallback(async () => {
    const [aws, gcp] = await Promise.all([api.listRemediation({}), api.listGcpRemediation({})]);
    setRemediation([...aws.items, ...gcp.items].sort((a, b) => b.created_at.localeCompare(a.created_at)));
  }, []);

  const load = useCallback(async () => {
    const [r, w, s, h, i, e] = await Promise.all([
      api.getRunbooks({ limit: 100 }), api.getWorkflows({ limit: 100 }), api.getScheduledJobs({ limit: 100 }),
      api.getWebhooks({ limit: 100 }), api.getAutomationIntegrations({ limit: 100 }), api.getExecutionHistory({ limit: 100 }),
    ]);
    setRunbooks(r.items); setWorkflows(w.items); setScheduledJobs(s.items);
    setWebhooks(h.items); setIntegrations(i.items); setHistory(e.items);
    await Promise.all([loadRemediation(), loadJira()]);
  }, [loadRemediation, loadJira]);

  useEffect(() => { void load(); }, [load]);

  async function handleApproveRemediation(row: RemediationRequest) { await (row.provider === 'gcp' ? api.approveGcpRemediation(row.id) : api.approveRemediation(row.id)); await loadRemediation(); }
  async function handleRejectRemediation(row: RemediationRequest) {
    if (!(await confirm('Reject this remediation request?'))) return;
    await (row.provider === 'gcp' ? api.rejectGcpRemediation(row.id) : api.rejectRemediation(row.id));
    await loadRemediation();
  }
  async function handleDryRunRemediation(row: RemediationRequest) { await (row.provider === 'gcp' ? api.dryRunGcpRemediation(row.id) : api.dryRunRemediation(row.id)); await loadRemediation(); }
  async function handleExecuteRemediation(row: RemediationRequest) {
    if (!(await confirm(`Execute this action for real against ${row.provider === 'gcp' ? 'GCP' : 'AWS'}? This calls a real mutating API using the account's own stored credentials — only Stop Instance can be automatically rolled back, and only on AWS.`))) return;
    await (row.provider === 'gcp' ? api.executeGcpRemediation(row.id) : api.executeRemediation(row.id));
    await loadRemediation();
  }
  async function handleRollbackRemediation(id: string) { await api.rollbackRemediation(id); await loadRemediation(); }

  // resize_instance's execute step can only ever safely issue StopInstances
  // and stop there (AWS's stop is itself asynchronous, and a Worker
  // invocation can't block waiting for it) — so any request sitting in
  // 'awaiting_stop' needs a caller to keep polling finish-resize until the
  // instance is confirmed stopped and the resize completes. Poll here
  // automatically so a request left mid-resize on this page still finishes
  // without the user having to click anything.
  // Joined into a stable string key (not the array itself) so this effect
  // doesn't tear down and rebuild its interval every 8s just because
  // loadRemediation() produces a new array reference each poll tick.
  const awaitingStopKey = useMemo(() => remediation.filter(r => r.status === 'awaiting_stop').map(r => r.id).join(','), [remediation]);
  useEffect(() => {
    if (!awaitingStopKey) return;
    const ids = awaitingStopKey.split(',');
    const interval = setInterval(() => {
      void Promise.all(ids.map(id => api.finishResizeRemediation(id).catch(() => null))).then(loadRemediation);
    }, 8000);
    return () => clearInterval(interval);
  }, [awaitingStopKey, loadRemediation]);

  function toggleAutoFileEvent(event: string) {
    setJiraForm(f => ({ ...f, autoFileEvents: f.autoFileEvents.includes(event) ? f.autoFileEvents.filter(e => e !== event) : [...f.autoFileEvents, event] }));
  }

  async function handleSaveJira(e: React.FormEvent) {
    e.preventDefault();
    setJiraSaving(true);
    setJiraError(null);
    try {
      await api.configureJira({
        siteUrl: jiraForm.siteUrl.trim(), email: jiraForm.email.trim(), apiToken: jiraForm.apiToken,
        defaultProjectKey: jiraForm.defaultProjectKey.trim() || undefined, defaultIssueType: jiraForm.defaultIssueType.trim() || undefined,
        autoFileEvents: jiraForm.autoFileEvents,
      });
      await loadJira();
    } catch (err) {
      setJiraError((err as Error).message);
    } finally {
      setJiraSaving(false);
    }
  }

  async function handleTestJira() {
    setJiraSaving(true);
    setJiraError(null);
    try {
      const res = await api.testJiraConnection();
      alert(res.verified ? `Verified — connected as ${res.verifiedAs ?? 'unknown user'}` : 'Verification failed');
      await loadJira();
    } catch (err) {
      setJiraError((err as Error).message);
    } finally {
      setJiraSaving(false);
    }
  }

  async function handleDeleteRunbook(id: string) { if (!(await confirm('Delete this runbook?'))) return; await api.deleteRunbook(id); await load(); }
  async function handleDeleteWorkflow(id: string) { if (!(await confirm('Delete this workflow?'))) return; await api.deleteWorkflow(id); await load(); }
  async function handleDeleteJob(id: string) { if (!(await confirm('Delete this scheduled job?'))) return; await api.deleteScheduledJob(id); await load(); }
  async function handleDeleteWebhook(id: string) { if (!(await confirm('Delete this webhook?'))) return; await api.deleteWebhook(id); await load(); }

  async function handleExecuteRunbook(id: string) { await api.executeRunbook(id); await load(); setTab('history'); }
  async function handleExecuteWorkflow(id: string) { await api.executeWorkflow(id); await load(); setTab('history'); }

  async function handleToggleWorkflow(w: Workflow) { await api.updateWorkflow(w.id, { enabled: !w.enabled }); await load(); }
  async function handleToggleJob(j: ScheduledJob) { await api.updateScheduledJob(j.id, { enabled: !j.enabled }); await load(); }
  async function handleToggleWebhook(w: Webhook) { await api.updateWebhook(w.id, { enabled: !w.enabled }); await load(); }

  function openEdit(item: Editable) { setEditing(item); setCreateOpen(true); }
  function closeModal() { setCreateOpen(false); setEditing(null); }

  const runbookColumns: Column<Runbook>[] = [
    { key: 'name', header: 'Name', render: r => r.name, sortValue: r => r.name },
    { key: 'category', header: 'Category', render: r => <Badge tone="neutral">{r.category}</Badge>, sortValue: r => r.category },
    { key: 'steps', header: 'Steps', render: r => Array.isArray(r.steps) ? r.steps.length : 0, sortValue: r => Array.isArray(r.steps) ? r.steps.length : 0 },
    { key: 'created', header: 'Created', render: r => new Date(r.created_at).toLocaleDateString(), sortValue: r => r.created_at },
    { key: 'actions', header: '', render: r => (
      <div className="flex gap-2 text-xs">
        <button onClick={e => { e.stopPropagation(); void handleExecuteRunbook(r.id); }} className="text-brand-600 dark:text-brand-400 hover:underline">Execute</button>
        <button onClick={e => { e.stopPropagation(); openEdit(r); }} className="text-slate-500 hover:underline">Edit</button>
        <button onClick={e => { e.stopPropagation(); void handleDeleteRunbook(r.id); }} className="text-red-500 hover:underline">Delete</button>
      </div>
    ) },
  ];

  const workflowColumns: Column<Workflow>[] = [
    { key: 'name', header: 'Name', render: w => w.name, sortValue: w => w.name },
    {
      key: 'enabled', header: 'Enabled', render: w => (
        <button onClick={e => { e.stopPropagation(); void handleToggleWorkflow(w); }} title="Click to toggle">
          <Badge tone={w.enabled ? 'good' : 'neutral'}>{w.enabled ? 'Enabled' : 'Disabled'}</Badge>
        </button>
      ), sortValue: w => (w.enabled ? 1 : 0),
    },
    { key: 'steps', header: 'Steps', render: w => Array.isArray(w.steps) ? w.steps.length : 0, sortValue: w => Array.isArray(w.steps) ? w.steps.length : 0 },
    { key: 'actions', header: '', render: w => (
      <div className="flex gap-2 text-xs">
        <button onClick={e => { e.stopPropagation(); void handleExecuteWorkflow(w.id); }} className="text-brand-600 dark:text-brand-400 hover:underline">Execute</button>
        <button onClick={e => { e.stopPropagation(); openEdit(w); }} className="text-slate-500 hover:underline">Edit</button>
        <button onClick={e => { e.stopPropagation(); void handleDeleteWorkflow(w.id); }} className="text-red-500 hover:underline">Delete</button>
      </div>
    ) },
  ];

  const jobColumns: Column<ScheduledJob>[] = [
    { key: 'name', header: 'Name', render: j => j.name, sortValue: j => j.name },
    { key: 'type', header: 'Type', render: j => j.job_type, sortValue: j => j.job_type },
    { key: 'cron', header: 'Schedule', render: j => <span className="font-mono text-xs">{j.schedule_cron}</span>, sortValue: j => j.schedule_cron },
    {
      key: 'enabled', header: 'Enabled', render: j => (
        <button onClick={e => { e.stopPropagation(); void handleToggleJob(j); }} title="Click to toggle">
          <Badge tone={j.enabled ? 'good' : 'neutral'}>{j.enabled ? 'Enabled' : 'Disabled'}</Badge>
        </button>
      ), sortValue: j => (j.enabled ? 1 : 0),
    },
    { key: 'nextRun', header: 'Next Run', render: j => j.next_run_at ? new Date(j.next_run_at).toLocaleString() : '—', sortValue: j => j.next_run_at ?? '' },
    { key: 'actions', header: '', render: j => (
      <div className="flex gap-2 text-xs">
        <button onClick={e => { e.stopPropagation(); openEdit(j); }} className="text-slate-500 hover:underline">Edit</button>
        <button onClick={e => { e.stopPropagation(); void handleDeleteJob(j.id); }} className="text-red-500 hover:underline">Delete</button>
      </div>
    ) },
  ];

  const webhookColumns: Column<Webhook>[] = [
    { key: 'name', header: 'Name', render: w => w.name, sortValue: w => w.name },
    { key: 'url', header: 'URL', render: w => <span className="font-mono text-xs truncate max-w-xs inline-block">{w.url}</span>, sortValue: w => w.url },
    { key: 'events', header: 'Events', render: w => w.events.join(', ') || '—', sortValue: w => w.events.join(',') },
    { key: 'platform', header: 'Format', render: w => <Badge tone="neutral">{w.platform === 'slack' ? 'Slack' : 'Generic JSON'}</Badge>, sortValue: w => w.platform },
    {
      key: 'enabled', header: 'Enabled', render: w => (
        <button onClick={e => { e.stopPropagation(); void handleToggleWebhook(w); }} title="Click to toggle">
          <Badge tone={w.enabled ? 'good' : 'neutral'}>{w.enabled ? 'Enabled' : 'Disabled'}</Badge>
        </button>
      ), sortValue: w => (w.enabled ? 1 : 0),
    },
    { key: 'actions', header: '', render: w => (
      <div className="flex gap-2 text-xs">
        <button onClick={async e => { e.stopPropagation(); const res = await api.triggerTestWebhook(w.id); alert(res.delivered ? `Delivered (HTTP ${res.httpStatus})` : `Failed: ${res.error ?? 'unknown error'}`); }} className="text-brand-600 dark:text-brand-400 hover:underline">Test</button>
        <button onClick={e => { e.stopPropagation(); openEdit(w); }} className="text-slate-500 hover:underline">Edit</button>
        <button onClick={e => { e.stopPropagation(); void handleDeleteWebhook(w.id); }} className="text-red-500 hover:underline">Delete</button>
      </div>
    ) },
  ];

  const integrationColumns: Column<Integration>[] = [
    { key: 'provider', header: 'Provider', render: i => i.provider_name, sortValue: i => i.provider_name },
    { key: 'category', header: 'Category', render: i => <Badge tone="neutral">{i.category}</Badge>, sortValue: i => i.category },
    { key: 'status', header: 'Status', render: i => <Badge>{i.status}</Badge>, sortValue: i => i.status },
    { key: 'actions', header: '', render: i => (
      <div className="flex gap-2 text-xs">
        {i.status !== 'connected' ? (
          <button onClick={async e => { e.stopPropagation(); await api.updateAutomationIntegration(i.id, { status: 'connected' }); await load(); }} className="text-brand-600 dark:text-brand-400 hover:underline">Connect</button>
        ) : (
          <button onClick={async e => { e.stopPropagation(); await api.updateAutomationIntegration(i.id, { status: 'disconnected' }); await load(); }} className="text-slate-500 hover:underline">Disconnect</button>
        )}
      </div>
    ) },
  ];

  const remediationColumns: Column<RemediationRequest>[] = [
    { key: 'provider', header: 'Provider', render: r => <Badge tone="neutral">{r.provider === 'gcp' ? 'GCP' : 'AWS'}</Badge>, sortValue: r => r.provider },
    {
      key: 'action', header: 'Action',
      render: r => <Badge tone="neutral">{r.action_type.replace(/_/g, ' ')}{r.action_type === 'resize_instance' && r.target_config?.targetInstanceType ? ` → ${r.target_config.targetInstanceType}` : ''}</Badge>,
      sortValue: r => r.action_type,
    },
    { key: 'target', header: 'Resource', render: r => <span className="font-mono text-xs">{r.target_resource_id}</span>, sortValue: r => r.target_resource_id },
    { key: 'region', header: 'Region', render: r => r.region ?? '—', sortValue: r => r.region ?? '' },
    {
      key: 'status', header: 'Status',
      render: r => <Badge tone={r.status === 'completed' ? 'good' : ['failed', 'dry_run_failed', 'rejected'].includes(r.status) ? 'critical' : r.status === 'awaiting_stop' || r.status === 'executing' ? 'warning' : 'neutral'}>{r.status.replace(/_/g, ' ')}</Badge>,
      sortValue: r => r.status,
    },
    {
      key: 'detail', header: 'Detail',
      render: r => <span className="text-xs text-slate-500 max-w-xs truncate inline-block">{r.status === 'awaiting_stop' ? 'Stopping instance — resize continues automatically once stopped' : r.dry_run_result?.reason ?? r.execution_result?.errorMessage ?? r.execution_result?.reason ?? '—'}</span>,
    },
    { key: 'created', header: 'Requested', render: r => new Date(r.created_at).toLocaleString(), sortValue: r => r.created_at },
    {
      key: 'actions', header: 'Actions', render: r => (
        <div className="flex gap-2 text-xs">
          {r.status === 'pending_approval' && (
            <>
              <button onClick={e => { e.stopPropagation(); void handleApproveRemediation(r); }} className="text-emerald-600 dark:text-emerald-400 hover:underline">Approve</button>
              <button onClick={e => { e.stopPropagation(); void handleRejectRemediation(r); }} className="text-red-500 hover:underline">Reject</button>
            </>
          )}
          {r.status === 'approved' && <button onClick={e => { e.stopPropagation(); void handleDryRunRemediation(r); }} className="text-brand-600 dark:text-brand-400 hover:underline">Dry Run</button>}
          {r.status === 'dry_run_passed' && <button onClick={e => { e.stopPropagation(); void handleExecuteRemediation(r); }} className="text-red-600 dark:text-red-400 hover:underline font-medium">Execute</button>}
          {/* Rollback only exists for AWS's stop_instance — GCP's remediation engine doesn't have a rollback route yet (see gcp-accounts-api/src/routes/remediation.ts's doc comment on scope). */}
          {r.status === 'completed' && r.provider !== 'gcp' && r.action_type === 'stop_instance' && <button onClick={e => { e.stopPropagation(); void handleRollbackRemediation(r.id); }} className="text-slate-500 hover:underline">Roll back</button>}
        </div>
      ),
    },
  ];

  const pendingApprovals = useMemo(() => remediation.filter(r => r.status === 'pending_approval').length, [remediation]);
  const enabledScheduled = useMemo(() => scheduledJobs.filter(j => j.enabled).length, [scheduledJobs]);
  const executionStats = useMemo(() => {
    const recent = history.filter(e => e.status === 'succeeded' || e.status === 'failed');
    const succeeded = recent.filter(e => e.status === 'succeeded').length;
    return { total: recent.length, rate: recent.length > 0 ? Math.round((succeeded / recent.length) * 100) : null };
  }, [history]);

  const historyColumns: Column<AutomationExecution>[] = [
    { key: 'type', header: 'Type', render: e => <Badge tone="neutral">{e.automation_type}</Badge>, sortValue: e => e.automation_type },
    { key: 'status', header: 'Status', render: e => <Badge>{e.status}</Badge>, sortValue: e => e.status },
    { key: 'error', header: 'Detail', render: e => <span className="text-xs text-slate-500 max-w-md truncate inline-block">{e.error_message ?? '—'}</span>, sortValue: e => e.error_message ?? '' },
    { key: 'started', header: 'Started', render: e => e.started_at ? new Date(e.started_at).toLocaleString() : '—', sortValue: e => e.started_at ?? '' },
  ];

  return (
    <div>
      <FilterBar title="Automation" breadcrumb={<Breadcrumb />} showAccountFilter={false} />

      <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 px-4 py-2.5 mb-4 text-xs text-amber-700 dark:text-amber-300">
        Runbooks and workflows can be defined and viewed, but the execution engine that actually runs them isn't built in this pass — "Execute" records a real, honest attempt in Execution History rather than pretending to run anything.
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Runbooks & Workflows" value={String(runbooks.length + workflows.length)} caption={`${workflows.filter(w => w.enabled).length} workflow${workflows.filter(w => w.enabled).length === 1 ? '' : 's'} enabled`} />
        <StatCard label="Pending Approvals" value={String(pendingApprovals)} caption={pendingApprovals > 0 ? 'needs review' : undefined} />
        <StatCard label="Scheduled Jobs" value={`${enabledScheduled} / ${scheduledJobs.length}`} caption="enabled" />
        <StatCard label="Execution Success Rate" value={executionStats.rate !== null ? `${executionStats.rate}%` : '—'} caption={executionStats.total > 0 ? `${executionStats.total} run${executionStats.total === 1 ? '' : 's'}` : 'no runs yet'} />
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 text-sm flex-wrap">
          {visibleTabs.map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-md ${tab === t ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
              {t === 'runbooks' ? 'Runbooks' : t === 'workflows' ? 'Workflows' : t === 'scheduled' ? 'Scheduled Jobs' : t === 'remediation' ? 'Remediation' : t === 'webhooks' ? 'Webhooks' : t === 'integrations' ? 'Integrations' : 'Execution History'}
            </button>
          ))}
        </div>
        {(tab === 'runbooks' || tab === 'workflows' || tab === 'scheduled' || tab === 'webhooks') && (
          <button onClick={() => { setEditing(null); setCreateOpen(true); }} className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-3 py-2">+ New</button>
        )}
      </div>

      {tab === 'runbooks' && <DataTable columns={runbookColumns} rows={runbooks} rowKey={r => r.id} emptyMessage="No runbooks yet." />}
      {tab === 'workflows' && <DataTable columns={workflowColumns} rows={workflows} rowKey={w => w.id} emptyMessage="No workflows yet." />}
      {tab === 'scheduled' && <DataTable columns={jobColumns} rows={scheduledJobs} rowKey={j => j.id} emptyMessage="No scheduled jobs yet." />}
      {tab === 'remediation' && (
        <>
          <p className="text-xs text-slate-400 mb-3">Requested from a resource's "Remediate" action (Cloud Accounts &gt; Resources). Approve/Execute require an admin or owner role; requests use the account's own stored AWS credentials — no platform-level access is involved.</p>
          <DataTable columns={remediationColumns} rows={remediation} rowKey={r => r.id} emptyMessage="No remediation requested yet." />
        </>
      )}
      {tab === 'webhooks' && <DataTable columns={webhookColumns} rows={webhooks} rowKey={w => w.id} emptyMessage="No webhooks yet." />}
      {tab === 'integrations' && (
        <div className="flex flex-col gap-5">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200">Jira</h3>
              <Badge tone={jiraConnected ? 'good' : 'neutral'}>{jiraConnected ? 'Connected' : 'Not connected'}</Badge>
            </div>
            <p className="text-xs text-slate-400 mb-3">Email + API token from your own Atlassian account (Account Settings &gt; Security &gt; API tokens) — no OAuth app needed. Verified against Jira before being saved.</p>
            <form onSubmit={e => void handleSaveJira(e)} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-600 dark:text-slate-300">Site URL</span>
                <input value={jiraForm.siteUrl} onChange={e => setJiraForm(f => ({ ...f, siteUrl: e.target.value }))} required placeholder="your-domain.atlassian.net" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-600 dark:text-slate-300">Email</span>
                <input value={jiraForm.email} onChange={e => setJiraForm(f => ({ ...f, email: e.target.value }))} required type="email" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-600 dark:text-slate-300">API Token</span>
                <input value={jiraForm.apiToken} onChange={e => setJiraForm(f => ({ ...f, apiToken: e.target.value }))} required={!jiraConnected} type="password" placeholder={jiraConnected ? 'Leave blank to keep current token' : ''} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-600 dark:text-slate-300">Default Project Key</span>
                <input value={jiraForm.defaultProjectKey} onChange={e => setJiraForm(f => ({ ...f, defaultProjectKey: e.target.value }))} placeholder="OPS" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white" />
              </label>
              <div className="sm:col-span-2 flex flex-col gap-1 text-sm">
                <span className="text-slate-600 dark:text-slate-300">Auto-file a Jira issue for:</span>
                <div className="flex flex-wrap gap-3">
                  {DISPATCH_EVENTS.map(event => (
                    <label key={event} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                      <input type="checkbox" checked={jiraForm.autoFileEvents.includes(event)} onChange={() => toggleAutoFileEvent(event)} />
                      {event}
                    </label>
                  ))}
                </div>
              </div>
              {jiraError && <p className="sm:col-span-2 text-sm text-red-500">{jiraError}</p>}
              <div className="sm:col-span-2 flex gap-2">
                <button type="submit" disabled={jiraSaving} className="rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium px-3 py-2">{jiraSaving ? 'Saving…' : 'Save & Verify'}</button>
                {jiraConnected && <button type="button" onClick={() => void handleTestJira()} disabled={jiraSaving} className="rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800">Test Connection</button>}
              </div>
            </form>
          </div>
          <DataTable columns={integrationColumns} rows={integrations.filter(i => i.provider_name !== 'jira')} rowKey={i => i.id} emptyMessage="No other integrations configured." />
        </div>
      )}
      {tab === 'history' && <DataTable columns={historyColumns} rows={history} rowKey={e => e.id} emptyMessage="No automation has run yet." />}

      <CreateModal
        tab={tab}
        open={createOpen}
        editing={editing}
        onClose={closeModal}
        onCreated={load}
        onWebhookSecret={setNewSecret}
      />

      {newSecret && (
        <Modal open onClose={() => setNewSecret(null)} title="Webhook secret (shown once)">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Copy this now — it won't be shown again. Used to verify delivery signatures.</p>
          <pre className="text-xs bg-slate-900 text-slate-200 rounded-lg p-3 overflow-auto break-all">{newSecret}</pre>
        </Modal>
      )}
      {confirmDialog}
    </div>
  );
}

function CreateModal({ tab, open, editing, onClose, onCreated, onWebhookSecret }: {
  tab: Tab; open: boolean; editing: Editable | null; onClose: () => void; onCreated: () => void; onWebhookSecret: (secret: string) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [cron, setCron] = useState('0 * * * *');
  const [jobType, setJobType] = useState('custom');
  const [url, setUrl] = useState('');
  const [platform, setPlatform] = useState<'generic' | 'slack'>('generic');
  const [events, setEvents] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const creatable = tab === 'runbooks' || tab === 'workflows' || tab === 'scheduled' || tab === 'webhooks';

  // Prefill from the item being edited (or reset to blank defaults for a new
  // one) whenever the modal is opened — covers both "+ New" and row "Edit".
  useEffect(() => {
    if (!open) return;
    if (editing && tab === 'runbooks') { const r = editing as Runbook; setName(r.name); setDescription(r.description ?? ''); }
    else if (editing && tab === 'workflows') { const w = editing as Workflow; setName(w.name); setDescription(w.description ?? ''); }
    else if (editing && tab === 'scheduled') { const j = editing as ScheduledJob; setName(j.name); setJobType(j.job_type); setCron(j.schedule_cron); }
    else if (editing && tab === 'webhooks') { const w = editing as Webhook; setName(w.name); setUrl(w.url); setPlatform(w.platform); setEvents(w.events); }
    else { setName(''); setDescription(''); setCron('0 * * * *'); setJobType('custom'); setUrl(''); setPlatform('generic'); setEvents([]); }
    setError(null);
  }, [open, editing, tab]);

  if (!creatable) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (editing) {
        if (tab === 'runbooks') await api.updateRunbook(editing.id, { name: name.trim(), description: description.trim() || undefined });
        else if (tab === 'workflows') await api.updateWorkflow(editing.id, { name: name.trim(), description: description.trim() || undefined });
        else if (tab === 'scheduled') await api.updateScheduledJob(editing.id, { name: name.trim(), jobType, scheduleCron: cron });
        else if (tab === 'webhooks') await api.updateWebhook(editing.id, { name: name.trim(), url: url.trim(), platform, events });
      } else {
        if (tab === 'runbooks') await api.createRunbook({ name: name.trim(), description: description.trim() || undefined });
        else if (tab === 'workflows') await api.createWorkflow({ name: name.trim(), description: description.trim() || undefined });
        else if (tab === 'scheduled') await api.createScheduledJob({ name: name.trim(), jobType, scheduleCron: cron });
        else if (tab === 'webhooks') {
          const { secret } = await api.createWebhook({ name: name.trim(), url: url.trim(), platform, events });
          onWebhookSecret(secret);
        }
      }
      setName(''); setDescription(''); setUrl('');
      onCreated();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const title = editing
    ? (tab === 'runbooks' ? 'Edit Runbook' : tab === 'workflows' ? 'Edit Workflow' : tab === 'scheduled' ? 'Edit Scheduled Job' : 'Edit Webhook')
    : (tab === 'runbooks' ? 'New Runbook' : tab === 'workflows' ? 'New Workflow' : tab === 'scheduled' ? 'New Scheduled Job' : 'New Webhook');

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-300">Name</span>
          <input value={name} onChange={e => setName(e.target.value)} required className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white" />
        </label>
        {(tab === 'runbooks' || tab === 'workflows') && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-300">Description (optional)</span>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white" />
          </label>
        )}
        {tab === 'scheduled' && (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600 dark:text-slate-300">Job Type</span>
              <select value={jobType} onChange={e => setJobType(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white">
                {['resource_scan', 'cost_sync', 'report_generation', 'remediation', 'custom'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600 dark:text-slate-300">Cron expression</span>
              <input value={cron} onChange={e => setCron(e.target.value)} required placeholder="0 * * * *" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-mono text-slate-900 dark:text-white" />
            </label>
            <p className="text-xs text-slate-400">Stored only — nothing triggers this on schedule yet in this build.</p>
          </>
        )}
        {tab === 'webhooks' && (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600 dark:text-slate-300">URL</span>
              <input value={url} onChange={e => setUrl(e.target.value)} required type="url" placeholder="https://example.com/hooks/cloudops360 or a Slack Incoming Webhook URL" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600 dark:text-slate-300">Payload format</span>
              <select value={platform} onChange={e => setPlatform(e.target.value as 'generic' | 'slack')} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white">
                <option value="generic">Generic JSON</option>
                <option value="slack">Slack (Incoming Webhook)</option>
              </select>
            </label>
            <div className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600 dark:text-slate-300">Fires on:</span>
              <div className="flex flex-wrap gap-3">
                {[...DISPATCH_EVENTS, '*'].map(event => (
                  <label key={event} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                    <input type="checkbox" checked={events.includes(event)} onChange={() => setEvents(ev => ev.includes(event) ? ev.filter(x => x !== event) : [...ev, event])} />
                    {event === '*' ? 'Everything' : event}
                  </label>
                ))}
              </div>
            </div>
          </>
        )}
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button type="submit" disabled={loading || !name.trim()} className="rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium py-2">
          {loading ? (editing ? 'Saving…' : 'Creating…') : (editing ? 'Save Changes' : 'Create')}
        </button>
      </form>
    </Modal>
  );
}
