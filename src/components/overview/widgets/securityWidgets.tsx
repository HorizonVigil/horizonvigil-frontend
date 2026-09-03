/**
 * Security- and IaC-category Overview widgets.
 *
 * getVulnerabilityDashboard / getAttackPaths / getComplianceBenchmarks /
 * getIdentitySummary are org-wide today (no scope param) — a restricted
 * user's security numbers over-report until the endpoints gain one.
 * getFindings accepts `connection_id`, so the list widgets ARE scoped.
 */
import { SecurityPostureSummary, type SecurityPostureDashboard } from '../../SecurityPostureSummary';
import { api } from '../../../lib/api';
import { scopedConnectionId } from '../../../lib/overview/scope';
import type { WidgetComponent } from '../../../lib/overview/types';
import { KpiValue, PendingBody, ViewAllLink, WidgetAction, WidgetBody, severityToneOf, useWidgetQuery } from './shared';

export const SecurityPostureWidget: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('security-posture', ctx, () => api.getVulnerabilityDashboard());
  return (
    <WidgetBody query={query} errorLabel="Security posture couldn't be loaded." emptyTitle="No security data yet"
      emptyDescription="Connect a cloud account to start seeing your posture." emptyIcon="shield-check-2"
      isEmpty={(d) => d.openFindings === 0 && d.riskScore === 0}>
      {(d) => <SecurityPostureSummary dashboard={d as SecurityPostureDashboard} variant="compact" detailHref="/cloud-security" />}
    </WidgetBody>
  );
};

export const SecurityScoreWidget: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('security-score', ctx, () => api.getVulnerabilityDashboard());
  return (
    <WidgetBody query={query} errorLabel="Security score couldn't be loaded." emptyTitle="No score yet"
      emptyIcon="gauge" isEmpty={() => false}>
      {(d) => {
        const band = d.riskScore >= 50 ? { label: 'High risk', cls: 'text-red-600 dark:text-red-400' }
          : d.riskScore >= 20 ? { label: 'Elevated risk', cls: 'text-amber-600 dark:text-amber-400' }
          : { label: 'Low risk', cls: 'text-emerald-600 dark:text-emerald-400' };
        return (
          <div className="flex flex-col gap-1">
            <div className="text-4xl font-bold tabular-nums text-slate-900 dark:text-white">{d.riskScore}</div>
            <div className={`text-sm font-medium ${band.cls}`}>{band.label}</div>
            <div className="text-xs text-slate-400 mt-1">{d.openFindings.toLocaleString()} open findings</div>
          </div>
        );
      }}
    </WidgetBody>
  );
};

export const CriticalVulnerabilitiesWidget: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('critical-vulnerabilities', ctx, () =>
    api.getFindings({ severity: 'critical', status: 'open', limit: 6, connection_id: scopedConnectionId(ctx.scope) }));
  return (
    <WidgetBody query={query} errorLabel="Critical vulnerabilities couldn't be loaded." emptyTitle="No open critical findings"
      emptyDescription="Nothing at critical severity right now." emptyIcon="shield-check"
      isEmpty={(d) => d.items.length === 0}>
      {(d) => (
        <div className="flex flex-col gap-2">
          <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {d.items.map((f) => (
              <li key={f.id} className="py-1.5">
                <button type="button" onClick={() => ctx.navigate(`/vulnerability-management/findings/${f.id}`)}
                  className="text-left text-slate-600 dark:text-slate-300 hover:underline truncate w-full">{f.title}</button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <ViewAllLink to="/vulnerability-management?tab=Security Findings&preset=critical" label="View all critical" />
            <WidgetAction ctx={ctx} need="security.remediate" label="Remediate" to="/automation?tab=remediation" tone="danger" />
          </div>
        </div>
      )}
    </WidgetBody>
  );
};

export const AttackPathsWidget: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('attack-paths', ctx, () => api.getAttackPaths());
  return (
    <WidgetBody query={query} errorLabel="Attack paths couldn't be loaded." emptyTitle="No attack paths"
      emptyDescription="No resource has exposure + a vulnerability + over-privilege converging." emptyIcon="target"
      isEmpty={(d) => d.items.length === 0}>
      {(d) => (
        <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 text-xs">
          {d.items.slice(0, 6).map((p) => (
            <li key={p.resource_id} className="py-1.5 flex items-center justify-between gap-2">
              <span className="text-slate-600 dark:text-slate-300 truncate">{p.resource_name ?? p.resource_id}</span>
              <span className={`shrink-0 font-medium ${p.computed_severity === 'critical' ? 'text-red-600 dark:text-red-400' : 'text-orange-600 dark:text-orange-400'}`}>{p.computed_severity}</span>
            </li>
          ))}
        </ul>
      )}
    </WidgetBody>
  );
};

export const ExposureWidget: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('exposure', ctx, () => api.getFindingsBySource('iam-access-analyzer', { limit: 6 }));
  return (
    <WidgetBody query={query} errorLabel="Exposure couldn't be loaded." emptyTitle="No public exposures found"
      emptyIcon="globe" isEmpty={(d) => d.items.length === 0}>
      {(d) => (
        <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 text-xs">
          {d.items.map((f) => (
            <li key={f.id} className="py-1.5 flex items-center justify-between gap-2">
              <span className="text-slate-600 dark:text-slate-300 truncate">{f.title}</span>
              <span className={`shrink-0 font-medium ${severityToneOf(f.severity) === 'critical' ? 'text-red-600 dark:text-red-400' : 'text-orange-600 dark:text-orange-400'}`}>{f.severity}</span>
            </li>
          ))}
        </ul>
      )}
    </WidgetBody>
  );
};

