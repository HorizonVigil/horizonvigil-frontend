import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { StatCard } from '../components/StatCard';
import { DataTable, type Column } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { Drawer } from '../components/Drawer';
import { useConfirm } from '../components/ConfirmDialog';
import { useFilters } from '../lib/filterContext';
import { api, type AdvisorWorkItem, type AdvisorWorkItemEvent, type AlertRow, type CloudConnection, type CloudResource, type CostRecommendation, type RemediationRequest, type ResourceLifecycleEvent, type ResourceMetric, type VulnerabilityFinding } from '../lib/api';
import { isVulnerabilityDataEnabled } from '../lib/featureFlags';
import { remediationActionLabel, remediationEligibility, remediationForIssue } from '../lib/issuesRemediation';
import { safeExternalUrl } from '../lib/safeUrl';
import { useToast } from '../lib/toast';

type Source = 'cost' | 'security' | 'alert';
type Severity = 'critical' | 'high' | 'medium' | 'low';
type Status = 'open' | 'in_progress' | 'resolved';
type Group = 'None' | 'Source' | 'Severity' | 'Status' | 'Account' | 'Environment' | 'Resource type';
type Tab = 'Overview' | 'Remediation' | 'Costs & metrics' | 'Owner & evidence' | 'Activities' | 'Related issues';
type RawIssue = CostRecommendation | VulnerabilityFinding | AlertRow;

interface Issue {
  id: string; nativeId: string; source: Source; title: string; detail: string; severity: Severity; status: Status;
  connectionId: string | null; account: string; environment: string; resourceId: string | null; resourceType: string;
  occurredAt: string; annualSavings: number | null; raw: RawIssue;
}

const labels: Record<Source, string> = { cost: 'Cost', security: 'Security', alert: 'Alert' };
const links: Record<Source, string> = { cost: '/finops?section=Cost+Optimization&tab=Recommendations', security: '/vulnerability-management', alert: '/alerts' };
const severityTone: Record<Severity, 'critical' | 'serious' | 'warning' | 'good'> = { critical: 'critical', high: 'serious', medium: 'warning', low: 'good' };
const statusTone: Record<Status, 'good' | 'warning' | 'neutral'> = { open: 'warning', in_progress: 'neutral', resolved: 'good' };
const groups: Group[] = ['None', 'Source', 'Severity', 'Status', 'Account', 'Environment', 'Resource type'];
const tabs: Tab[] = ['Overview', 'Remediation', 'Costs & metrics', 'Owner & evidence', 'Activities', 'Related issues'];
const text = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim() : null;
const human = (v: string | null | undefined) => v ? v.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Unavailable';
const date = (v: string, time = false) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? 'Unavailable' : time ? d.toLocaleString() : d.toLocaleDateString(); };
const governedSignalId = (issue: Issue) => issue.source === 'cost' ? `recommendation:${issue.nativeId}` : issue.source === 'alert' ? `alarm:${issue.nativeId}` : `security:${issue.nativeId}`;

