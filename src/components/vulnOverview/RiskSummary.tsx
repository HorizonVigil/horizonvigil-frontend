import { useEffect, useState } from 'react';
import { Donut } from '../charts/Donut';
import { Icon } from '../icons';
import { api, type VulnerabilityDashboard } from '../../lib/api';

const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;
const SEVERITY_TONE = { critical: 'critical', high: 'serious', medium: 'warning', low: 'good' } as const;

interface Props {
  dashboard: VulnerabilityDashboard | null;
}

/** Small local copy, not a cross-file import -- same three-line pure
 * function this codebase already keeps duplicated in
 * VulnerabilityManagement.tsx and SecurityPostureSummary.tsx rather than
 * sharing, per SecurityPostureSummary's own comment on why. */
function riskBand(score: number): { label: string; className: string } {
  if (score >= 50) return { label: 'High risk', className: 'text-red-600 dark:text-red-400' };
  if (score >= 20) return { label: 'Elevated risk', className: 'text-amber-600 dark:text-amber-400' };
  return { label: 'Low risk', className: 'text-emerald-600 dark:text-emerald-400' };
}

/**
 * Severity donut (same dashboard.bySeverity KpiRow already reads -- no
 * second fetch) plus an exposure row. Exploitable/Known Exploited (KEV) have
 * no backing feed anywhere in the product -- shown as "Not tracked" rather
 * than a fabricated 0, same rule KpiRow follows. Production is scoped out
 * entirely (not even an honest placeholder row) since `environment` isn't a
 * filterable/aggregable dimension on any endpoint today -- a count here
 * would require an unbounded findings fetch just to tally one field, which
 * this codebase already treats as something to avoid (see the 5,000-row
 * export cap elsewhere on this page).
 */
export function RiskSummary({ dashboard }: Props) {
  const [internetExposed, setInternetExposed] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api.getFindingsBySource('iam-access-analyzer', { limit: 1 }).then(r => { if (!cancelled) setInternetExposed(r.pagination.total); }).catch(() => { if (!cancelled) setInternetExposed(0); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300">Risk Summary</h3>
          {dashboard && (
            <span className="text-xs font-medium tabular-nums">
              <span className="text-slate-400 mr-1">Risk Score</span>
              <span className={riskBand(dashboard.riskScore).className}>{dashboard.riskScore}/100 · {riskBand(dashboard.riskScore).label}</span>
            </span>
          )}
        </div>
        <Donut
          data={SEVERITIES.map(s => ({ label: s.charAt(0).toUpperCase() + s.slice(1), value: dashboard?.bySeverity[s] ?? 0, tone: SEVERITY_TONE[s] })).filter(d => d.value > 0)}
          centerLabel={{ value: String(dashboard?.openFindings ?? 0), caption: 'Total' }}
          showPercent
        />
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Exposure</h3>
        <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
          <li className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300"><Icon name="globe" size={14} className="text-slate-400" />Internet-Facing Exposures</span>
            <span className="tabular-nums font-medium text-slate-800 dark:text-slate-100">{internetExposed === null ? '—' : internetExposed.toLocaleString()}</span>
          </li>
          <li className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="flex items-center gap-2 text-slate-400"><Icon name="zap" size={14} />Exploitable</span>
            <span className="text-xs text-slate-400" title="No EPSS/exploit-prediction feed is wired into any finding source yet.">Not tracked</span>
          </li>
          <li className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="flex items-center gap-2 text-slate-400"><Icon name="shield-alert" size={14} />Known Exploited (KEV)</span>
            <span className="text-xs text-slate-400" title="No CISA KEV (or equivalent) feed is integrated yet.">Not tracked</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
