import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FilterBar } from '../../components/FilterBar';
import { Breadcrumb } from '../../components/Breadcrumb';
import { DataTable, type Column } from '../../components/DataTable';
import { Badge } from '../../components/Badge';
import { StatCard } from '../../components/StatCard';
import { BarChart } from '../../components/charts/BarChart';
import { SourceInventoryFilters } from '../../components/SourceInventoryFilters';
import { useTabParam } from '../../lib/useTabParam';
import { SOURCE_CATEGORY_CONFIG, type SourceInventoryFilters as Filters } from '../../lib/demoData/sourceInventory';
import { getRealRepoAssets, type RepoAssetRow } from '../../lib/sourceInventoryRepos';

const TABS = ['Overview', 'Asset List'] as const;
type Tab = typeof TABS[number];

const config = SOURCE_CATEGORY_CONFIG.repository;
const REAL_REPO_SCANNER_NAMES = ['Semgrep', 'Dependency-Check', 'Grype', 'Gitleaks', 'TruffleHog'];

const SCAN_ROLLUP_TONE: Record<RepoAssetRow['scanRollup'], 'good' | 'warning' | 'critical' | 'neutral'> = {
  completed: 'good', partial: 'warning', failed: 'critical', stale: 'neutral',
};

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

/**
 * Real-data counterpart to SourceInventoryCategory.tsx, for the
 * Repositories category only. No mock banner. No provider-vs-"All" split
 * like Clouds needed -- getInstallationRepos already returns everything in
 * one shot, so this is one bounded client-mode DataTable, same as
 * CodeSecurity.tsx's own real Repositories tab.
 */
export function RealRepositoryInventory() {
  const navigate = useNavigate();
  const [tab, setTab] = useTabParam<Tab>(TABS, 'Overview');
  const [filters, setFilters] = useState<Filters>({});
  const [assets, setAssets] = useState<RepoAssetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await getRealRepoAssets(filters);
      setAssets(res.items);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load repositories.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { void load(); }, [load]);

  const columns: Column<RepoAssetRow>[] = [
    { key: 'name', header: 'Repository', render: a => a.name, sortValue: a => a.name, sticky: true },
    { key: 'subType', header: 'Source', render: a => a.subType, sortValue: a => a.subType },
    {
      key: 'scanners', header: 'Scanners', render: a => (
        <Badge tone={a.scanners.length > 1 ? 'warning' : 'neutral'}>{a.scanners.length} scanner{a.scanners.length === 1 ? '' : 's'}</Badge>
      ),
    },
    { key: 'lastScan', header: 'Last Scan', render: a => formatDateTime(a.lastAggregatedScanAt), sortValue: a => a.lastAggregatedScanAt ?? '' },
    { key: 'scanStatus', header: 'Scan Status', render: a => <Badge tone={SCAN_ROLLUP_TONE[a.scanRollup]}>{a.scanRollup}</Badge>, sortValue: a => a.scanRollup },
    { key: 'findings', header: 'Findings', render: a => String(a.totalFindings), sortValue: a => a.totalFindings },
    { key: 'risk', header: 'Risk Score', render: a => String(a.riskScore), sortValue: a => a.riskScore },
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

      {loadError && (
        <div className="mb-4 rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-300 flex items-center justify-between gap-3" role="alert">
          <span>{loadError}</span>
          <button type="button" onClick={() => void load()} className="text-xs underline shrink-0">Retry</button>
        </div>
      )}

      {tab === 'Overview' && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Connected Repositories" value={String(assets.length)} icon="git-branch" />
            <StatCard label="Total Findings" value={assets.reduce((sum, a) => sum + a.totalFindings, 0).toLocaleString()} icon="target" iconTone="warning" />
            <StatCard label="Scanned" value={String(assets.filter(a => a.scanRollup === 'completed').length)} icon="shield-check-2" iconTone="good" />
            <StatCard label="Never Scanned" value={String(assets.filter(a => a.scanRollup === 'stale').length)} icon="alert-triangle" iconTone="neutral" />
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Findings by Repository</h3>
            <BarChart data={[...assets].sort((a, b) => b.totalFindings - a.totalFindings).slice(0, 8).map(a => ({ label: a.name, value: a.totalFindings }))} />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Real, persisted data — repositories via the connected GitHub App installation, scanner attachments and finding counts from each scanner's own real scan history.{' '}
            <Link to="/settings?tab=Git%20Integration" className="text-brand-600 dark:text-brand-400 hover:underline">Connect another repository →</Link>
          </p>
        </div>
      )}

      {tab === 'Asset List' && (
        <div>
          <SourceInventoryFilters filters={filters} onChange={setFilters} subTypes={config.subTypes.map(s => s.label)} scanners={REAL_REPO_SCANNER_NAMES} />
          <DataTable
            columns={columns}
            rows={assets}
            rowKey={a => a.id}
            onRowClick={a => navigate(`/source-inventory/repository/${a.id}`)}
            emptyMessage={
              !loading && assets.length === 0 && !filters.search && !filters.subType
                ? 'No repositories connected yet.'
                : 'No repositories match these filters.'
            }
          />
          {!loading && assets.length === 0 && !filters.search && !filters.subType && (
            <p className="mt-3 text-xs text-slate-400">
              <Link to="/settings?tab=Git%20Integration" className="text-brand-600 dark:text-brand-400 hover:underline">Connect a GitHub App installation under Settings › Git Integration →</Link>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
