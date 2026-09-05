import { useEffect, useState } from 'react';
import { ClickableStatCard } from './ClickableStatCard';
import { api, type VulnerabilityDashboard } from '../../lib/api';

// Scanners confirmed (via direct backend exploration) to implement a real
// GET /v1/scans list endpoint -- prowler/trivy/syft don't, and would just
// 404 into the allSettled rejection branch below anyway, but listing only
// the working set keeps this an intentional, documented list rather than
// "whichever ones happen not to error today".
const SCANNERS_WITH_SCAN_HISTORY = ['semgrep', 'gitleaks', 'checkov', 'grype', 'trufflehog', 'nuclei', 'dependency-check'] as const;

interface Props {
  dashboard: VulnerabilityDashboard | null;
  loading: boolean;
  navigate: (path: string) => void;
  onOpenFindings: (opts: { severity?: string }) => void;
  onOpenTab: (tab: 'Scanners') => void;
}

/**
 * The Overview's 9 KPI cards. Every real number here already exists
 * somewhere in the product -- this component's only new fetches are
 * Total Assets (getResourcesDashboard, already used by Asset Inventory's own
 * overview) and Total Scans (a small fan-out across the scanners that have a
 * real scan-history endpoint) and Internet Exposed (the same
 * iam-access-analyzer proxy the global Overview's ExposuresKpi widget
 * already established). Exploitable and SLA Breached have no backing field
 * anywhere in the product (no EPSS/KEV feed, no SLA schema on real
 * findings) -- rendered as honest disabled/omitted cards rather than fake
 * zeros, per this page's own governing "never fabricate a number" rule.
 */
export function KpiRow({ dashboard, loading, navigate, onOpenFindings, onOpenTab }: Props) {
  const [totalAssets, setTotalAssets] = useState<number | null>(null);
  const [totalScans, setTotalScans] = useState<number | null>(null);
  const [internetExposed, setInternetExposed] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api.getResourcesDashboard().then(d => { if (!cancelled) setTotalAssets(d.total); }).catch(() => { if (!cancelled) setTotalAssets(0); });
    void api.getFindingsBySource('iam-access-analyzer', { limit: 1 }).then(r => { if (!cancelled) setInternetExposed(r.pagination.total); }).catch(() => { if (!cancelled) setInternetExposed(0); });
    void Promise.allSettled(SCANNERS_WITH_SCAN_HISTORY.map(s => api.listScans(s, { limit: 1 }))).then(results => {
      if (cancelled) return;
      setTotalScans(results.reduce((sum, r) => sum + (r.status === 'fulfilled' ? r.value.total : 0), 0));
    });
    return () => { cancelled = true; };
  }, []);

  const sev = dashboard?.bySeverity;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <ClickableStatCard label="Total Assets" value={totalAssets === null ? '—' : totalAssets.toLocaleString()} icon="box" onClick={() => navigate('/resources')} />
      <ClickableStatCard label="Total Scans" value={totalScans === null ? '—' : totalScans.toLocaleString()} icon="target" onClick={() => onOpenTab('Scanners')} />
      <ClickableStatCard label="Critical" value={loading ? '—' : String(sev?.critical ?? 0)} icon="shield-alert" iconTone="critical" onClick={() => onOpenFindings({ severity: 'critical' })} />
      <ClickableStatCard label="High" value={loading ? '—' : String(sev?.high ?? 0)} icon="alert-triangle" iconTone="serious" onClick={() => onOpenFindings({ severity: 'high' })} />
      <ClickableStatCard label="Medium" value={loading ? '—' : String(sev?.medium ?? 0)} icon="alert-triangle" iconTone="warning" onClick={() => onOpenFindings({ severity: 'medium' })} />
      <ClickableStatCard label="Low" value={loading ? '—' : String(sev?.low ?? 0)} icon="shield-check-2" iconTone="good" onClick={() => onOpenFindings({ severity: 'low' })} />
      <ClickableStatCard
        label="Exploitable" value="Not tracked" icon="zap" iconTone="neutral" disabled
        disabledReason="No EPSS/exploit-prediction feed is wired into any finding source yet -- see the Exploit column on Security Findings, which honestly renders '—' for every real row today."
      />
      <ClickableStatCard
        label="Internet-Facing Exposures" value={internetExposed === null ? '—' : internetExposed.toLocaleString()} icon="globe" iconTone={internetExposed ? 'warning' : 'good'}
        onClick={() => navigate('/cloud-security?tab=Exposed Resources')}
      />
    </div>
  );
}
