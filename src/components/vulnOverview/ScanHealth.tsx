import { useEffect, useState } from 'react';
import { Icon } from '../icons';
import { api } from '../../lib/api';
import type { UnifiedAccountRow } from '../../lib/unifiedAccounts';

const CATEGORY_SCANNERS: Record<string, readonly string[]> = {
  'Repository Scans': ['semgrep', 'gitleaks', 'trufflehog', 'dependency-check', 'grype'],
  'URL & API Scans': ['nuclei'],
  'Container Image Scans': ['trivy'],
};
const CATEGORY_TARGET: Record<string, string> = {
  'Cloud Scans': '/cloud-security?tab=Overview',
  'Repository Scans': '/code-security?tab=Overview',
  'URL & API Scans': '/application-security?tab=Overview',
  // '&' percent-encoded (%26) -- see ScanCategorySummary.tsx's comment on
  // this exact same target for why (an unencoded '&' is the query-string
  // delimiter and silently truncates the tab name).
  'Container Image Scans': '/container-security?tab=Docker %26 Container Images',
  'Server & VM Scans': '/infrastructure-security',
  'Cluster & Runtime Scans': '/container-security?tab=Kubernetes Security',
};
// Neither has a vulnerability scanner to report reachability for -- Server &
// VM has no scanner at all, Cluster & Runtime has real live inventory but no
// CVE/posture scanner (kube-bench/kubescape unimplemented). Same honest "No
// scanner" reading for both rather than fabricating a health percentage.
const NO_SCANNER_CATEGORIES = new Set(['Server & VM Scans', 'Cluster & Runtime Scans']);

interface Props {
  connections: UnifiedAccountRow[];
  navigate: (path: string) => void;
}

/**
 * "% healthy" per category, sourced from api.getScannerStatuses() (one
 * shared call, `reachable` per scanner) plus connection status for Cloud.
 * Server & VM has no scanner to report on at all -- "No scanner", never a
 * 0%/red reading that would misleadingly imply something is broken.
 */
export function ScanHealth({ connections, navigate }: Props) {
  const [reachable, setReachable] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api.getScannerStatuses().then(res => { if (!cancelled) setReachable(Object.fromEntries(res.scanners.map(s => [s.scanner, s.reachable]))); });
    return () => { cancelled = true; };
  }, []);

  const cloudConns = connections.filter(c => ['aws', 'gcp', 'azure'].includes(c.provider));
  const cloudPct = cloudConns.length === 0 ? null : Math.round((cloudConns.filter(c => c.status === 'connected').length / cloudConns.length) * 100);

  const rows = Object.keys(CATEGORY_TARGET).map(label => {
    if (label === 'Cloud Scans') return { label, pct: cloudPct };
    if (NO_SCANNER_CATEGORIES.has(label)) return { label, pct: null as number | null, noScanner: true };
    const scanners = CATEGORY_SCANNERS[label] ?? [];
    if (!reachable || scanners.length === 0) return { label, pct: null as number | null };
    const healthy = scanners.filter(s => reachable[s]).length;
    return { label, pct: Math.round((healthy / scanners.length) * 100) };
  });

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Scan Health</h3>
      <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
        {rows.map(row => (
          <li key={row.label} className="py-2">
            <button type="button" onClick={() => navigate(CATEGORY_TARGET[row.label])} className="w-full flex items-center justify-between gap-3 text-left hover:opacity-80">
              <span className="text-sm text-slate-600 dark:text-slate-300">{row.label}</span>
              {'noScanner' in row ? (
                <span className="flex items-center gap-1.5 text-xs text-slate-400"><Icon name="cloud-off" size={12} />No scanner</span>
              ) : row.pct === null ? (
                <span className="text-xs text-slate-400">—</span>
              ) : (
                <span className={`text-xs font-medium tabular-nums ${row.pct >= 90 ? 'text-emerald-600 dark:text-emerald-400' : row.pct >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                  {row.pct}% healthy
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
