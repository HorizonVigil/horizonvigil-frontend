import { useEffect, useState, useCallback } from 'react';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { DataTable, type Column } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { useConfirm } from '../components/ConfirmDialog';
import { useTabParam } from '../lib/useTabParam';
import { api, type Runbook, type Workflow, type ScheduledJob, type Webhook, type Integration, type AutomationExecution, type RemediationRequest } from '../lib/api';

type Tab = 'runbooks' | 'workflows' | 'scheduled' | 'remediation' | 'webhooks' | 'integrations' | 'history';
const TAB_KEYS: Tab[] = ['runbooks', 'workflows', 'scheduled', 'remediation', 'webhooks', 'integrations', 'history'];
type Editable = Runbook | Workflow | ScheduledJob | Webhook;

export function Automation() {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [tab, setTab] = useTabParam<Tab>(TAB_KEYS, 'runbooks');
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

  const loadRemediation = useCallback(async () => {
    const res = await api.listRemediation({});
    setRemediation(res.items);
  }, []);

  const load = useCallback(async () => {
    const [r, w, s, h, i, e] = await Promise.all([
      api.getRunbooks({ limit: 100 }), api.getWorkflows({ limit: 100 }), api.getScheduledJobs({ limit: 100 }),
      api.getWebhooks({ limit: 100 }), api.getAutomationIntegrations({ limit: 100 }), api.getExecutionHistory({ limit: 100 }),
    ]);
    setRunbooks(r.items); setWorkflows(w.items); setScheduledJobs(s.items);
    setWebhooks(h.items); setIntegrations(i.items); setHistory(e.items);
    await loadRemediation();
  }, [loadRemediation]);

  useEffect(() => { void load(); }, [load]);

  async function handleApproveRemediation(id: string) { await api.approveRemediation(id); await loadRemediation(); }
  async function handleRejectRemediation(id: string) { if (!(await confirm('Reject this remediation request?'))) return; await api.rejectRemediation(id); await loadRemediation(); }
  async function handleDryRunRemediation(id: string) { await api.dryRunRemediation(id); await loadRemediation(); }
  async function handleExecuteRemediation(id: string) {
    if (!(await confirm("Execute this action for real against AWS? This calls a real mutating API using the account's own stored credentials — only Stop Instance can be automatically rolled back."))) return;
    await api.executeRemediation(id);
    await loadRemediation();
  }
  async function handleRollbackRemediation(id: string) { await api.rollbackRemediation(id); await loadRemediation(); }

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
    { key: 'action', header: 'Action', render: r => <Badge tone="neutral">{r.action_type.replace(/_/g, ' ')}</Badge>, sortValue: r => r.action_type },
    { key: 'target', header: 'Resource', render: r => <span className="font-mono text-xs">{r.target_resource_id}</span>, sortValue: r => r.target_resource_id },
    { key: 'region', header: 'Region', render: r => r.region ?? '—', sortValue: r => r.region ?? '' },
    {
      key: 'status', header: 'Status',
      render: r => <Badge tone={r.status === 'completed' ? 'good' : ['failed', 'dry_run_failed', 'rejected'].includes(r.status) ? 'critical' : 'neutral'}>{r.status.replace(/_/g, ' ')}</Badge>,
      sortValue: r => r.status,
    },
    { key: 'detail', header: 'Detail', render: r => <span className="text-xs text-slate-500 max-w-xs truncate inline-block">{r.dry_run_result?.reason ?? r.execution_result?.errorMessage ?? r.execution_result?.reason ?? '—'}</span> },
    { key: 'created', header: 'Requested', render: r => new Date(r.created_at).toLocaleString(), sortValue: r => r.created_at },
    {
      key: 'actions', header: 'Actions', render: r => (
        <div className="flex gap-2 text-xs">
          {r.status === 'pending_approval' && (
            <>
              <button onClick={e => { e.stopPropagation(); void handleApproveRemediation(r.id); }} className="text-emerald-600 dark:text-emerald-400 hover:underline">Approve</button>
              <button onClick={e => { e.stopPropagation(); void handleRejectRemediation(r.id); }} className="text-red-500 hover:underline">Reject</button>
            </>
          )}
          {r.status === 'approved' && <button onClick={e => { e.stopPropagation(); void handleDryRunRemediation(r.id); }} className="text-brand-600 dark:text-brand-400 hover:underline">Dry Run</button>}
          {r.status === 'dry_run_passed' && <button onClick={e => { e.stopPropagation(); void handleExecuteRemediation(r.id); }} className="text-red-600 dark:text-red-400 hover:underline font-medium">Execute</button>}
          {r.status === 'completed' && r.action_type === 'stop_instance' && <button onClick={e => { e.stopPropagation(); void handleRollbackRemediation(r.id); }} className="text-slate-500 hover:underline">Roll back</button>}
        </div>
      ),
    },
  ];

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

      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 text-sm flex-wrap">
          {(['runbooks', 'workflows', 'scheduled', 'remediation', 'webhooks', 'integrations', 'history'] as Tab[]).map(t => (
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
          <p className="text-xs text-slate-400 mb-3">Requested from a resource's "Remediate" action (AWS Accounts &gt; Resources). Approve/Execute require an admin or owner role; requests use the account's own stored AWS credentials — no platform-level access is involved.</p>
          <DataTable columns={remediationColumns} rows={remediation} rowKey={r => r.id} emptyMessage="No remediation requested yet." />
        </>
      )}
      {tab === 'webhooks' && <DataTable columns={webhookColumns} rows={webhooks} rowKey={w => w.id} emptyMessage="No webhooks yet." />}
      {tab === 'integrations' && <DataTable columns={integrationColumns} rows={integrations} rowKey={i => i.id} emptyMessage="No integrations configured." />}
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
    else if (editing && tab === 'webhooks') { const w = editing as Webhook; setName(w.name); setUrl(w.url); }
    else { setName(''); setDescription(''); setCron('0 * * * *'); setJobType('custom'); setUrl(''); }
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
        else if (tab === 'webhooks') await api.updateWebhook(editing.id, { name: name.trim(), url: url.trim() });
      } else {
        if (tab === 'runbooks') await api.createRunbook({ name: name.trim(), description: description.trim() || undefined });
        else if (tab === 'workflows') await api.createWorkflow({ name: name.trim(), description: description.trim() || undefined });
        else if (tab === 'scheduled') await api.createScheduledJob({ name: name.trim(), jobType, scheduleCron: cron });
        else if (tab === 'webhooks') {
          const { secret } = await api.createWebhook({ name: name.trim(), url: url.trim() });
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
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-300">URL</span>
            <input value={url} onChange={e => setUrl(e.target.value)} required type="url" placeholder="https://example.com/hooks/cloudops360" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white" />
          </label>
        )}
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button type="submit" disabled={loading || !name.trim()} className="rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium py-2">
          {loading ? (editing ? 'Saving…' : 'Creating…') : (editing ? 'Save Changes' : 'Create')}
        </button>
      </form>
    </Modal>
  );
}