export const ComplianceWidget: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('compliance', ctx, () => api.getComplianceBenchmarks({ limit: 20 }));
  return (
    <WidgetBody query={query} errorLabel="Compliance couldn't be loaded." emptyTitle="No benchmarks evaluated"
      emptyIcon="check-square" isEmpty={(d) => d.items.length === 0}>
      {(d) => (
        <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 text-sm">
          {d.items.map((b) => {
            const pct = b.passRate === null ? null : Math.round(b.passRate * 100);
            return (
              <li key={b.id} className="flex items-center justify-between gap-2 py-2">
                <span className="text-slate-700 dark:text-slate-200 uppercase text-xs">{b.framework.replace(/_/g, ' ')}</span>
                <span className={`text-xs font-medium tabular-nums ${pct === null ? 'text-slate-400' : pct >= 80 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  {pct === null ? 'n/a' : `${pct}%`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </WidgetBody>
  );
};

export const IdentityRiskWidget: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('identity-risk', ctx, () => api.getIdentitySummary());
  return (
    <WidgetBody query={query} errorLabel="Identity risk couldn't be loaded." emptyTitle="No identities discovered"
      emptyIcon="users" isEmpty={(d) => (d.total ?? 0) === 0}>
      {(d) => (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div><div className="text-lg font-semibold text-red-600 dark:text-red-400 tabular-nums">{d.adminEquivalent ?? 0}</div><div className="text-[10px] uppercase text-slate-400">admin-equiv</div></div>
            <div><div className="text-lg font-semibold text-amber-600 dark:text-amber-400 tabular-nums">{d.broad ?? 0}</div><div className="text-[10px] uppercase text-slate-400">broad</div></div>
            <div><div className="text-lg font-semibold text-orange-600 dark:text-orange-400 tabular-nums">{d.humanWithoutMfa ?? 0}</div><div className="text-[10px] uppercase text-slate-400">no MFA</div></div>
          </div>
          <ViewAllLink to="/cloud-accounts?tab=Identities" label="Review identities" />
        </div>
      )}
    </WidgetBody>
  );
};

export const ContainerSecurityWidget: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('container-security', ctx, () => api.getFindingsBySource('container-images', { limit: 6 }));
  return (
    <WidgetBody query={query} errorLabel="Container security couldn't be loaded." emptyTitle="No image findings"
      emptyDescription="Run a Trivy image scan." emptyIcon="containers" isEmpty={(d) => d.items.length === 0}>
      {(d) => (
        <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 text-xs">
          {d.items.map((f) => (
            <li key={f.id} className="py-1.5 flex items-center justify-between gap-2">
              <span className="text-slate-600 dark:text-slate-300 truncate">{f.title}</span>
              <span className={`shrink-0 font-medium ${severityToneOf(f.severity) === 'critical' ? 'text-red-600 dark:text-red-400' : 'text-orange-600 dark:text-orange-400'}`}>{f.severity}</span>
            </li>
          ))}
        </ul>
      )}
    </WidgetBody>
  );
};

export const KubernetesSecurityWidget: WidgetComponent = () => (
  <PendingBody icon="layers" note="Kubernetes posture needs Kubescape / kube-bench results. Run a cluster scan to populate this widget."
    cta={{ label: 'Open Container & Kubernetes Security', to: '/container-security' }} />
);

// ── IaC-category (security-module-backed) ─────────────────────────────────

export const ConfigurationDriftWidget: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('configuration-drift', ctx, () => api.getFindingsBySource('aws-config', { limit: 6 }));
  return (
    <WidgetBody query={query} errorLabel="Configuration drift couldn't be loaded." emptyTitle="No config drift"
      emptyDescription="AWS Config is reporting all resources compliant." emptyIcon="check-circle"
      isEmpty={(d) => d.items.length === 0}>
      {(d) => (
        <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 text-xs">
          {d.items.map((f) => (
            <li key={f.id} className="py-1.5 text-slate-600 dark:text-slate-300 truncate">{f.title}</li>
          ))}
        </ul>
      )}
    </WidgetBody>
  );
};

export const IacChangesWidget: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('iac-changes', ctx, () => api.listScans('checkov', { limit: 6 }), { retry: false });
  return (
    <WidgetBody query={query} errorLabel="No Checkov scan history yet — run an IaC scan to populate this." emptyTitle="No IaC scans yet"
      emptyDescription="Run a Checkov scan from Security Scanning." emptyIcon="code"
      isEmpty={(d) => d.items.length === 0}>
      {(d) => (
        <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 text-xs">
          {d.items.map((s) => (
            <li key={s.scan_id} className="py-1.5 flex items-center justify-between gap-2">
              <span className="text-slate-600 dark:text-slate-300 truncate">{s.target?.uri ?? s.scan_type}</span>
              <span className="text-slate-400 shrink-0 tabular-nums">{s.finding_count} findings</span>
            </li>
          ))}
        </ul>
      )}
    </WidgetBody>
  );
};

export const TerraformDriftWidget: WidgetComponent = () => (
  <PendingBody icon="layers" note="Drift detection needs Terraform state ingestion. Until then, IaC misconfigurations are covered by Checkov scans."
    cta={{ label: 'Open IaC Scanning', to: '/security-scanning?tab=IaC Scanning' }} />
);

// ── KPIs ──────────────────────────────────────────────────────────────────

export const SecurityScoreKpi: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('kpi-security-score', ctx, () => api.getVulnerabilityDashboard());
  const s = query.data?.riskScore;
  return <KpiValue label="Security Score" value={s === undefined ? '—' : String(s)} icon="shield-check-2"
    tone={s === undefined ? 'neutral' : s >= 50 ? 'critical' : s >= 20 ? 'warning' : 'good'}
    caption={s === undefined ? '' : s >= 50 ? 'High risk' : s >= 20 ? 'Elevated' : 'Low risk'}
    onClick={() => ctx.navigate('/vulnerability-management')} />;
};

export const CriticalRisksKpi: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('kpi-critical-risks', ctx, () => api.getVulnerabilityDashboard());
  const n = query.data ? (query.data.bySeverity.critical ?? 0) + (query.data.bySeverity.high ?? 0) : undefined;
  return <KpiValue label="Critical Risks" value={n === undefined ? '—' : n.toLocaleString()} icon="target"
    tone={n ? 'critical' : 'good'} caption="critical + high" onClick={() => ctx.navigate('/vulnerability-management?tab=Security Findings&preset=critical')} />;
};

export const CriticalVulnerabilitiesKpi: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('kpi-critical-vulnerabilities', ctx, () => api.getVulnerabilityDashboard());
  const n = query.data?.bySeverity.critical;
  return <KpiValue label="Critical Vulnerabilities" value={n === undefined ? '—' : String(n)} icon="shield-alert"
    tone={n ? 'critical' : 'good'} onClick={() => ctx.navigate('/vulnerability-management?tab=Security Findings&preset=critical')} />;
};

export const CriticalFindingsKpi: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('kpi-critical-findings', ctx, () => api.getVulnerabilityDashboard());
  const n = query.data?.bySeverity.critical;
  return <KpiValue label="Critical Findings" value={n === undefined ? '—' : String(n)} icon="alert-triangle"
    tone={n ? 'critical' : 'good'} onClick={() => ctx.navigate('/vulnerability-management')} />;
};

export const ExposuresKpi: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('kpi-exposures', ctx, () => api.getFindingsBySource('iam-access-analyzer', { limit: 1 }));
  const n = query.data?.pagination.total;
  return <KpiValue label="Internet-Facing Exposures" value={n === undefined ? '—' : String(n)} icon="globe"
    tone={n ? 'warning' : 'good'} onClick={() => ctx.navigate('/cloud-security?tab=Exposed Resources')} />;
};

export const AttackPathsKpi: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('kpi-attack-paths', ctx, () => api.getAttackPaths());
  const n = query.data?.items.length;
  return <KpiValue label="Attack Paths" value={n === undefined ? '—' : String(n)} icon="target"
    tone={n ? 'critical' : 'good'} onClick={() => ctx.navigate('/vulnerability-management')} />;
};
