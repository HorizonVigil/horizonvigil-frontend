import { useEffect, useState } from 'react';
import { Badge, severityTone } from '../Badge';
import { Icon } from '../icons';
import { api, type VulnerabilityFinding } from '../../lib/api';

interface Props {
  connectionId?: string;
  navigate: (path: string) => void;
  onViewAllCritical: () => void;
}

/**
 * Ranked by context_risk_score (severity + internet exposure + asset
 * criticality, computed server-side by the vulnerability_findings_set_context
 * trigger -- see the criticalNow query param on GET /findings), not just
 * recency. This is the one Overview section that's genuinely account-scoped
 * (getFindings accepts connection_id; the dashboard endpoint doesn't) --
 * unlike KpiRow/ScanCategorySummary/RiskSummary/TopRiskyAssets/Remediation,
 * which stay org-wide regardless of the Account filter.
 *
 * Columns only ever show real fields: Owner/SLA/Known-Exploited render '—'
 * (no owner/SLA schema, no KEV feed exist yet) and there's no Assign action
 * for the same reason -- a fake assignment button would be worse than no
 * button. Fix Available is a real proxy (remediation_link present or not),
 * not a guess.
 */
export function CriticalNow({ connectionId, navigate, onViewAllCritical }: Props) {
  const [items, setItems] = useState<VulnerabilityFinding[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void api.getFindings({ criticalNow: true, limit: 8, connection_id: connectionId })
      .then(res => { if (!cancelled) setItems(res.items); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [connectionId]);

  return (
    <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-white dark:bg-slate-900 overflow-hidden">
      <div className="px-4 py-3 border-b border-red-100 dark:border-red-900/40 flex items-center justify-between bg-red-50/50 dark:bg-red-950/20">
        <span className="flex items-center gap-2 text-sm font-semibold text-red-800 dark:text-red-300">
          <Icon name="shield-alert" size={15} />
          Critical Now
        </span>
        <button type="button" onClick={onViewAllCritical} className="text-xs font-medium text-red-700 dark:text-red-300 hover:underline">View All Critical →</button>
      </div>

      {loading ? (
        <p className="px-4 py-6 text-center text-xs text-slate-400">Loading…</p>
      ) : items.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-slate-400">Nothing urgent right now — no open findings currently meet the Critical Now bar (severity + exposure + asset criticality).</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {items.map(f => (
            <li key={f.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
              <Badge tone={severityTone(f.severity)}>{f.severity}</Badge>
              <div className="min-w-0 flex-1">
                <button type="button" onClick={() => navigate(`/vulnerability-management/findings/${f.id}`)} className="block truncate text-left text-slate-700 dark:text-slate-200 hover:underline font-medium">
                  {f.title}
                </button>
                <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                  <span>{f.asset_type ?? '—'}</span>
                  <span>·</span>
                  <span>{f.environment ?? '—'}</span>
                  {f.internet_exposed && <><span>·</span><span className="text-amber-600 dark:text-amber-400">Internet-exposed</span></>}
                  {f.remediation_link && <><span>·</span><span className="text-emerald-600 dark:text-emerald-400">Fix available</span></>}
                </div>
              </div>
              {f.context_risk_score != null && (
                <span className="shrink-0 text-xs font-medium tabular-nums text-slate-500 dark:text-slate-400" title="Context risk score (0-100)">{f.context_risk_score}</span>
              )}
              <div className="shrink-0 flex items-center gap-2">
                <button type="button" onClick={() => navigate(`/vulnerability-management/findings/${f.id}`)} className="text-xs text-brand-600 dark:text-brand-400 hover:underline">View</button>
                <button type="button" onClick={() => navigate('/automation?tab=remediation')} className="text-xs text-red-600 dark:text-red-400 hover:underline">Remediate</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