function normalize(cost: CostRecommendation[], security: VulnerabilityFinding[], alerts: AlertRow[], accountRows: CloudConnection[]): Issue[] {
  const accountMap = new Map(accountRows.map(a => [a.id, a]));
  const accountName = (id: string | null) => !id ? 'No cloud account' : accountMap.get(id)?.connection_name || accountMap.get(id)?.aws_account_id || id;
  const environment = (id: string | null) => id ? accountMap.get(id)?.environment ?? 'Unknown' : 'Unknown';
  return [
    ...cost.map((r): Issue => ({ id: `cost:${r.id}`, nativeId: r.id, source: 'cost', title: r.issue, detail: r.recommended_action, severity: r.priority, status: r.status === 'open' ? 'open' : 'resolved', connectionId: r.connection_id, account: accountName(r.connection_id), environment: environment(r.connection_id), resourceId: r.resource_id, resourceType: r.category || 'Cost recommendation', occurredAt: r.created_at, annualSavings: r.potential_monthly_savings * 12, raw: r })),
    ...security.map((f): Issue => ({ id: `security:${f.id}`, nativeId: f.id, source: 'security', title: f.title, detail: f.description ?? '', severity: f.severity === 'informational' ? 'low' : f.severity, status: f.status === 'open' ? 'open' : 'resolved', connectionId: f.connection_id, account: accountName(f.connection_id), environment: f.environment || environment(f.connection_id), resourceId: f.resource_id || f.resource_arn, resourceType: f.asset_type || human(f.finding_source), occurredAt: f.discovered_at, annualSavings: null, raw: f })),
    ...alerts.map((a): Issue => ({ id: `alert:${a.id}`, nativeId: a.id, source: 'alert', title: a.alert_name, detail: text(a.metadata.description) || `${human(a.severity)} severity alert`, severity: a.severity, status: a.status === 'open' ? 'open' : a.status === 'resolved' ? 'resolved' : 'in_progress', connectionId: a.connection_id, account: accountName(a.connection_id), environment: text(a.metadata.environment) || environment(a.connection_id), resourceId: a.resource_id, resourceType: text(a.metadata.resource_type) || 'CloudWatch alarm', occurredAt: a.triggered_at, annualSavings: null, raw: a })),
  ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

export function Issues() {
  const { account, refreshToken } = useFilters();
  const { toast } = useToast();
  const { confirm, dialog } = useConfirm();
  const [url, setUrl] = useSearchParams();
  const [cost, setCost] = useState<CostRecommendation[]>([]), [security, setSecurity] = useState<VulnerabilityFinding[]>([]), [alerts, setAlerts] = useState<AlertRow[]>([]), [accountRows, setAccountRows] = useState<CloudConnection[]>([]);
  const [totals, setTotals] = useState({ cost: 0, security: 0, alert: 0 });
  const [loading, setLoading] = useState(true), [refreshing, setRefreshing] = useState(false), [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set()), [selected, setSelected] = useState<Issue | null>(null), [tab, setTab] = useState<Tab>('Overview');
  const [resource, setResource] = useState<CloudResource | null>(null), [metrics, setMetrics] = useState<ResourceMetric[]>([]), [activity, setActivity] = useState<ResourceLifecycleEvent[]>([]), [detailLoading, setDetailLoading] = useState(false), [activityType, setActivityType] = useState('all');
  const [remediation, setRemediation] = useState<RemediationRequest[]>([]);
  const [workItem, setWorkItem] = useState<AdvisorWorkItem | null>(null), [workEvents, setWorkEvents] = useState<AdvisorWorkItemEvent[]>([]);
  const [ownerDraft, setOwnerDraft] = useState(''), [ownerUserId, setOwnerUserId] = useState(''), [commentDraft, setCommentDraft] = useState(''), [mentionIds, setMentionIds] = useState('');
  const request = useRef(0), loaded = useRef(false);
  const get = (key: string, fallback = 'all') => url.get(key) ?? fallback;
  const set = useCallback((key: string, value: string, fallback = 'all') => setUrl(previous => { const next = new URLSearchParams(previous); if (!value || value === fallback) next.delete(key); else next.set(key, value); return next; }, { replace: true }), [setUrl]);

  const load = useCallback(async () => {
    const id = ++request.current; setError(null); setLoading(!loaded.current); setRefreshing(loaded.current);
    try {
      const connectionId = account === 'all' ? undefined : account;
      const wantSecurity = isVulnerabilityDataEnabled();
      const [c, s, a, accounts] = await Promise.all([
        api.getSavingsOpportunities({ connectionId, status: 'open', limit: 200 }),
        wantSecurity ? api.getFindings({ connection_id: connectionId, status: 'open', limit: 200 }) : Promise.resolve({ items: [], pagination: { total: 0 } }),
        api.getActiveAlerts({ connection_id: connectionId, limit: 200 }), api.getAccounts({ limit: 200 }),
      ]);
      if (id !== request.current) return;
      setCost(c.items); setSecurity(s.items); setAlerts(a.items); setAccountRows(accounts.items); setTotals({ cost: c.pagination.total, security: s.pagination.total, alert: a.pagination.total }); loaded.current = true;
    } catch (e) { if (id === request.current) setError(e instanceof Error ? e.message : 'Could not load issues.'); }
    finally { if (id === request.current) { setLoading(false); setRefreshing(false); } }
  }, [account]);
  useEffect(() => { void load(); }, [load, refreshToken]);

  const all = useMemo(() => normalize(cost, security, alerts, accountRows), [cost, security, alerts, accountRows]);
  const query = get('search', ''), source = get('source'), severity = get('severity'), status = get('status'), accountFilter = get('account'), env = get('environment'), type = get('resourceType');
  const group = (groups.includes(get('groupBy', 'None') as Group) ? get('groupBy', 'None') : 'None') as Group, view = get('view', 'list') === 'cards' ? 'cards' : 'list';
  const filtered = useMemo(() => all.filter(i => (!query.trim() || [i.title, i.detail, i.account, i.resourceId, i.resourceType].some(v => v?.toLowerCase().includes(query.toLowerCase()))) && (source === 'all' || i.source === source) && (severity === 'all' || i.severity === severity) && (status === 'all' || i.status === status) && (accountFilter === 'all' || i.connectionId === accountFilter) && (env === 'all' || i.environment === env) && (type === 'all' || i.resourceType === type)), [all, query, source, severity, status, accountFilter, env, type]);
  const groupName = useCallback((i: Issue) => group === 'Source' ? labels[i.source] : group === 'Severity' ? human(i.severity) : group === 'Status' ? human(i.status) : group === 'Account' ? i.account : group === 'Environment' ? i.environment : group === 'Resource type' ? i.resourceType : '', [group]);
  const grouped = useMemo(() => { if (group === 'None') return [{ label: '', rows: filtered }]; const map = new Map<string, Issue[]>(); for (const i of filtered) map.set(groupName(i), [...(map.get(groupName(i)) ?? []), i]); return [...map].map(([label, rows]) => ({ label, rows })).sort((a, b) => b.rows.length - a.rows.length); }, [filtered, group, groupName]);
  const environments = [...new Set(all.map(i => i.environment))].sort(), types = [...new Set(all.map(i => i.resourceType))].sort();

  const loadDetail = useCallback(async (issue: Issue) => {
    setDetailLoading(true); setResource(null); setMetrics([]); setActivity([]); setRemediation([]); setWorkItem(null); setWorkEvents([]); setOwnerDraft(''); setOwnerUserId(''); setCommentDraft(''); setMentionIds('');
    await Promise.all([
      issue.resourceId ? api.getResource(issue.resourceId).then(setResource).catch(() => undefined) : Promise.resolve(),
      issue.resourceId ? api.getMetrics({ resourceId: issue.resourceId, limit: 200 }).then(r => setMetrics(r.items)).catch(() => undefined) : Promise.resolve(),
      issue.connectionId ? api.getResourceTimeline({ connectionId: issue.connectionId, limit: 200 }).then(r => setActivity(r.items.filter(e => !issue.resourceId || e.resource_id === issue.resourceId || e.aws_resource_id === issue.resourceId))).catch(() => undefined) : Promise.resolve(),
      issue.source === 'cost' && issue.connectionId ? api.listRemediation({ connectionId: issue.connectionId }).then(r => setRemediation(r.items)).catch(() => undefined) : Promise.resolve(),
      api.getAdvisorWorkItems().then(async result => {
        const item = result.items.find(candidate => candidate.signal_id === governedSignalId(issue)) ?? null;
        setWorkItem(item); setOwnerDraft(item?.owner === 'unassigned' ? '' : item?.owner ?? '');
        if (item) setWorkEvents((await api.getAdvisorWorkItemEvents(item.id)).events);
      }).catch(() => undefined),
    ]); setDetailLoading(false);
  }, []);
  const open = useCallback((issue: Issue) => { setSelected(issue); setTab('Overview'); setActivityType('all'); set('id', issue.id, ''); void loadDetail(issue); }, [loadDetail, set]);
  const close = () => { setSelected(null); setResource(null); setMetrics([]); setActivity([]); setRemediation([]); setWorkItem(null); setWorkEvents([]); set('id', '', ''); };
  useEffect(() => { const id = url.get('id'); const issue = id ? all.find(i => i.id === id) : null; if (issue && selected?.id !== issue.id) open(issue); }, [all, open, selected?.id, url]);

  async function mutate(issue: Issue, action: 'resolve' | 'progress' | 'suppress' | 'apply' | 'dismiss' | 'exclude') {
    setBusy(true);
    try {
      if (issue.source === 'cost') {
        if (action === 'exclude') await api.excludeSavingsOpportunity(issue.nativeId, { reason: 'temporary_workload', duration: '30d', justification: 'Excluded from unified Issues.' });
        else if (action === 'apply' || action === 'dismiss') await api.updateSavingsOpportunity(issue.nativeId, action === 'apply' ? 'applied' : 'dismissed'); else throw new Error('Unsupported cost action.');
      } else if (issue.source === 'security') {
        if (action !== 'resolve' && action !== 'suppress') throw new Error('Unsupported security action.');
        await api.updateFindingStatus(issue.nativeId, action === 'resolve' ? 'resolved' : 'suppressed', 'Updated from unified Issues.');
      } else { if (action !== 'resolve' && action !== 'progress') throw new Error('Unsupported alert action.'); await api.updateAlertStatus(issue.nativeId, action === 'resolve' ? 'resolved' : 'in_progress'); }
      toast('Issue updated.', 'success'); close(); await load();
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not update issue.', 'error'); } finally { setBusy(false); }
  }
  async function bulkResolve() {
    const rows = all.filter(i => selectedKeys.has(i.id)), sec = rows.filter(i => i.source === 'security'), al = rows.filter(i => i.source === 'alert'); setBusy(true);
    try { await Promise.all([sec.length ? api.bulkUpdateFindingStatus(sec.map(i => i.nativeId), 'resolved', 'Bulk resolved from unified Issues.') : Promise.resolve(), ...al.map(i => api.updateAlertStatus(i.nativeId, 'resolved'))]); const skipped = rows.length - sec.length - al.length; toast(`${sec.length + al.length} resolved.${skipped ? ` ${skipped} cost decision(s) left unchanged.` : ''}`, skipped ? 'info' : 'success'); setSelectedKeys(new Set()); await load(); } catch (e) { toast(e instanceof Error ? e.message : 'Bulk update failed.', 'error'); } finally { setBusy(false); }
  }

  async function refreshRemediation(connectionId: string) {
    const result = await api.listRemediation({ connectionId });
    setRemediation(result.items);
  }

  async function remediationAction(action: 'request' | 'approve' | 'reject' | 'dry-run' | 'execute' | 'rollback', row?: RemediationRequest) {
    if (!selected || !costItem || !selected.connectionId) return;
    if (action === 'request' && (!resource || !eligibility.action)) return;
    if ((action === 'execute' || action === 'rollback') && !(await confirm(action === 'execute'
      ? 'Execute this approved action against the connected AWS account? The live AWS state and permissions will be checked again. Only a stopped EC2 instance can be automatically rolled back.'
      : 'Request rollback of this completed action? Rollback is supported only for eligible stop-instance actions.'))) return;
    setBusy(true);
    try {
      if (action === 'request' && resource && eligibility.action) {
        await api.requestRemediation({ connectionId: selected.connectionId, resourceId: resource.id, actionType: eligibility.action, recommendationId: costItem.id, targetConfig: eligibility.targetConfig });
      } else if (row) {
        if (action === 'approve') await api.approveRemediation(row.id);
        else if (action === 'reject') await api.rejectRemediation(row.id);
        else if (action === 'dry-run') await api.dryRunRemediation(row.id);
        else if (action === 'execute') await api.executeRemediation(row.id);
        else if (action === 'rollback') await api.rollbackRemediation(row.id);
      }
      await refreshRemediation(selected.connectionId);
      toast(action === 'request' ? 'Governed remediation requested. Approval and a successful live dry-run are required before execution.' : `Remediation ${action} completed.`, 'success');
    } catch (e) { toast(e instanceof Error ? e.message : `Could not ${action} remediation.`, 'error'); }
    finally { setBusy(false); }
  }

  async function startGovernance() {
    if (!selected) return;
    setBusy(true);
    try {
      const item = await api.createAdvisorWorkItem({ signalId: governedSignalId(selected), owner: ownerDraft || undefined });
      setWorkItem(item); setOwnerDraft(item.owner === 'unassigned' ? '' : item.owner); setWorkEvents((await api.getAdvisorWorkItemEvents(item.id)).events);
      toast('Governed workflow started with an accountable deadline and append-only history.', 'success');
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not start governance.', 'error'); } finally { setBusy(false); }
  }

  async function saveOwner() {
    if (!workItem || !ownerDraft.trim()) return;
    setBusy(true);
    try {
      const item = await api.assignAdvisorWorkItem(workItem.id, { owner: ownerDraft.trim(), ownerUserId: ownerUserId.trim() || null });
      setWorkItem(item); setWorkEvents((await api.getAdvisorWorkItemEvents(item.id)).events); toast('Accountable owner updated and audited.', 'success');
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not assign owner.', 'error'); } finally { setBusy(false); }
  }

  async function addComment() {
    if (!workItem || !commentDraft.trim()) return;
    setBusy(true);
    try {
      const ids = mentionIds.split(',').map(value => value.trim()).filter(Boolean);
      await api.addAdvisorWorkItemComment(workItem.id, { comment: commentDraft.trim(), mentionUserIds: ids });
      setCommentDraft(''); setMentionIds(''); setWorkEvents((await api.getAdvisorWorkItemEvents(workItem.id)).events); toast('Comment added to append-only history.', 'success');
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not add comment.', 'error'); } finally { setBusy(false); }
  }

  const columns: Column<Issue>[] = [
    { key: 'source', header: 'Source', render: i => <Badge tone="neutral">{labels[i.source]}</Badge>, sortValue: i => i.source },
    { key: 'issue', header: 'Issue', sticky: true, render: i => <span className="inline-block max-w-md truncate font-medium">{i.title}</span>, sortValue: i => i.title },
    { key: 'account', header: 'Account', render: i => i.account, sortValue: i => i.account }, { key: 'type', header: 'Resource type', render: i => i.resourceType, sortValue: i => i.resourceType },
    { key: 'environment', header: 'Environment', render: i => i.environment, sortValue: i => i.environment }, { key: 'severity', header: 'Severity', render: i => <Badge tone={severityTone[i.severity]}>{i.severity}</Badge>, sortValue: i => i.severity },
    { key: 'status', header: 'Status', render: i => <Badge tone={statusTone[i.status]}>{human(i.status)}</Badge>, sortValue: i => i.status },
    { key: 'savings', header: 'Potential savings', render: i => i.annualSavings == null ? '—' : `$${Math.round(i.annualSavings).toLocaleString()}/yr`, sortValue: i => i.annualSavings ?? 0 },
    { key: 'detected', header: 'Detected', render: i => date(i.occurredAt), sortValue: i => i.occurredAt },
  ];
  const high = all.filter(i => i.severity === 'critical' || i.severity === 'high').length, savings = all.reduce((sum, i) => sum + (i.annualSavings ?? 0), 0);
  const related = selected ? all.filter(i => i.id !== selected.id && ((selected.resourceId && i.resourceId === selected.resourceId) || (selected.connectionId && i.connectionId === selected.connectionId))).slice(0, 20) : [];
  const costItem = selected?.source === 'cost' ? selected.raw as CostRecommendation : null, finding = selected?.source === 'security' ? selected.raw as VulnerabilityFinding : null, alert = selected?.source === 'alert' ? selected.raw as AlertRow : null;
  const eligibility = costItem ? remediationEligibility(costItem, resource) : { action: null, reason: 'Not a cost recommendation.' };
  const issueRemediation = costItem ? remediationForIssue(remediation, costItem.id, resource?.id ?? selected?.resourceId ?? null) : [];
  const remediationRequest = issueRemediation[0] ?? null;
  const canRequestRemediation = !remediationRequest || ['rejected', 'dry_run_failed', 'failed', 'rolled_back'].includes(remediationRequest.status);
  const activityTypes = [...new Set(activity.map(a => a.event_type))].sort(), visibleActivity = activityType === 'all' ? activity : activity.filter(a => a.event_type === activityType);
  const metricSummary = [...new Set(metrics.map(m => m.metric_name))].map(name => { const values = metrics.filter(m => m.metric_name === name).map(m => m.value); return { name, avg: values.reduce((a, b) => a + b, 0) / values.length, max: Math.max(...values), count: values.length }; });

  return <div>
    <FilterBar title="Issues" breadcrumb={<Breadcrumb />} showRegionFilter={false} showDateFilter={false} />
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-lg font-semibold">Decision and remediation queue</h1><p className="text-xs text-slate-500">Live cost, security, and operations evidence. No sample issues are generated.</p></div><button type="button" onClick={() => void load()} disabled={loading || refreshing} className="btn-secondary text-xs">{refreshing ? 'Refreshing…' : 'Refresh'}</button></div>
    {error && <div role="alert" className="mb-4 rounded-lg border border-amber-300 p-3 text-xs text-amber-700">Couldn’t refresh issue feeds: {error}</div>}
    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5"><StatCard label="Total open" value={String(totals.cost + totals.security + totals.alert)} /><StatCard label="High + critical" value={String(high)} /><StatCard label="Cost recommendations" value={String(totals.cost)} /><StatCard label="Security + alerts" value={String(totals.security + totals.alert)} /><StatCard label="Potential annual savings" value={savings ? `$${Math.round(savings).toLocaleString()}` : '—'} /></div>
    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"><div className="flex flex-wrap gap-2"><input aria-label="Search issues" value={query} onChange={e => set('search', e.target.value, '')} placeholder="Search issue, account, resource…" className="min-w-56 rounded-md border px-2 py-1.5 text-xs dark:bg-slate-950" />
      <Select label="Source" value={source} set={v => set('source', v)} options={[['all', 'All sources'], ['cost', 'Cost'], ['security', 'Security'], ['alert', 'Alerts']]} /><Select label="Severity" value={severity} set={v => set('severity', v)} options={[['all', 'All severities'], ['critical', 'Critical'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']]} /><Select label="Status" value={status} set={v => set('status', v)} options={[['all', 'All statuses'], ['open', 'Open'], ['in_progress', 'In progress'], ['resolved', 'Resolved']]} />
      <Select label="Account" value={accountFilter} set={v => set('account', v)} options={[['all', 'All accounts'], ...accountRows.map(a => [a.id, a.connection_name || a.aws_account_id] as [string, string])]} /><Select label="Environment" value={env} set={v => set('environment', v)} options={[['all', 'All environments'], ...environments.map(v => [v, v] as [string, string])]} /><Select label="Resource type" value={type} set={v => set('resourceType', v)} options={[['all', 'All resource types'], ...types.map(v => [v, v] as [string, string])]} />
      <span className="ml-auto" /><Select label="Group by" value={group} set={v => set('groupBy', v, 'None')} options={groups.map(v => [v, v])} /><button type="button" onClick={() => set('view', view === 'list' ? 'cards' : 'list', 'list')} className="btn-secondary text-xs">{view === 'list' ? 'Card view' : 'List view'}</button></div></div>
    {selectedKeys.size > 0 && <div className="mb-3 flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 p-2 text-xs dark:border-brand-900 dark:bg-brand-950/20"><strong>{selectedKeys.size} selected</strong><button type="button" disabled={busy} onClick={() => void bulkResolve()} className="btn-secondary text-xs">Resolve supported</button><button type="button" onClick={() => setSelectedKeys(new Set())}>Clear</button><span className="text-slate-500">Cost decisions require individual evidence review.</span></div>}
    {loading ? <div className="rounded-xl border p-10 text-center text-slate-400">Loading live issue feeds…</div> : grouped.map(g => <section key={g.label || 'all'} className="mb-5">{g.label && <h2 className="mb-2 text-xs font-semibold uppercase text-slate-500">{g.label} ({g.rows.length})</h2>}{view === 'list' ? <DataTable tableId="issues-workspace" columns={columns} rows={g.rows} rowKey={i => i.id} onRowClick={open} selectable selectedKeys={selectedKeys} onSelectionChange={setSelectedKeys} emptyMessage="No live issues match these filters." /> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{g.rows.map(i => <Card key={i.id} issue={i} selected={selectedKeys.has(i.id)} select={() => { const n = new Set(selectedKeys); if (n.has(i.id)) n.delete(i.id); else n.add(i.id); setSelectedKeys(n); }} open={() => open(i)} />)}</div>}</section>)}
    {(cost.length >= 200 || security.length >= 200 || alerts.length >= 200) && <p className="text-[11px] text-slate-400">Each source is capped at 200 rows here. Counts use server totals; source modules hold the complete feed.</p>}

    <Drawer open={!!selected} onClose={close} title={selected?.title ?? 'Issue detail'} wide>{selected && <div className="space-y-4 text-sm">
      <div className="flex flex-wrap gap-2"><Badge tone="neutral">{labels[selected.source]}</Badge><Badge tone={severityTone[selected.severity]}>{selected.severity}</Badge><Badge tone={statusTone[selected.status]}>{human(selected.status)}</Badge>{selected.annualSavings != null && <strong className="ml-auto text-emerald-600">${Math.round(selected.annualSavings).toLocaleString()}/yr potential</strong>}</div>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void loadDetail(selected)} className="btn-secondary text-xs">{detailLoading ? 'Refreshing…' : 'Refresh evidence'}</button><button type="button" onClick={() => void navigator.clipboard.writeText(window.location.href).then(() => toast('Link copied.', 'success'))} className="btn-secondary text-xs">Copy link</button><Link target="_blank" to={`/issues?id=${encodeURIComponent(selected.id)}`} className="btn-secondary text-xs">Open new tab</Link><Link to={links[selected.source]} className="btn-secondary text-xs">Source module</Link></div>
      <div className="flex overflow-x-auto border-b" role="tablist">{tabs.map(t => <button key={t} type="button" onClick={() => setTab(t)} aria-selected={tab === t} className={`whitespace-nowrap border-b-2 px-2 py-2 text-xs ${tab === t ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500'}`}>{t}{t === 'Related issues' && related.length ? ` (${related.length})` : ''}</button>)}</div>
      {tab === 'Overview' && <><p className="whitespace-pre-wrap">{selected.detail || 'No description supplied by the source.'}</p><Grid rows={[["Account", selected.account], ['Environment', selected.environment], ['Resource type', resource?.resource_type_key || selected.resourceType], ['Resource', resource?.resource_id || selected.resourceId || 'Unavailable'], ['Region', resource?.region || finding?.region || text(alert?.metadata.region) || 'Unavailable'], ['Detected', date(selected.occurredAt, true)], ['Last observed', resource?.last_seen_at ? date(resource.last_seen_at, true) : finding?.last_seen_at ? date(finding.last_seen_at, true) : 'Unavailable'], ['Evidence', detailLoading ? 'Loading' : resource || metrics.length || activity.length ? 'Available' : 'No additional evidence returned']]} /></>}
      {tab === 'Remediation' && <div className="space-y-3">{costItem && <><Callout title="Recommended action">{costItem.recommended_action}</Callout><Grid rows={[["Validity", human(costItem.validity)], ['Reason', costItem.validity_reason || 'Unavailable'], ['Confidence', costItem.confidence == null ? 'Unavailable' : `${Math.round(costItem.confidence * 100)}%`], ['Evidence window', costItem.evidence_window_days == null ? 'Unavailable' : `${costItem.evidence_window_days} days`]]} /><Callout title="Governed AWS action">{eligibility.reason}</Callout>{canRequestRemediation && eligibility.action && <button disabled={busy || detailLoading} onClick={() => void remediationAction('request')} className="btn-primary text-xs">Request {remediationActionLabel[eligibility.action]}</button>}{remediationRequest && <RemediationLifecycle row={remediationRequest} busy={busy} act={remediationAction} />}{issueRemediation.length > 1 && <p className="text-xs text-slate-500">{issueRemediation.length - 1} earlier remediation request(s) remain in the immutable history.</p>}<div className="flex flex-wrap gap-2"><button disabled={busy} onClick={() => void mutate(selected, 'apply')} className="btn-secondary text-xs">Mark applied</button><button disabled={busy} onClick={() => void mutate(selected, 'dismiss')} className="btn-secondary text-xs">Dismiss</button><button disabled={busy} onClick={() => void mutate(selected, 'exclude')} className="btn-secondary text-xs">Exclude 30 days</button></div></>}{finding && <><Callout title="Security solution">{finding.remediation_link ? 'Follow the source guidance, re-scan, and resolve only after fresh evidence confirms the finding is absent.' : 'No remediation link was supplied. Review source evidence before changing the resource.'}</Callout>{safeExternalUrl(finding.remediation_link) && <a href={safeExternalUrl(finding.remediation_link)!} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">Open remediation guidance ↗</a>}<div className="flex gap-2"><button disabled={busy} onClick={() => void mutate(selected, 'resolve')} className="btn-primary text-xs">Resolve</button><button disabled={busy} onClick={() => void mutate(selected, 'suppress')} className="btn-secondary text-xs">Suppress</button></div></>}{alert && <><Callout title="Operational response">Investigate the alarm and affected resource, mark work in progress, and resolve after recovery.</Callout><div className="flex gap-2"><button disabled={busy} onClick={() => void mutate(selected, 'progress')} className="btn-secondary text-xs">Mark in progress</button><button disabled={busy} onClick={() => void mutate(selected, 'resolve')} className="btn-primary text-xs">Resolve</button></div></>}</div>}
      {tab === 'Costs & metrics' && <div className="space-y-3"><Grid rows={[["Monthly resource cost", resource?.cost_monthly == null ? 'Unavailable' : `$${resource.cost_monthly.toLocaleString()}`], ['Potential monthly savings', costItem ? `$${costItem.potential_monthly_savings.toLocaleString()}` : 'Unavailable'], ['Potential annual savings', selected.annualSavings == null ? 'Unavailable' : `$${Math.round(selected.annualSavings).toLocaleString()}`], ['Savings verification', costItem ? human(costItem.savings_state) : 'Unavailable']]} /><h3 className="font-medium">Live metric evidence</h3>{metricSummary.length ? <div className="grid gap-2 sm:grid-cols-2">{metricSummary.map(m => <div key={m.name} className="rounded-lg border p-3"><span className="text-xs text-slate-500">{m.name}</span><div>Avg {m.avg.toFixed(2)} · Peak {m.max.toFixed(2)}</div><small>{m.count} samples</small></div>)}</div> : <Unavailable>Metrics are unavailable or have not been collected.</Unavailable>}</div>}
      {tab === 'Owner & evidence' && <div className="space-y-3"><Grid rows={[["Governed owner", workItem?.owner || 'Workflow not started'], ['Workflow state', workItem ? human(workItem.state) : 'Not governed'], ['Due', workItem?.due_at ? date(workItem.due_at, true) : 'Unavailable'], ['Next escalation', workItem?.next_escalation_at ? date(workItem.next_escalation_at, true) : 'Not scheduled'], ["Discovered owner", costItem?.ownership?.owner?.value || 'Unassigned / unavailable'], ['Team', costItem?.ownership?.team?.value || 'Unassigned / unavailable'], ['Application', costItem?.ownership?.application?.value || 'Unavailable'], ['Evidence source', selected.source === 'cost' ? human(costItem?.source) : selected.source === 'security' ? human(finding?.finding_source) : 'Monitoring alert']]} />{!workItem ? <div className="space-y-2 rounded-lg border p-3"><p className="text-xs text-slate-500">Start a governed workflow to persist ownership, deadlines, escalation, comments, approvals, and exceptions.</p><input aria-label="Initial accountable owner" value={ownerDraft} onChange={e => setOwnerDraft(e.target.value)} placeholder="Owner name or team (optional)" className="w-full rounded-md border px-3 py-2 text-xs dark:bg-slate-950" /><button disabled={busy} onClick={() => void startGovernance()} className="btn-primary text-xs">Start governed workflow</button></div> : <div className="space-y-2 rounded-lg border p-3"><strong className="text-xs">Assign accountable owner</strong><input aria-label="Accountable owner" value={ownerDraft} onChange={e => setOwnerDraft(e.target.value)} placeholder="Owner name or team" className="w-full rounded-md border px-3 py-2 text-xs dark:bg-slate-950" /><input aria-label="Owner member ID" value={ownerUserId} onChange={e => setOwnerUserId(e.target.value)} placeholder="Organization member UUID (optional, validated)" className="w-full rounded-md border px-3 py-2 text-xs dark:bg-slate-950" /><button disabled={busy || !ownerDraft.trim()} onClick={() => void saveOwner()} className="btn-primary text-xs">Save owner</button></div>}<pre className="max-h-80 overflow-auto rounded-lg bg-slate-950 p-3 text-[11px] text-slate-200">{JSON.stringify(selected.raw, null, 2)}</pre><Unavailable>Infrastructure code appears only when an exact linked repository file is known. Guessed Terraform is never generated.</Unavailable></div>}
      {tab === 'Activities' && <div className="space-y-3">{workItem && <div className="space-y-2 rounded-lg border p-3"><strong className="text-xs">Add governed comment</strong><textarea aria-label="Governed comment" value={commentDraft} onChange={e => setCommentDraft(e.target.value)} maxLength={4000} rows={3} placeholder="Record context, evidence, or a decision…" className="w-full rounded-md border px-3 py-2 text-xs dark:bg-slate-950" /><input aria-label="Mention organization members" value={mentionIds} onChange={e => setMentionIds(e.target.value)} placeholder="Member UUIDs, comma-separated (optional)" className="w-full rounded-md border px-3 py-2 text-xs dark:bg-slate-950" /><button disabled={busy || !commentDraft.trim()} onClick={() => void addComment()} className="btn-primary text-xs">Add comment</button><p className="text-[11px] text-slate-400">Mentions are accepted only for validated members of this organization.</p></div>}{workEvents.length ? workEvents.map(event => <div key={event.id} className="rounded-lg border border-brand-200 p-3"><div className="flex justify-between"><strong>{human(event.event_type)}</strong><time className="text-xs text-slate-400">{date(event.created_at, true)}</time></div><p className="mt-1 text-[11px] text-slate-400">Actor {event.actor_id}</p><pre className="mt-2 overflow-auto whitespace-pre-wrap text-[11px]">{JSON.stringify(event.details, null, 2)}</pre></div>) : <Unavailable>No governed activity has been recorded for this issue.</Unavailable>}<Select label="Resource activity type" value={activityType} set={setActivityType} options={[['all', 'All resource activity'], ...activityTypes.map(v => [v, human(v)] as [string, string])]} />{visibleActivity.length ? visibleActivity.map(a => <div key={a.id} className="rounded-lg border p-3"><div className="flex justify-between"><strong>{human(a.event_type)}</strong><time className="text-xs text-slate-400">{date(a.occurred_at, true)}</time></div><pre className="mt-2 overflow-auto text-[11px]">{JSON.stringify(a.detail, null, 2)}</pre></div>) : <Unavailable>No resource lifecycle activity was returned.</Unavailable>}</div>}
      {tab === 'Related issues' && (related.length ? related.map(i => <button key={i.id} onClick={() => open(i)} className="block w-full rounded-lg border p-3 text-left"><Badge tone="neutral">{labels[i.source]}</Badge><strong className="mt-2 block">{i.title}</strong>{i.annualSavings != null && <span className="text-xs text-emerald-600">${Math.round(i.annualSavings).toLocaleString()}/yr</span>}</button>) : <Unavailable>No related issue shares this resource or account in the loaded evidence.</Unavailable>)}
    </div>}</Drawer>{dialog}
  </div>;
}

function Select({ label, value, options, set }: { label: string; value: string; options: [string, string][]; set: (v: string) => void }) { return <select aria-label={label} value={value} onChange={e => set(e.target.value)} className="max-w-48 rounded-md border px-2 py-1.5 text-xs dark:bg-slate-950">{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>; }
function Card({ issue, selected, select, open }: { issue: Issue; selected: boolean; select: () => void; open: () => void }) { return <article className="rounded-xl border bg-white p-4 dark:bg-slate-900"><div className="flex gap-2"><input type="checkbox" checked={selected} onChange={select} aria-label={`Select ${issue.title}`} /><button onClick={open} className="min-w-0 flex-1 text-left"><div className="flex gap-1"><Badge tone="neutral">{labels[issue.source]}</Badge><Badge tone={severityTone[issue.severity]}>{issue.severity}</Badge></div><h3 className="mt-3 font-semibold">{issue.title}</h3><p className="mt-1 line-clamp-2 text-xs text-slate-500">{issue.detail}</p><div className="mt-3 text-xs">{issue.account} · {issue.resourceType}</div>{issue.annualSavings != null && <div className="text-xs text-emerald-600">${Math.round(issue.annualSavings).toLocaleString()}/yr potential</div>}</button></div></article>; }
function Grid({ rows }: { rows: [string, string][] }) { return <dl className="grid gap-3 sm:grid-cols-2">{rows.map(([k, v]) => <div key={k} className="rounded-lg border p-3"><dt className="text-xs text-slate-400">{k}</dt><dd className="mt-1 break-words">{v}</dd></div>)}</dl>; }
function Callout({ title, children }: { title: string; children: ReactNode }) { return <div className="rounded-lg border border-brand-200 bg-brand-50 p-3 dark:border-brand-900 dark:bg-brand-950/20"><strong className="text-xs text-brand-700">{title}</strong><div className="mt-1">{children}</div></div>; }
function Unavailable({ children }: { children: ReactNode }) { return <div className="rounded-lg border border-dashed p-3 text-xs text-slate-500">{children}</div>; }
function RemediationLifecycle({ row, busy, act }: { row: RemediationRequest; busy: boolean; act: (action: 'request' | 'approve' | 'reject' | 'dry-run' | 'execute' | 'rollback', row?: RemediationRequest) => Promise<void> }) {
  return <div className="space-y-3 rounded-lg border p-3"><Grid rows={[["Action", remediationActionLabel[row.action_type]], ['Status', human(row.status)], ['Requested', date(row.created_at, true)], ['Approved', row.approved_at ? date(row.approved_at, true) : 'Pending'], ['Executed', row.executed_at ? date(row.executed_at, true) : 'Not executed']]} />
    {row.dry_run_result && <Evidence title="Dry-run evidence" value={row.dry_run_result} />}{row.execution_result && <Evidence title="Execution evidence" value={row.execution_result} />}
    <div className="flex flex-wrap gap-2">{row.status === 'pending_approval' && <><button disabled={busy} onClick={() => void act('approve', row)} className="btn-primary text-xs">Approve</button><button disabled={busy} onClick={() => void act('reject', row)} className="btn-secondary text-xs">Reject</button></>}{row.status === 'approved' && <button disabled={busy} onClick={() => void act('dry-run', row)} className="btn-primary text-xs">Run live dry-run</button>}{row.status === 'dry_run_passed' && <button disabled={busy} onClick={() => void act('execute', row)} className="btn-primary text-xs">Execute in AWS</button>}{row.status === 'completed' && row.action_type === 'stop_instance' && <button disabled={busy} onClick={() => void act('rollback', row)} className="btn-secondary text-xs">Rollback by starting instance</button>}</div>
    {row.status === 'awaiting_stop' && <Unavailable>A resize is waiting for AWS to report the instance as stopped. Continue it from Automation → Remediation.</Unavailable>}
  </div>;
}
function Evidence({ title, value }: { title: string; value: object }) { return <div><h4 className="mb-1 text-xs font-medium">{title}</h4><pre className="max-h-48 overflow-auto rounded bg-slate-950 p-2 text-[11px] text-slate-200">{JSON.stringify(value, null, 2)}</pre></div>; }
