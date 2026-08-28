import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FilterBar } from '../../components/FilterBar';
import { Badge, severityTone } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import type { SourceAsset, AggregatedFinding, ScannerAttachment, Severity } from '../../lib/demoData/sourceInventory';
import { getRealRepoAssetById, getRealRepoAggregatedFindings } from '../../lib/sourceInventoryRepos';

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

function bySeverityFrom(findings: AggregatedFinding[]): Record<Severity, number> {
  const out: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, informational: 0 };
  for (const f of findings) out[f.severity]++;
  return out;
}

/**
 * Real-data counterpart to SourceAssetDetail.tsx, for Repositories only.
 * The one place a full, real per-severity breakdown exists for this
 * category -- bounded to one repo's own matched scans (see
 * lib/sourceInventoryRepos.ts), so fetching full results here is cheap,
 * unlike the Asset List which only has a bare finding count. "Detected by"
 * chips reflect a real CVE-based dedup across this repo's own scanners.
 */
export function RealRepositoryAssetDetail({ assetId }: { assetId: string }) {
  const [asset, setAsset] = useState<SourceAsset | null>(null);
  const [findings, setFindings] = useState<AggregatedFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    getRealRepoAssetById(assetId)
      .then(a => {
        if (cancelled) return;
        setAsset(a);
        if (!a) { setLoading(false); return; }
        return getRealRepoAggregatedFindings(a).then(f => { if (!cancelled) setFindings(f); });
      })
      .catch(err => { if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load this repository.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [assetId]);

  const bySeverity = useMemo(() => bySeverityFrom(findings), [findings]);

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
        <FilterBar title="Repositories" breadcrumb={<BackLink />} showAccountFilter={false} showRegionFilter={false} showDateFilter={false} />
        <EmptyState icon="git-branch" title="Repository not found" description={loadError ?? "This repository doesn't exist or you no longer have access to it."} />
      </div>
    );
  }

  const totalFindings = findings.length;
  const multiSourceCount = findings.filter(f => f.detectionSources.length > 1).length;

  return (
    <div className="min-w-0 max-w-4xl">
      <FilterBar title={asset.name} breadcrumb={<BackLink />} showAccountFilter={false} showRegionFilter={false} showDateFilter={false} />

      <div className="flex flex-col gap-4">
        <Section title="Repository Overview">
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <Badge tone="neutral">{asset.subType}</Badge>
            <Badge tone={asset.scanRollup === 'completed' ? 'good' : asset.scanRollup === 'partial' ? 'warning' : asset.scanRollup === 'failed' ? 'critical' : 'neutral'}>
              {asset.scanRollup === 'stale' ? 'never scanned' : asset.scanRollup}
            </Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Critical" value={bySeverity.critical} />
            <Field label="High" value={bySeverity.high} />
            <Field label="Risk Score" value={asset.riskScore} />
            <Field label="Last Scan" value={formatDateTime(asset.lastAggregatedScanAt)} />
          </div>
        </Section>

        <Section title={`Attached Scanners (${asset.scanners.length})`}>
          {asset.scanners.length === 0 ? (
            <p className="text-xs text-slate-400">No scans have run against this repository yet.</p>
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
              This repository has {asset.scanners.length} scanners attached — findings below are merged into one list per issue where a real CVE ties them together, not duplicated per scanner.
            </p>
          )}
        </Section>

        <Section title={`Findings (${totalFindings.toLocaleString()})`}>
          {findings.length === 0 ? (
            <p className="text-xs text-slate-400">No findings from any completed scan on this repository.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {multiSourceCount > 0 && (
                <p className="text-xs text-slate-400 mb-1">
                  {multiSourceCount} of {findings.length} shown finding{multiSourceCount === 1 ? '' : 's'} {multiSourceCount === 1 ? 'was' : 'were'} independently confirmed by 2+ scanners (matched by CVE).
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
          {bySeverity.critical > 0 ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge tone="neutral">{asset.name}</Badge>
              <span className="text-slate-400">→</span>
              <Badge tone="critical">{bySeverity.critical} critical finding{bySeverity.critical === 1 ? '' : 's'}</Badge>
              <span className="text-slate-400">→</span>
              <Badge tone="warning">Risk score {asset.riskScore}</Badge>
            </div>
          ) : (
            <p className="text-xs text-slate-400">No critical findings on this repository.</p>
          )}
        </Section>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/source-inventory/repository" className="text-xs text-slate-400 hover:underline">
      ← Repositories
    </Link>
  );
}
