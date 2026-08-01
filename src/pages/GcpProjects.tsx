import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { StatCard } from '../components/StatCard';
import { DataTable, type Column } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { ConnectGcpProjectWizard } from '../components/ConnectGcpProjectWizard';
import { useConfirm } from '../components/ConfirmDialog';
import { TableSkeleton, StatCardSkeleton } from '../components/Skeleton';
import { useOrg } from '../lib/orgContext';
import { useFilters } from '../lib/filterContext';
import { useSync } from '../lib/syncContext';
import { useToast } from '../lib/toast';
import { api, type GcpConnection } from '../lib/api';

/**
 * Single-view Cloud Accounts-style list for GCP — deliberately not a
 * multi-tab mirror of AwsAccounts.tsx (Dashboard/Onboarding/Organizations/
 * Regions/Sync Center/Reports): those extra tabs would need backend
 * endpoints (a GCP dashboard aggregate, sync-status summary, etc.) that
 * don't exist in Phase 1 scope, and this codebase's own rule is never to
 * ship a tab with nothing real behind it. One real, working inventory view
 * beats several thin ones.
 */
export function GcpProjects() {
  const navigate = useNavigate();
  const { refreshToken } = useFilters();
  const { projects } = useOrg();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { toast } = useToast();
  const { syncStates, startDiscovery } = useSync();

  const [connections, setConnections] = useState<GcpConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { items } = await api.getGcpAccounts({ limit: 500 });
      setConnections(items);
    } finally {
      setLoading(false);
      setLoadedOnce(true);
    }
  }, []);

  useEffect(() => { void load(); }, [load, refreshToken]);

  function syncNow(connectionId: string) {
    startDiscovery(connectionId, 'gcpAccounts');
    toast('Sync started — resources will update as it completes.', 'success');
  }

  async function handleDisconnect(id: string, name: string) {
    if (!(await confirm(`Disconnect "${name}"? It will be marked disconnected — discovered resources and history are kept.`))) return;
    await api.disconnectGcpAccount(id);
    toast(`Disconnected "${name}"`, 'success');
    void load();
  }

  async function handleDeletePermanently(id: string, name: string) {
    if (!(await confirm(`Permanently delete "${name}"? This is irreversible — its discovered resources and history are deleted too. Use Disconnect instead if you might reconnect it later.`))) return;
    await api.deleteGcpAccountPermanently(id);
    toast(`Deleted "${name}"`, 'success');
    void load();
  }

  const filtered = useMemo(() => connections.filter(c => {
    if (statusFilter && c.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(c.connection_name ?? c.gcp_project_id).toLowerCase().includes(q) && !c.gcp_project_id.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [connections, statusFilter, search]);

  const counts = useMemo(() => ({
    total: connections.length,
    connected: connections.filter(c => c.status === 'connected').length,
    error: connections.filter(c => c.status === 'error').length,
  }), [connections]);

  const columns: Column<GcpConnection>[] = [
    { key: 'name', header: 'Name', sticky: true, render: c => c.connection_name ?? c.gcp_project_id, sortValue: c => c.connection_name ?? c.gcp_project_id },
    { key: 'projectId', header: 'Project ID', render: c => <span className="font-mono text-xs">{c.gcp_project_id}</span>, sortValue: c => c.gcp_project_id },
    { key: 'environment', header: 'Environment', render: c => <Badge tone="neutral">{c.environment}</Badge>, sortValue: c => c.environment },
    {
      key: 'status', header: 'Status', render: c => (
        <div className="flex flex-col gap-0.5">
          <Badge>{c.status}</Badge>
          {c.status === 'error' && c.error_message && <span className="text-[10px] text-red-500 max-w-[16rem] truncate" title={c.error_message}>{c.error_message}</span>}
        </div>
      ), sortValue: c => c.status,
    },
    { key: 'method', header: 'Auth Method', render: c => c.connection_method === 'service_account_impersonation' ? 'Impersonation' : 'Service account key', sortValue: c => c.connection_method },
    { key: 'resources', header: 'Resources', render: c => c.resource_summary?.totalResources?.toLocaleString() ?? '—', sortValue: c => c.resource_summary?.totalResources ?? 0 },
    { key: 'lastSync', header: 'Last Sync', render: c => c.last_sync_at ? new Date(c.last_sync_at).toLocaleString() : 'Never', sortValue: c => c.last_sync_at ?? '' },
    {
      key: 'actions', header: '', render: c => (
        <RowActionsMenu
          connection={c}
          syncing={syncStates[c.id]?.status === 'running'}
          onSync={() => syncNow(c.id)}
          onDisconnect={() => void handleDisconnect(c.id, c.connection_name ?? c.gcp_project_id)}
          onDelete={() => void handleDeletePermanently(c.id, c.connection_name ?? c.gcp_project_id)}
        />
      ),
    },
  ];

  if (!loadedOnce) {
    return (
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">{Array.from({ length: 3 }).map((_, i) => <StatCardSkeleton key={i} />)}</div>
        <TableSkeleton rows={5} />
      </div>
    );
  }

  return (
    <div>
      <FilterBar title="GCP Projects" breadcrumb={<Breadcrumb />} showAccountFilter={false} />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
        <StatCard label="Total Projects" value={String(counts.total)} />
        <StatCard label="Connected" value={String(counts.connected)} />
        <StatCard label="Needs Attention" value={String(counts.error)} />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-slate-400">Search</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name or project ID…" className="text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-slate-700 dark:text-slate-200 w-56" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-slate-400">Status</span>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-slate-700 dark:text-slate-200">
              <option value="">All</option>
              <option value="connected">Connected</option>
              <option value="pending">Pending</option>
              <option value="error">Error</option>
              <option value="disconnected">Disconnected</option>
            </select>
          </label>
        </div>
        <button onClick={() => setWizardOpen(true)} className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-3 py-2 shrink-0 transition-colors">+ Add GCP Project</button>
      </div>

      {loading ? <TableSkeleton rows={5} /> : (
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={c => c.id}
          onRowClick={c => navigate(`/gcp-projects/${c.id}`)}
          emptyMessage={connections.length === 0 && !search && !statusFilter ? 'No GCP projects connected yet. Click "+ Add GCP Project" to connect your first one.' : 'No projects match these filters.'}
        />
      )}

      <ConnectGcpProjectWizard open={wizardOpen} onClose={() => setWizardOpen(false)} onConnected={load} projects={projects} />
      {confirmDialog}
    </div>
  );
}

function RowActionsMenu({ connection, syncing, onSync, onDisconnect, onDelete }: {
  connection: GcpConnection;
  syncing: boolean;
  onSync: () => void;
  onDisconnect: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function copyId() {
    void navigator.clipboard.writeText(connection.gcp_project_id);
    toast('Project ID copied', 'success');
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative inline-block text-left" onClick={e => e.stopPropagation()}>
      <button onClick={() => setOpen(v => !v)} className="rounded-md w-7 h-7 inline-flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Row actions" aria-haspopup="menu" aria-expanded={open}>
        ⋯
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg py-1 text-sm animate-[fadeIn_0.1s_ease-out]">
          <button role="menuitem" onClick={() => { setOpen(false); onSync(); }} disabled={syncing} className="w-full text-left px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 disabled:opacity-50">
            {syncing ? 'Syncing…' : 'Sync Now'}
          </button>
          <button role="menuitem" onClick={copyId} className="w-full text-left px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60">Copy Project ID</button>
          <div className="my-1 border-t border-slate-100 dark:border-slate-700" />
          <button role="menuitem" onClick={() => { setOpen(false); onDisconnect(); }} className="w-full text-left px-3 py-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">Disconnect</button>
          <button role="menuitem" onClick={() => { setOpen(false); onDelete(); }} className="w-full text-left px-3 py-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" title="Irreversible — also deletes this project's resources and history">Delete Permanently</button>
        </div>
      )}
    </div>
  );
}
