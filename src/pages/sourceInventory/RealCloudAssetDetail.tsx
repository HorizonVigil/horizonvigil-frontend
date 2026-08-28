import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FilterBar } from '../../components/FilterBar';
import { Badge, severityTone } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import type { SourceAsset, AggregatedFinding, ScannerAttachment } from '../../lib/demoData/sourceInventory';
import { getRealCloudAssetById, getRealCloudAggregatedFindings } from '../../lib/sourceInventoryClouds';

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
 * Real-data counterpart to SourceAssetDetail.tsx, for Clouds only. Same
 * section shape as the mock version, but every field comes from
 * lib/sourceInventoryClouds.ts's real adapter -- no mock banner, and
 * "Detected by" chips reflect a real dedup across a connection's own real
 * findings (see that file's getRealCloudAggregatedFindings doc comment).
 */
export function RealCloudAssetDetail({ assetId }: { assetId: string }) {
  const [asset, setAsset] = useState<SourceAsset | null>(null);
  const [findings, setFindings] = useState<AggregatedFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    getRealCloudAssetById(assetId)
      .then(a => {
        if (cancelled) return;
        setAsset(a);
        if (!a) { setLoading(false); return; }
        return getRealCloudAggregatedFindings(a).then(f => { if (!cancelled) setFindings(f); });
      })
      .catch(err => { if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load this cloud account.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [assetId]);

  if (loading) {
    return (
      <div className="min-w-0">
        <FilterBar title="Loading…" breadcrumb={<BackLink />} showAccountFilter={false} showRegionFilter={false} showDateFilter={false} />
        <p className="text-xs text-slate-400">Loading…</p>
      </div>
    );
  }

  if (loadError || !asset) {
    return (
      <div className="min-w-0">
        <FilterBar title="Clouds" breadcrumb={<BackLink />} showAccountFilter={false} showRegionFilter={false} showDateFilter={false} />
        <EmptyState icon="box" title="Cloud account not found" description={loadError ?? "This account doesn't exist or you no longer have access to it."} />
      </div>
    );
  }

  const totalFindings = Object.values(asset.bySeverity).reduce((a, b) => a + b, 0);
  const multiSourceCount = findings.filter(f => f.detectionSources.length > 1).length;

  return (
    <div className="min-w-0 max-w-4xl">
      <FilterBar title={asset.name} breadcrumb={<BackLink />} showAccountFilter={false} showRegionFilter={false} showDateFilter={false} />

      <div className="flex flex-col gap-4">
        <Section title="Account Overview">
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <Badge tone="neutral">{asset.subType}</Badge>
            <Badge tone={asset.scanRollup === 'completed' ? 'good' : asset.scanRollup === 'partial' ? 'warning' : asset.scanRollup === 'failed' ? 'critical' : 'neutral'}>
              {asset.scanRollup === 'completed' ? 'connected' : asset.scanRollup === 'stale' ? 'pending' : 'not connected'}
            </Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Owner" value={asset.owner} />
            <Field label="Risk Score" value={asset.riskScore} />
            <Field label="Active Sources" value={asset.scanners.length} />
            <Field label="Last Sync" value={formatDateTime(asset.lastAggregatedScanAt)} />
          </div>
        </Section>

        <Section title={`Attached Scanners (${asset.scanners.length})`}>
          {asset.scanners.length === 0 ? (
            <p className="text-xs text-slate-400">No findings have been reported for this account by any security source yet.</p>
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
              This account has findings from {asset.scanners.length} sources — findings below are merged into one list per issue, not duplicated per source.
            </p>
          )}
        </Section>

        <Section title={`Findings (${totalFindings.toLocaleString()})`}>
          {findings.length === 0 ? (
            <p className="text-xs text-slate-400">No open findings for this account.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {multiSourceCount > 0 && (
                <p className="text-xs text-slate-400 mb-1">
                  {multiSourceCount} of {findings.length} shown finding{multiSourceCount === 1 ? '' : 's'} {multiSourceCount === 1 ? 'was' : 'were'} independently confirmed by 2+ sources.
                </p>
              )}
              {findings.map(f => (
                <div key={f.id} className="rounded-md border border-slate-200 dark:border-slate-800 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge tone={severityTone(f.severity)}>{f.severity}</Badge>
                      <span className="text-slate-700 dark:text-slate-200 truncate">{f.title}</span>
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
          {asset.bySeverity.critical > 0 ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge tone="neutral">{asset.subType}</Badge>
              <span className="text-slate-400">→</span>
              <Badge tone="critical">{asset.bySeverity.critical} critical finding{asset.bySeverity.critical === 1 ? '' : 's'}</Badge>
              <span className="text-slate-400">→</span>
              <Badge tone="warning">Risk score {asset.riskScore}</Badge>
            </div>
          ) : (
            <p className="text-xs text-slate-400">No critical findings on this account.</p>
          )}
        </Section>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/source-inventory/cloud" className="text-xs text-slate-400 hover:underline">
      ← Clouds
    </Link>
  );
}
