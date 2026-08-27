import { Link } from 'react-router-dom';
import { StatCard } from './StatCard';
import { Badge, severityTone } from './Badge';

/** Matches the real shape of api.getVulnerabilityDashboard()'s response --
 * declared locally (not imported) since that method returns an inline
 * anonymous type, not a named export. Structural typing means the real
 * response satisfies this without a cast. */
export interface SecurityPostureDashboard {
  openFindings: number;
  bySeverity: Record<string, number>;
  riskScore: number;
  compliance: { benchmarksEvaluated: number; averagePassRate: number | null };
  topAssets?: Array<{ resource: string; label: string; findingCount: number }>;
}

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'] as const;

/** Mirrors VulnerabilityManagement.tsx's own riskBand thresholds -- kept as
 * a small local copy rather than a cross-page import, since it's a
 * three-line pure function and this component is meant to be usable
 * without pulling in that page's module. */
function riskBand(score: number): { label: string; tone: 'good' | 'warning' | 'critical' } {
  if (score >= 50) return { label: 'High risk', tone: 'critical' };
  if (score >= 20) return { label: 'Elevated risk', tone: 'warning' };
  return { label: 'Low risk', tone: 'good' };
}

/**
 * Written once, reused on Overview's Security Posture panel, Cloud
 * Security's Posture tab, and Security Scanning Center's Cloud Posture tab
 * -- one real risk-score/severity/compliance layout instead of rebuilding
 * it three times. Takes an already-fetched dashboard object; no fetch logic
 * of its own, matching this codebase's per-page-fetch convention (each
 * caller owns its own loading/error state).
 */
export function SecurityPostureSummary({
  dashboard,
  variant = 'full',
  detailHref,
}: {
  dashboard: SecurityPostureDashboard;
  /** 'compact' omits the Top Critical Assets list -- for inline use (e.g. Overview's panel) where a full drill-down list would crowd the rest of the page. */
  variant?: 'compact' | 'full';
  detailHref?: string;
}) {
  const band = riskBand(dashboard.riskScore);
  const topAssets = dashboard.topAssets ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Risk Score"
          value={String(dashboard.riskScore)}
          caption={band.label}
          icon="shield-check-2"
          iconTone={band.tone}
        />
        <StatCard label="Open Findings" value={String(dashboard.openFindings)} icon="alert-triangle" iconTone={dashboard.openFindings > 0 ? 'warning' : 'good'} />
        <StatCard label="Critical" value={String(dashboard.bySeverity.critical ?? 0)} icon="target" iconTone="critical" />
        <StatCard label="High" value={String(dashboard.bySeverity.high ?? 0)} icon="target" iconTone="serious" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {SEVERITY_ORDER.map(sev => (
          <Badge key={sev} tone={severityTone(sev)}>
            {dashboard.bySeverity[sev] ?? 0} {sev}
          </Badge>
        ))}
        <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">
          {dashboard.compliance.benchmarksEvaluated > 0 && dashboard.compliance.averagePassRate !== null
            ? `${Math.round(dashboard.compliance.averagePassRate * 100)}% average compliance pass rate across ${dashboard.compliance.benchmarksEvaluated} benchmark${dashboard.compliance.benchmarksEvaluated === 1 ? '' : 's'}`
            : 'No compliance benchmarks evaluated yet'}
        </span>
      </div>

      {variant === 'full' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200">
            Most Critical Assets
          </div>
          {topAssets.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-slate-400 dark:text-slate-500">No findings to prioritize right now.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {topAssets.slice(0, 8).map(a => (
                <li key={a.resource} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                  <span className="truncate text-slate-700 dark:text-slate-200">{a.label}</span>
                  <span className="shrink-0 text-xs tabular-nums text-slate-400 dark:text-slate-500">{a.findingCount} finding{a.findingCount === 1 ? '' : 's'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {detailHref && (
        <Link to={detailHref} className="self-start text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">
          View full security overview →
        </Link>
      )}
    </div>
  );
}
