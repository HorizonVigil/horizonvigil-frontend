import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DataTable, type Column } from './DataTable';
import { Badge } from './Badge';
import { api, type ScanRecord } from '../lib/api';

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

const SCAN_STATUS_TONE: Record<ScanRecord['status'], 'good' | 'warning' | 'critical' | 'neutral'> = {
  completed: 'good', running: 'warning', queued: 'neutral', failed: 'critical', cancelled: 'neutral', timeout: 'critical',
};

const columns: Column<ScanRecord>[] = [
  { key: 'target', header: 'Target', render: s => s.target.uri, sticky: true },
  { key: 'status', header: 'Status', render: s => <Badge tone={SCAN_STATUS_TONE[s.status]}>{s.status}</Badge>, sortValue: s => s.status },
  { key: 'findings', header: 'Findings', render: s => String(s.finding_count) },
  { key: 'started', header: 'Started', render: s => formatDateTime(s.started_at), sortValue: s => s.started_at ?? '' },
  { key: 'finished', header: 'Finished', render: s => formatDateTime(s.finished_at), sortValue: s => s.finished_at ?? '' },
];

/**
 * A real, persisted scan-history table for one cloudops360-scanner-*
 * service (api.listScans) -- used across Security Scanning Center,
 * Code & Repository Security, and Application & API Security rather than
 * three separate implementations, per the "don't duplicate UI logic"
 * requirement. Only real once that specific scanner's own GET /v1/scans
 * route has been rolled out (currently: semgrep, dependency-check, grype,
 * checkov, gitleaks, trufflehog, nuclei).
 */
export function ScanHistoryTable({ scannerKey, scannerLabel }: { scannerKey: string; scannerLabel: string }) {
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.listScans(scannerKey, { limit: 50 });
      setScans(res.items);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : `Could not load ${scannerLabel} scan history.`);
    } finally {
      setLoading(false);
    }
  }, [scannerKey, scannerLabel]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Real, persisted {scannerLabel} scan history — independently queryable, not just reachable while you still have the scan_id.
        </p>
        <Link to="/vulnerability-management?tab=Scanners" className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline shrink-0">Run a new scan →</Link>
      </div>
      {loadError && (
        <div className="mb-4 rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-300 flex items-center justify-between gap-3" role="alert">
          <span>{loadError}</span>
          <button type="button" onClick={() => void load()} className="text-xs underline shrink-0">Retry</button>
        </div>
      )}
      {loading && !loadError && <p className="text-xs text-slate-400 mb-4">Loading…</p>}
      <DataTable columns={columns} rows={scans} rowKey={s => s.scan_id} emptyMessage={`No ${scannerLabel} scans yet — run one from Vulnerability Management's Scanners tab.`} />
    </div>
  );
}
