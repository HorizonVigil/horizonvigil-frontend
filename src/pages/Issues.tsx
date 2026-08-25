import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { StatCard } from '../components/StatCard';
import { DataTable, type Column } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { Drawer } from '../components/Drawer';
import { useFilters } from '../lib/filterContext';
import { api, type CostRecommendation, type VulnerabilityFinding, type AlertRow } from '../lib/api';

type IssueSource = 'cost' | 'security' | 'alert';
type UnifiedSeverity = 'critical' | 'high' | 'medium' | 'low';
type UnifiedStatus = 'open' | 'in_progress' | 'resolved';

interface UnifiedIssue {
  id: string;
  source: IssueSource;
  title: string;
  detail: string;
  severity: UnifiedSeverity;
  status: UnifiedStatus;
  connectionId: string | null;
  occurredAt: string;
}

const SOURCE_LABEL: Record<IssueSource, string> = { cost: 'Cost', security: 'Security', alert: 'Alert' };
const SOURCE_LINK: Record<IssueSource, string> = { cost: '/cost-optimization?tab=Recommendations', security: '/vulnerability-management', alert: '/alerts' };
const SEVERITY_TONE: Record<UnifiedSeverity, 'critical' | 'serious' | 'warning' | 'good'> = { critical: 'critical', high: 'serious', medium: 'warning', low: 'good' };
const STATUS_TONE: Record<UnifiedStatus, 'good' | 'warning' | 'neutral'> = { open: 'warning', in_progress: 'neutral', resolved: 'good' };

// cost_recommendations has no 'critical' priority — only Adaptive6-style
// security findings and alerts do. A cost item never renders as critical,
// which is accurate to what the underlying data actually distinguishes.
function fromCostRecommendation(r: CostRecommendation): UnifiedIssue {
  return {
    id: `cost:${r.id}`, source: 'cost', title: r.issue, detail: r.recommended_action,
    severity: r.priority, status: r.status === 'open' ? 'open' : 'resolved',
    connectionId: r.connection_id, occurredAt: r.created_at,
  };
}
function fromFinding(f: VulnerabilityFinding): UnifiedIssue {
  return {
    id: `security:${f.id}`, source: 'security', title: f.title, detail: f.description ?? '',
    severity: f.severity === 'informational' ? 'low' : f.severity, status: f.status === 'open' ? 'open' : 'resolved',
    connectionId: f.connection_id, occurredAt: f.discovered_at,
  };
}
function fromAlert(a: AlertRow): UnifiedIssue {
  return {
    id: `alert:${a.id}`, source: 'alert', title: a.alert_name, detail: `${a.severity} severity alert`,
    severity: a.severity, status: a.status === 'open' ? 'open' : a.status === 'resolved' ? 'resolved' : 'in_progress',
    connectionId: a.connection_id, occurredAt: a.triggered_at,
  };
}

const SEVERITIES: UnifiedSeverity[] = ['critical', 'high', 'medium', 'low'];
const GROUP_OPTIONS = ['None', 'Source', 'Severity', 'Status'] as const;
type GroupBy = typeof GROUP_OPTIONS[number];

/**
 * Merges three already-real, already-paginated feeds (cost recommendations,
 * security findings, alerts) into one triage view client-side — deliberately
 * not a new backend aggregation service, since each feed is already owned
 * and served by its own Worker (cost-optimization-api, vulnerability-
 * management-api, alerts-api) and a client-side merge of three existing
 * list calls is simpler and safer than duplicating that data into a new
 * table or building a fourth service just to join three others' rows.
 * Row actions (apply/exclude/resolve/acknowledge/...) intentionally stay on
 * each source's own page — this view is for triage/visibility across all
 * three, not a second copy of every action button.
 */
