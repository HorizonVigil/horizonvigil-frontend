import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { DataTable, type Column } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { StatCard } from '../components/StatCard';
import { EmptyState } from '../components/EmptyState';
import { BarChart } from '../components/charts/BarChart';
import { Donut } from '../components/charts/Donut';
import { SourceInventoryFilters } from '../components/SourceInventoryFilters';
import { useTabParam } from '../lib/useTabParam';
import {
  SOURCE_CATEGORY_CONFIG, generateSourceAssetsPage, generateCategoryOverviewStats,
  type SourceCategory, type SourceAsset, type SourceInventoryFilters as Filters,
} from '../lib/demoData/sourceInventory';
import { RealCloudInventory } from './sourceInventory/RealCloudInventory';
import { RealRepositoryInventory } from './sourceInventory/RealRepositoryInventory';

const TABS = ['Overview', 'Asset List'] as const;
type Tab = typeof TABS[number];

const SCAN_ROLLUP_TONE: Record<SourceAsset['scanRollup'], 'good' | 'warning' | 'critical' | 'neutral'> = {
  completed: 'good', partial: 'warning', failed: 'critical', stale: 'neutral',
};

// Donut's `tone` slot excludes 'neutral' (STATUS has no neutral color to
// render an arc in) -- severityTone() returns the broader Badge Tone type,
// so this narrows to just the 4 severities this chart actually shows.
const SEVERITY_DONUT_TONE = { critical: 'critical', high: 'serious', medium: 'warning', low: 'good' } as const;

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

/**
 * The Source Inventory pillar (Clouds/Repositories/Artifactories/
 * Registries/Clusters/Servers) -- one shared, category-aware page instead
 * of six near-duplicate files, mirroring Resources.tsx's own
 * `/resources/:category` + ResourcesCategory.tsx pattern. Category and
 * Asset List are the two in-page tabs; a specific row's Asset Detail is a
 * separate route (SourceAssetDetail.tsx), not a third tab.
 *
 * 100% mock data -- no real scanner backend exists for any of these six
 * categories yet (explicit non-goal of the spec this was built from), so
 * the demo banner here is always-on, not a toggle off of something real
 * the way Vulnerability Management's demo mode is.
 */
