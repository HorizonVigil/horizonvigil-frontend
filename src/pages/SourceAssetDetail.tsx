import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FilterBar } from '../components/FilterBar';
import { Badge, severityTone } from '../components/Badge';
import { EmptyState } from '../components/EmptyState';
import {
  SOURCE_CATEGORY_CONFIG, generateSourceAssetById, generateAggregatedFindings,
  type SourceCategory, type ScannerAttachment,
} from '../lib/demoData/sourceInventory';

const SCANNER_STATUS_TONE: Record<ScannerAttachment['status'], 'good' | 'warning' | 'critical' | 'neutral'> = {
  completed: 'good', running: 'warning', failed: 'critical', never_run: 'neutral',
};

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200">{title}</div>
      <div className="p-4 text-sm">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-slate-400 dark:text-slate-500">{label}</div>
      <div className="text-slate-700 dark:text-slate-200 mt-0.5">{value ?? '—'}</div>
    </div>
  );
}

/**
 * Asset Detail for the Source Inventory pillar -- one asset, one merged
 * identity: attached scanners each report their own run status, but
 * findings are deduplicated into a single list where a finding flagged by
 * 2+ scanners carries multiple "Detected by" chips instead of appearing
 * once per scanner. This is the one screen where that dedup concept has to
 * be visibly true, not just present in the data model (sourceInventory.ts).
 *
 * 100% mock data, same as SourceInventoryCategory.tsx -- no real scanner
 * backend exists for any Source Inventory category yet, so the banner here
 * is always-on rather than a toggle off of something real.
 */
