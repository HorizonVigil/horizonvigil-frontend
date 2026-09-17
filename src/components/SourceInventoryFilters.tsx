import type { Severity, SourceAsset, SourceInventoryFilters as Filters } from '../lib/demoData/sourceInventory';

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'informational'];
const SCAN_STATUSES: SourceAsset['scanRollup'][] = ['completed', 'partial', 'failed', 'stale'];

/**
 * Placeholder used by the real source-inventory adapters for an asset whose
 * owner was never collected. Such a value is not a selectable owner.
 */
const OWNER_NOT_COLLECTED = '—';

/**
 * Owner options come from the loaded assets, like every other option list on
 * this row.
 *
 * They used to be a hard-coded array of invented team names ('Platform Team',
 * 'AppSec Team', ...). The real adapters set `owner: '—'` on every asset
 * because ownership is not collected for these sources, and the filter
 * compares `asset.owner === filters.owner` -- so picking any offered owner
 * matched nothing, every time, and the page reported an empty inventory. That
 * is a NOT_COLLECTED field rendered as a genuine zero result.
 */
function selectableOwners(assets: readonly SourceAsset[]): string[] {
  const owners = new Set<string>();

  for (const asset of assets) {
    const owner = asset?.owner?.trim();

    if (owner && owner !== OWNER_NOT_COLLECTED) {
      owners.add(owner);
    }
  }

  return [...owners].sort((a, b) => a.localeCompare(b));
}

/**
 * The 9-dimension filter row the Source Inventory spec asks for, applied
 * consistently across all six categories (Category itself is implicit from
 * the route, not a filter here). Controlled component -- state lives in the
 * page (URL-persisted, same pattern as VulnerabilityManagement.tsx's
 * Security Findings filters) so this can be mounted identically per
 * category with just a different `subTypes`/`scanners` option list.
 */
export function SourceInventoryFilters({
  filters, onChange, subTypes, scanners, assets,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
  subTypes: string[];
  scanners: string[];
  /** Loaded assets for this page — the source of the owner options. */
  assets: readonly SourceAsset[];
}) {
  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    onChange({ ...filters, [key]: value || undefined });
  }

  const owners = selectableOwners(assets);
  const ownerFilterAvailable = owners.length > 0;

  return (
    <div className="flex flex-wrap gap-2 text-xs mb-3">
      <input
        value={filters.search ?? ''}
        onChange={e => set('search', e.target.value)}
        placeholder="Search by name…"
        className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-slate-700 dark:text-slate-200 w-48"
      />
      <select value={filters.subType ?? ''} onChange={e => set('subType', e.target.value as Filters['subType'])} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-slate-700 dark:text-slate-200">
        <option value="">All sub-types</option>
        {subTypes.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <select value={filters.severity ?? ''} onChange={e => set('severity', e.target.value as Severity || undefined)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-slate-700 dark:text-slate-200">
        <option value="">All severities</option>
        {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <select value={filters.scanStatus ?? ''} onChange={e => set('scanStatus', e.target.value as SourceAsset['scanRollup'] || undefined)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-slate-700 dark:text-slate-200">
        <option value="">Any scan status</option>
        {SCAN_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <select value={filters.scanner ?? ''} onChange={e => set('scanner', e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-slate-700 dark:text-slate-200">
        <option value="">Any scanner</option>
        {scanners.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      {/* Disabled, and labelled with the reason, when ownership was not
          collected for these assets. Offering owners that match nothing would
          turn "we never collected this" into "you own nothing here". */}
      <select
        value={filters.owner ?? ''}
        onChange={e => set('owner', e.target.value)}
        disabled={!ownerFilterAvailable}
        title={ownerFilterAvailable ? undefined : 'Ownership is not collected for these assets'}
        aria-label={ownerFilterAvailable ? 'Filter by owner' : 'Filter by owner — ownership is not collected for these assets'}
        className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-slate-700 dark:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <option value="">{ownerFilterAvailable ? 'All owners' : 'Owner not collected'}</option>
        {owners.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <label className="flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-slate-700 dark:text-slate-200 cursor-pointer">
        <input type="checkbox" checked={filters.internetExposed ?? false} onChange={e => set('internetExposed', e.target.checked || undefined)} />
        Internet-exposed only
      </label>
    </div>
  );
}