export function SourceInventoryCategory() {
  const { category } = useParams<{ category: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useTabParam<Tab>(TABS, 'Overview');

  const isValidCategory = category !== undefined && category !== 'cloud' && category !== 'repository' && category in SOURCE_CATEGORY_CONFIG;
  const config = isValidCategory ? SOURCE_CATEGORY_CONFIG[category as SourceCategory] : null;

  const [filters, setFilters] = useState<Filters>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [assets, setAssets] = useState<SourceAsset[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => { setPage(1); }, [filters, category]);

  const loadAssets = useCallback(() => {
    if (!isValidCategory) return;
    const res = generateSourceAssetsPage(category as SourceCategory, page, pageSize, filters);
    setAssets(res.items);
    setTotal(res.total);
  }, [category, isValidCategory, page, pageSize, filters]);

  useEffect(() => { loadAssets(); }, [loadAssets]);

  // Clouds and Repositories have real backend data now (see
  // lib/sourceInventoryClouds.ts / lib/sourceInventoryRepos.ts). Placed
  // after every hook above so this component calls the same hooks in the
  // same order on every render regardless of which category the route is
  // currently on. The other 4 categories are untouched, still fully mock.
  if (category === 'cloud') return <RealCloudInventory />;
  if (category === 'repository') return <RealRepositoryInventory />;

  if (!isValidCategory || !config) {
    return (
      <div className="min-w-0">
        <FilterBar title="Source Inventory" breadcrumb={<Breadcrumb />} showAccountFilter={false} showRegionFilter={false} showDateFilter={false} />
        <EmptyState icon="box" title="Unknown source category" description={`"${category}" isn't a recognized Source Inventory category.`} />
      </div>
    );
  }

  const stats = generateCategoryOverviewStats(category as SourceCategory);
  const subTypeLabels = config.subTypes.map(s => s.label);

  const columns: Column<SourceAsset>[] = [
    { key: 'name', header: 'Asset', render: a => a.name, sortValue: a => a.name, sticky: true },
    { key: 'subType', header: 'Sub-type', render: a => a.subType, sortValue: a => a.subType },
    { key: 'owner', header: 'Owner', render: a => a.owner },
    {
      key: 'scanners', header: 'Scanners', render: a => (
        <span className="inline-flex items-center gap-1.5">
          <Badge tone={a.scanners.length > 1 ? 'warning' : 'neutral'}>{a.scanners.length} scanner{a.scanners.length === 1 ? '' : 's'}</Badge>
        </span>
      ),
    },
    { key: 'lastScan', header: 'Last Aggregated Scan', render: a => formatDateTime(a.lastAggregatedScanAt), sortValue: a => a.lastAggregatedScanAt ?? '' },
    { key: 'scanStatus', header: 'Scan Status', render: a => <Badge tone={SCAN_ROLLUP_TONE[a.scanRollup]}>{a.scanRollup}</Badge>, sortValue: a => a.scanRollup },
    { key: 'critical', header: 'Crit', render: a => String(a.bySeverity.critical), sortValue: a => a.bySeverity.critical },
    { key: 'high', header: 'High', render: a => String(a.bySeverity.high), sortValue: a => a.bySeverity.high, defaultHidden: true },
    { key: 'medium', header: 'Med', render: a => String(a.bySeverity.medium), sortValue: a => a.bySeverity.medium, defaultHidden: true },
    { key: 'low', header: 'Low', render: a => String(a.bySeverity.low), sortValue: a => a.bySeverity.low, defaultHidden: true },
    { key: 'risk', header: 'Risk Score', render: a => String(a.riskScore), sortValue: a => a.riskScore },
    { key: 'exposure', header: 'Internet Exposure', render: a => a.internetExposed === null ? 'Unknown' : a.internetExposed ? <Badge tone="critical">Exposed</Badge> : 'No' },
  ];

  return (
    <div className="min-w-0">
      <FilterBar title={config.label} breadcrumb={<Breadcrumb />} showAccountFilter={false} showRegionFilter={false} showDateFilter={false} />

      <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-dashed border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
        Source Inventory is a UI preview with simulated data — no {config.label.toLowerCase()} scanner backend is connected yet.
      </div>

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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label={`Total ${config.label}`} value={stats.total.toLocaleString()} icon="box" />
            <StatCard label="Critical Findings" value={stats.bySeverity.critical.toLocaleString()} icon="target" iconTone="critical" />
            <StatCard label="High Findings" value={stats.bySeverity.high.toLocaleString()} icon="target" iconTone="serious" />
            <StatCard label="Stale / Failed Scans" value={stats.staleOrFailedCount.toLocaleString()} icon="alert-triangle" iconTone="warning" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Distribution by Sub-Type</h3>
              <BarChart data={stats.bySubType.map(s => ({ label: s.subType, value: s.count }))} />
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Findings by Severity</h3>
              <Donut
                data={(['critical', 'high', 'medium', 'low'] as const).map(sev => ({ label: sev, value: stats.bySeverity[sev], tone: SEVERITY_DONUT_TONE[sev] }))}
                centerLabel={{ value: (stats.bySeverity.critical + stats.bySeverity.high + stats.bySeverity.medium + stats.bySeverity.low).toLocaleString(), caption: 'Findings' }}
                showPercent
              />
            </div>
          </div>
        </div>
      )}

      {tab === 'Asset List' && (
        <div>
          <SourceInventoryFilters filters={filters} onChange={setFilters} subTypes={subTypeLabels} scanners={config.scannerPool} />
          <DataTable
            columns={columns}
            rows={assets}
            rowKey={a => a.id}
            emptyMessage="No assets match the current filters."
            onRowClick={a => navigate(`/source-inventory/${category}/${a.id}`)}
            server={{ page, pageSize, total, onPageChange: setPage, onPageSizeChange: p => { setPageSize(p); setPage(1); } }}
          />
        </div>
      )}
    </div>
  );
}