export function SourceAssetDetail() {
  const { category, assetId } = useParams<{ category: string; assetId: string }>();
  const isValidCategory = category !== undefined && category in SOURCE_CATEGORY_CONFIG;
  const config = isValidCategory ? SOURCE_CATEGORY_CONFIG[category as SourceCategory] : null;
  const asset = isValidCategory && assetId ? generateSourceAssetById(category as SourceCategory, assetId) : null;
  const findings = useMemo(() => (asset ? generateAggregatedFindings(asset) : []), [asset]);

  if (!isValidCategory || !config || !asset) {
    return (
      <div className="min-w-0">
        <FilterBar title="Source Inventory" breadcrumb={<BackLink category={category} />} showAccountFilter={false} showRegionFilter={false} showDateFilter={false} />
        <EmptyState icon="box" title="Asset not found" description="This asset doesn't exist or its id is invalid." />
      </div>
    );
  }

  const totalFindings = Object.values(asset.bySeverity).reduce((a, b) => a + b, 0);
  const multiSourceCount = findings.filter(f => f.detectionSources.length > 1).length;

  return (
    <div className="min-w-0 max-w-4xl">
      <FilterBar title={asset.name} breadcrumb={<BackLink category={category} label={config.label} />} showAccountFilter={false} showRegionFilter={false} showDateFilter={false} />

      <div className="mb-4 rounded-lg border border-dashed border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
        Source Inventory is a UI preview with simulated data — no {config.label.toLowerCase()} scanner backend is connected yet.
      </div>

      <div className="flex flex-col gap-4">
        <Section title="Asset Overview">
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <Badge tone="neutral">{asset.subType}</Badge>
            <Badge tone={asset.scanRollup === 'completed' ? 'good' : asset.scanRollup === 'partial' ? 'warning' : asset.scanRollup === 'failed' ? 'critical' : 'neutral'}>
              Scan {asset.scanRollup}
            </Badge>
            {asset.internetExposed && <Badge tone="critical">Internet-exposed</Badge>}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Owner" value={asset.owner} />
            <Field label="Risk Score" value={asset.riskScore} />
            <Field label="Attached Scanners" value={asset.scanners.length} />
            <Field label="Last Aggregated Scan" value={formatDateTime(asset.lastAggregatedScanAt)} />
          </div>
        </Section>

        <Section title={`Attached Scanners (${asset.scanners.length})`}>
          {asset.scanners.length === 0 ? (
            <p className="text-xs text-slate-400">No scanners are attached to this asset yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {asset.scanners.map(s => (
                <div key={s.scanner} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 dark:border-slate-800 px-3 py-2">
                  <span className="text-slate-700 dark:text-slate-200 font-medium">{s.scanner}</span>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span>{formatDateTime(s.lastRunAt)}</span>
                    <Badge tone={SCANNER_STATUS_TONE[s.status]}>{s.status.replace('_', ' ')}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
          {asset.scanners.length > 1 && (
            <p className="text-xs text-slate-400 mt-3">
              This asset has {asset.scanners.length} scanners attached — findings below are merged into one list per issue, not duplicated per scanner.
            </p>
          )}
        </Section>

        <Section title={`Findings (${totalFindings.toLocaleString()})`}>
          {findings.length === 0 ? (
            <p className="text-xs text-slate-400">No findings from any completed scan on this asset.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {multiSourceCount > 0 && (
                <p className="text-xs text-slate-400 mb-1">
                  {multiSourceCount} of {findings.length} shown finding{multiSourceCount === 1 ? '' : 's'} {multiSourceCount === 1 ? 'was' : 'were'} independently confirmed by 2+ scanners.
                </p>
              )}
              {findings.map(f => (
                <div key={f.id} className="rounded-md border border-slate-200 dark:border-slate-800 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge tone={severityTone(f.severity)}>{f.severity}</Badge>
                      <span className="text-slate-700 dark:text-slate-200 truncate">{f.title}</span>
                      {f.cve && <span className="text-xs text-slate-400 shrink-0">{f.cve}</span>}
                    </div>
                    <Badge tone={f.status === 'open' ? 'warning' : f.status === 'resolved' ? 'good' : 'neutral'}>{f.status}</Badge>
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5 flex-wrap text-xs">
                    <span className="text-slate-400">Detected by:</span>
                    {f.detectionSources.map(src => <Badge key={src} tone={f.detectionSources.length > 1 ? 'warning' : 'neutral'}>{src}</Badge>)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Risk Correlation">
          {asset.internetExposed && asset.bySeverity.critical > 0 ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge tone="critical">Internet</Badge>
              <span className="text-slate-400">→</span>
              <Badge tone="neutral">{asset.subType}</Badge>
              <span className="text-slate-400">→</span>
              <Badge tone="critical">{asset.bySeverity.critical} critical finding{asset.bySeverity.critical === 1 ? '' : 's'}</Badge>
              <span className="text-slate-400">→</span>
              <Badge tone="warning">Risk score {asset.riskScore}</Badge>
            </div>
          ) : (
            <p className="text-xs text-slate-400">No confirmed internet exposure → critical finding chain for this asset.</p>
          )}
        </Section>

        <Section title="Scan Timeline">
          {asset.scanners.filter(s => s.lastRunAt).length === 0 ? (
            <p className="text-xs text-slate-400">No scans have completed on this asset yet.</p>
          ) : (
            <div className="flex flex-col gap-1.5 text-xs">
              {[...asset.scanners]
                .filter(s => s.lastRunAt)
                .sort((a, b) => (b.lastRunAt ?? '').localeCompare(a.lastRunAt ?? ''))
                .map(s => (
                  <div key={s.scanner} className="flex items-center justify-between gap-3">
                    <span className="text-slate-600 dark:text-slate-300">{s.scanner}</span>
                    <span className="text-slate-400">{formatDateTime(s.lastRunAt)}</span>
                  </div>
                ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function BackLink({ category, label }: { category?: string; label?: string }) {
  return (
    <Link to={`/source-inventory/${category ?? ''}`} className="text-xs text-slate-400 hover:underline">
      ← {label ?? 'Source Inventory'}
    </Link>
  );
}
