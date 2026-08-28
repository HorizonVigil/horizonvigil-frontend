import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilterBar } from '../../components/FilterBar';
import { Breadcrumb } from '../../components/Breadcrumb';
import { DataTable, type Column } from '../../components/DataTable';
import { Badge } from '../../components/Badge';
import { StatCard } from '../../components/StatCard';
import { BarChart } from '../../components/charts/BarChart';
import { Donut } from '../../components/charts/Donut';
import { SourceInventoryFilters } from '../../components/SourceInventoryFilters';
import { useTabParam } from '../../lib/useTabParam';
import {
  SOURCE_CATEGORY_CONFIG, type SourceAsset, type CategoryOverviewStats,
  type SourceInventoryFilters as Filters,
} from '../../lib/demoData/sourceInventory';
import { getRealCloudAssetsPage, getRealCloudOverviewStats, REAL_CLOUD_SCANNER_NAMES } from '../../lib/sourceInventoryClouds';

const TABS = ['Overview', 'Asset List'] as const;
type Tab = typeof TABS[number];

const config = SOURCE_CATEGORY_CONFIG.cloud;

const SCAN_ROLLUP_TONE: Record<SourceAsset['scanRollup'], 'good' | 'warning' | 'critical' | 'neutral'> = {
  completed: 'good', partial: 'warning', failed: 'critical', stale: 'neutral',
};
const SEVERITY_DONUT_TONE = { critical: 'critical', high: 'serious', medium: 'warning', low: 'good' } as const;

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

/**
 * Real-data counterpart to SourceInventoryCategory.tsx, for the Clouds
 * category only. No mock banner -- everything here comes from already-real,
 * already-deployed endpoints (see lib/sourceInventoryClouds.ts). Mirrors
 * CloudAccounts.tsx's own established provider-vs-"All" pagination split:
 * picking one provider (AWS/GCP/Azure) via the subType filter gets that
 * provider's own real, fully server-paginated list; "All" is a bounded,
 * honestly-labeled snapshot with a disclosure banner.
 */
export function RealCloudInventory() {
  const navigate = useNavigate();
  const [tab, setTab] = useTabParam<Tab>(TABS, 'Overview');
  const [filters, setFilters] = useState<Filters>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [assets, setAssets] = useState<SourceAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [snapshotNotice, setSnapshotNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<CategoryOverviewStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

  const isProviderMode = filters.subType === 'AWS' || filters.subType === 'GCP' || filters.subType === 'Azure';

  useEffect(() => { setPage(1); }, [filters]);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getRealCloudAssetsPage(page, pageSize, filters);
      setAssets(res.items);
      setTotal(res.total);
      setSnapshotNotice(res.snapshotNotice);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filters]);

  useEffect(() => { if (tab === 'Asset List') void loadAssets(); }, [tab, loadAssets]);

  useEffect(() => {
    if (tab !== 'Overview') return;
    setStatsError(null);
    getRealCloudOverviewStats().then(setStats).catch(err => setStatsError(err instanceof Error ? err.message : 'Could not load cloud stats.'));
  }, [tab]);

  const columns: Column<SourceAsset>[] = [
    { key: 'name', header: 'Asset', render: a => a.name, sortValue: a => a.name, sticky: true },
    { key: 'subType', header: 'Provider', render: a => a.subType, sortValue: a => a.subType },
    { key: 'owner', header: 'Owner', render: a => a.owner },
    {
      key: 'scanners', header: 'Scanners', render: a => (
        <Badge tone={a.scanners.length > 1 ? 'warning' : 'neutral'}>{a.scanners.length} scanner{a.scanners.length === 1 ? '' : 's'}</Badge>
      ),
    },
    { key: 'lastScan', header: 'Last Sync', render: a => formatDateTime(a.lastAggregatedScanAt), sortValue: a => a.lastAggregatedScanAt ?? '' },
    { key: 'scanStatus', header: 'Connection Status', render: a => <Badge tone={SCAN_ROLLUP_TONE[a.scanRollup]}>{a.scanRollup}</Badge>, sortValue: a => a.scanRollup },
    { key: 'critical', header: 'Crit', render: a => String(a.bySeverity.critical), sortValue: a => a.bySeverity.critical },
    { key: 'high', header: 'High', render: a => String(a.bySeverity.high), sortValue: a => a.bySeverity.high },
    { key: 'medium', header: 'Med', render: a => String(a.bySeverity.medium), sortValue: a => a.bySeverity.medium, defaultHidden: true },
    { key: 'low', header: 'Low', render: a => String(a.bySeverity.low), sortValue: a => a.bySeverity.low, defaultHidden: true },
    { key: 'risk', header: 'Risk Score', render: a => String(a.riskScore), sortValue: a => a.riskScore },
    { key: 'exposure', header: 'Internet Exposure', render: () => 'Unknown' },
  ];

  return (
    <div className="min-w-0">
      <FilterBar title={config.label} breadcrumb={<Breadcrumb />} showAccountFilter={false} showRegionFilter={false} showDateFilter={false} />

      <div className="flex gap-1 text-sm flex-wrap mb-4">
        {TABS.map(t => (
          <button
            type="button"
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`shrink-0 rounded-md px-3 py-1.5 text-sm transition-colors ${
              tab === t ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <div className="flex flex-col gap-4">
          {statsError && (
            <div className="rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-300" role="alert">
              {statsError}
            </div>
          )}
          {!stats && !statsError && <p className="text-xs text-slate-400">Loading…</p>}
          {stats && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Total Cloud Accounts" value={stats.total.toLocaleString()} icon="box" />
                <StatCard label="Critical Findings" value={stats.bySeverity.critical.toLocaleString()} icon="target" iconTone="critical" />
                <StatCard label="High Findings" value={stats.bySeverity.high.toLocaleString()} icon="target" iconTone="serious" />
                <StatCard label="Not Connected / Pending" value={stats.staleOrFailedCount.toLocaleString()} icon="alert-triangle" iconTone="warning" />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                  <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Accounts by Provider</h3>
                  <BarChart data={stats.bySubType.map(s => ({ label: s.subType, value: s.count }))} />
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                  <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Open Findings by Severity</h3>
                  <Donut
                    data={(['critical', 'high', 'medium', 'low'] as const).map(sev => ({ label: sev, value: stats.bySeverity[sev], tone: SEVERITY_DONUT_TONE[sev] }))}
                    centerLabel={{ value: (stats.bySeverity.critical + stats.bySeverity.high + stats.bySeverity.medium + stats.bySeverity.low).toLocaleString(), caption: 'Findings' }}
                    showPercent
                  />
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'Asset List' && (
        <div>
          <SourceInventoryFilters filters={filters} onChange={setFilters} subTypes={config.subTypes.map(s => s.label)} scanners={REAL_CLOUD_SCANNER_NAMES} />
          {snapshotNotice && (
            <div className="mb-3 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
              {snapshotNotice}
            </div>
          )}
          <DataTable
            columns={columns}
            rows={assets}
            rowKey={a => a.id}
            pageSize={pageSize}
            emptyMessage={assets.length === 0 && !filters.search && !filters.subType ? 'No cloud accounts connected yet.' : 'No accounts match these filters.'}
            onRowClick={a => navigate(`/source-inventory/cloud/${a.id}`)}
            server={isProviderMode ? { page, pageSize, total, loading, onPageChange: setPage, onPageSizeChange: p => { setPageSize(p); setPage(1); } } : undefined}
          />
        </div>
      )}
    </div>
  );
}
