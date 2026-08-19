import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { StatCard } from '../components/StatCard';
import { DataTable, type Column } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { EmptyState } from '../components/EmptyState';
import { useTabParam } from '../lib/useTabParam';
import { useFilters } from '../lib/filterContext';
import { api, type Incident, type IncidentSeverity, type IncidentStatus } from '../lib/api';
import { CreateIncidentModal } from '../components/CreateIncidentModal';

const TABS = ['All Incidents', 'Open', 'Investigating', 'Resolved'] as const;
type Tab = typeof TABS[number];
const TAB_STATUS: Partial<Record<Tab, IncidentStatus>> = { Open: 'open', Investigating: 'investigating', Resolved: 'resolved' };

const SEVERITY_TONE: Record<IncidentSeverity, 'critical' | 'serious' | 'warning' | 'good'> = { critical: 'critical', high: 'serious', medium: 'warning', low: 'good' };
const STATUS_TONE: Record<IncidentStatus, 'warning' | 'neutral' | 'good'> = { open: 'warning', acknowledged: 'neutral', investigating: 'neutral', resolved: 'good', closed: 'good' };

/**
 * V1 of Incidents — customer-reported, with a real lifecycle and timeline
 * (see horizonvigil-incidents), deliberately separate from Issues.tsx (a
 * client-side merge of cost/security/alert feeds with no owned table or
 * lifecycle of its own). No admin-side investigation tooling here yet —
 * that's phase 2, layered on top of this real data once it exists.
 */
export function Incidents() {
  const { connections } = useFilters();
  const navigate = useNavigate();
  const [tab, setTab] = useTabParam<Tab>(TABS, 'All Incidents');
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const status = TAB_STATUS[tab];
      const { items } = await api.getIncidents({ status, limit: 200 });
      setIncidents(items);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { void load(); }, [load]);

  const connectionName = (id: string | null) => id ? (connections.find(c => c.id === id)?.name ?? id) : '—';

  const columns: Column<Incident>[] = [
    { key: 'number', header: 'Number', render: i => <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{i.incident_number}</span>, sortValue: i => i.incident_number },
    { key: 'title', header: 'Title', render: i => <span className="truncate max-w-md inline-block font-medium text-slate-800 dark:text-slate-100">{i.title}</span>, sortValue: i => i.title },
    { key: 'severity', header: 'Severity', render: i => <Badge tone={SEVERITY_TONE[i.severity]}>{i.severity}</Badge>, sortValue: i => i.severity },
    { key: 'status', header: 'Status', render: i => <Badge tone={STATUS_TONE[i.status]}>{i.status}</Badge>, sortValue: i => i.status },
    { key: 'account', header: 'Account', render: i => <span className="text-slate-500 dark:text-slate-400">{connectionName(i.connection_id)}</span> },
    { key: 'created', header: 'Created', render: i => new Date(i.created_at).toLocaleString(), sortValue: i => i.created_at },
  ];

  const openCount = incidents.filter(i => i.status === 'open').length;
  const criticalCount = incidents.filter(i => i.status !== 'resolved' && i.status !== 'closed' && i.severity === 'critical').length;
  const investigatingCount = incidents.filter(i => i.status === 'investigating' || i.status === 'acknowledged').length;

  return (
    <div>
      <FilterBar title="Incidents" breadcrumb={<Breadcrumb />} showAccountFilter={false} />

      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 text-sm flex-wrap">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-md whitespace-nowrap transition-colors ${tab === t ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
              {t}
            </button>
          ))}
        </div>
        <button onClick={() => setCreateOpen(true)} className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-3 py-2 shrink-0">+ Create Incident</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
        <StatCard label="Open" value={String(openCount)} />
        <StatCard label="Critical (active)" value={String(criticalCount)} />
        <StatCard label="Investigating" value={String(investigatingCount)} />
      </div>

      {loading ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : incidents.length === 0 ? (
        <EmptyState
          icon="incidents"
          title={tab === 'All Incidents' ? 'No incidents yet' : `No ${tab.toLowerCase()} incidents`}
          description={tab === 'All Incidents' ? 'Report a problem with your infrastructure and track it through to resolution.' : undefined}
          action={tab === 'All Incidents' ? { label: 'Create Incident', onClick: () => setCreateOpen(true) } : undefined}
        />
      ) : (
        <DataTable columns={columns} rows={incidents} rowKey={i => i.id} onRowClick={i => navigate(`/incidents/${i.id}`)} emptyMessage="No incidents match this filter." />
      )}

      <CreateIncidentModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={load} />
    </div>
  );
}