export function Issues() {
  const { account, refreshToken } = useFilters();
  const [costItems, setCostItems] = useState<CostRecommendation[]>([]);
  const [findings, setFindings] = useState<VulnerabilityFinding[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<'all' | IssueSource>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | UnifiedSeverity>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | UnifiedStatus>('all');
  const [groupBy, setGroupBy] = useState<GroupBy>('None');
  const [selected, setSelected] = useState<UnifiedIssue | null>(null);

  useEffect(() => {
    const connectionId = account === 'all' ? undefined : account;
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      api.getSavingsOpportunities({ connectionId, status: 'open', limit: 200 }),
      api.getFindings({ connection_id: connectionId, status: 'open', limit: 200 }),
      api.getActiveAlerts({ connection_id: connectionId, limit: 200 }),
    ]).then(([cost, sec, al]) => {
      if (cancelled) return;
      setCostItems(cost.items);
      setFindings(sec.items);
      setAlerts(al.items);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [account, refreshToken]);

  const allIssues = useMemo<UnifiedIssue[]>(() => {
    const merged = [...costItems.map(fromCostRecommendation), ...findings.map(fromFinding), ...alerts.map(fromAlert)];
    return merged.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }, [costItems, findings, alerts]);

  const filteredIssues = useMemo(() => allIssues.filter(i =>
    (sourceFilter === 'all' || i.source === sourceFilter) &&
    (severityFilter === 'all' || i.severity === severityFilter) &&
    (statusFilter === 'all' || i.status === statusFilter),
  ), [allIssues, sourceFilter, severityFilter, statusFilter]);

  const groups = useMemo<{ label: string; rows: UnifiedIssue[] }[]>(() => {
    if (groupBy === 'None') return [{ label: '', rows: filteredIssues }];
    const keyFn = groupBy === 'Source' ? (i: UnifiedIssue) => SOURCE_LABEL[i.source]
      : groupBy === 'Severity' ? (i: UnifiedIssue) => i.severity
      : (i: UnifiedIssue) => i.status;
    const map = new Map<string, UnifiedIssue[]>();
    for (const issue of filteredIssues) {
      const key = keyFn(issue);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(issue);
    }
    return [...map.entries()].map(([label, rows]) => ({ label, rows })).sort((a, b) => b.rows.length - a.rows.length);
  }, [filteredIssues, groupBy]);

  const columns: Column<UnifiedIssue>[] = [
    { key: 'source', header: 'Source', render: i => <Badge tone="neutral">{SOURCE_LABEL[i.source]}</Badge>, sortValue: i => i.source },
    { key: 'title', header: 'Issue', render: i => <span className="truncate max-w-md inline-block">{i.title}</span>, sortValue: i => i.title },
    { key: 'severity', header: 'Severity', render: i => <Badge tone={SEVERITY_TONE[i.severity]}>{i.severity}</Badge>, sortValue: i => i.severity },
    { key: 'status', header: 'Status', render: i => <Badge tone={STATUS_TONE[i.status]}>{i.status.replace('_', ' ')}</Badge>, sortValue: i => i.status },
    { key: 'occurred', header: 'Detected', render: i => new Date(i.occurredAt).toLocaleDateString(), sortValue: i => i.occurredAt },
  ];

  const openCount = allIssues.filter(i => i.status === 'open').length;
  const criticalCount = allIssues.filter(i => i.status !== 'resolved' && (i.severity === 'critical' || i.severity === 'high')).length;

  return (
    <div>
      <FilterBar title="Issues" breadcrumb={<Breadcrumb />} showRegionFilter={false} showDateFilter={false} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Total Open Issues" value={String(openCount)} />
        <StatCard label="High + Critical" value={String(criticalCount)} />
        <StatCard label="Cost Recommendations" value={String(costItems.filter(c => c.status === 'open').length)} />
        <StatCard label="Security + Alerts" value={String(findings.filter(f => f.status === 'open').length + alerts.filter(a => a.status === 'open').length)} />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value as typeof sourceFilter)} className="text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5">
          <option value="all">All sources</option>
          <option value="cost">Cost</option>
          <option value="security">Security</option>
          <option value="alert">Alerts</option>
        </select>
        <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value as typeof severityFilter)} className="text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5">
          <option value="all">All severities</option>
          {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)} className="text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5">
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="resolved">Resolved</option>
        </select>
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-xs text-slate-400">Group by</span>
          <select value={groupBy} onChange={e => setGroupBy(e.target.value as GroupBy)} className="text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5">
            {GROUP_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : groups.map(g => (
        <div key={g.label || 'all'} className="mb-4">
          {g.label && <h3 className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">{g.label} <span className="text-slate-400 dark:text-slate-500 normal-case">({g.rows.length})</span></h3>}
          <DataTable columns={columns} rows={g.rows} rowKey={i => i.id} onRowClick={setSelected} emptyMessage="No issues match these filters." />
        </div>
      ))}

      <Drawer open={!!selected} onClose={() => setSelected(null)} title="Issue detail">
        {selected && (
          <div className="flex flex-col gap-4 text-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge tone="neutral">{SOURCE_LABEL[selected.source]}</Badge>
              <Badge tone={SEVERITY_TONE[selected.severity]}>{selected.severity}</Badge>
              <Badge tone={STATUS_TONE[selected.status]}>{selected.status.replace('_', ' ')}</Badge>
            </div>
            <div>
              <div className="text-xs text-slate-400 dark:text-slate-500 mb-1">Issue</div>
              <div className="text-slate-700 dark:text-slate-200">{selected.title}</div>
            </div>
            {selected.detail && (
              <div>
                <div className="text-xs text-slate-400 dark:text-slate-500 mb-1">Detail</div>
                <div className="text-slate-700 dark:text-slate-200">{selected.detail}</div>
              </div>
            )}
            <div>
              <div className="text-xs text-slate-400 dark:text-slate-500 mb-1">Detected</div>
              <div className="text-slate-700 dark:text-slate-200">{new Date(selected.occurredAt).toLocaleString()}</div>
            </div>
            <Link to={SOURCE_LINK[selected.source]} className="text-xs px-3 py-1.5 rounded-md bg-brand-600 text-white hover:bg-brand-700 text-center">
              Open in {SOURCE_LABEL[selected.source] === 'Cost' ? 'Cost Optimization' : SOURCE_LABEL[selected.source] === 'Security' ? 'Vulnerability Management' : 'Alerts'}
            </Link>
          </div>
        )}
      </Drawer>
    </div>
  );
}
