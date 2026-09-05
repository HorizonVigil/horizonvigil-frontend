import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { DataTable, type Column } from '../components/DataTable';
import { Badge, severityTone } from '../components/Badge';
import { StatCard } from '../components/StatCard';
import { RoadmapPanel } from '../components/EmptyState';
import { SecurityPostureSummary, type SecurityPostureDashboard } from '../components/SecurityPostureSummary';
import { useTabParam } from '../lib/useTabParam';
import { useSubmenuAccess } from '../lib/useCanSeeSubmenu';
import { useFilters } from '../lib/filterContext';
import { api, type VulnerabilityFinding, type CloudIdentity, type IdentitySummary, type ComplianceBenchmark } from '../lib/api';

const TABS = ['Overview', 'Posture', 'Misconfigurations', 'Identity & Access Risk', 'Exposed Resources', 'Cloud Vulnerabilities', 'Compliance', 'Multi-Cloud Coverage'] as const;
type Tab = typeof TABS[number];
const PROVIDERS = ['aws', 'gcp', 'azure'] as const;
const PROVIDER_LABEL: Record<typeof PROVIDERS[number], string> = { aws: 'AWS', gcp: 'GCP', azure: 'Azure' };

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : DATE_FORMATTER.format(d);
}

/**
 * Multi-cloud security posture pillar -- distinct from Cloud Accounts
 * (connection management/ops, at /cloud-accounts) and from Vulnerability
 * Management's raw AWS-native tool tabs, which several tabs here
 * re-present through a posture/risk lens rather than duplicate. See
 * navConfig.ts's "Cloud Security" module comment for the real-vs-RoadmapPanel
 * split this page follows.
 */
export function CloudSecurity() {
  const canSeeTab = useSubmenuAccess('cloud-security');
  const visibleTabs = TABS.filter(canSeeTab);
  const [tab, setTab] = useTabParam<Tab>(TABS, 'Overview');
  const { connections } = useFilters();
  useEffect(() => {
    if (!canSeeTab(tab) && visibleTabs.length > 0) setTab(visibleTabs[0]);
  }, [tab, canSeeTab, visibleTabs, setTab]);

  const [dashboard, setDashboard] = useState<SecurityPostureDashboard | null>(null);
  const [misconfigs, setMisconfigs] = useState<VulnerabilityFinding[]>([]);
  const [exposed, setExposed] = useState<VulnerabilityFinding[]>([]);
  const [identitySummary, setIdentitySummary] = useState<IdentitySummary | null>(null);
  const [riskyIdentities, setRiskyIdentities] = useState<CloudIdentity[]>([]);
  const [benchmarks, setBenchmarks] = useState<ComplianceBenchmark[]>([]);
  // Real, persisted findings -- connector-gcp's Security Command Center scan
  // and connector-azure's Defender for Cloud scan both write into the same
  // vulnerability_findings table every other source does; this tab was the
  // one place nothing surfaced them, not because the data was ever fake.
  const [gcpFindings, setGcpFindings] = useState<VulnerabilityFinding[]>([]);
  const [azureFindings, setAzureFindings] = useState<VulnerabilityFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [dash, misconfig, exposedRes, idSummary, admin, broad, compliance, gcpScc, defender] = await Promise.all([
        api.getVulnerabilityDashboard(),
        api.getFindingsBySource('aws-config', { limit: 50 }),
        api.getFindingsBySource('iam-access-analyzer', { limit: 50 }),
        api.getIdentitySummary(),
        api.getIdentities({ privilegeLevel: 'admin_equivalent', limit: 10 }),
        api.getIdentities({ privilegeLevel: 'broad', limit: 10 }),
        api.getComplianceBenchmarks({ limit: 20 }),
        api.getFindingsBySource('gcp-scc', { limit: 50 }),
        api.getFindingsBySource('defender', { limit: 50 }),
      ]);
      setDashboard(dash);
      setMisconfigs(misconfig.items);
      setExposed(exposedRes.items);
      setIdentitySummary(idSummary);
      setRiskyIdentities([...admin.items, ...broad.items]);
      setBenchmarks(compliance.items);
      setGcpFindings(gcpScc.items);
      setAzureFindings(defender.items);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load cloud security data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const findingColumns: Column<VulnerabilityFinding>[] = [
    { key: 'title', header: 'Finding', render: f => f.title, sticky: true },
    { key: 'severity', header: 'Severity', render: f => <Badge tone={severityTone(f.severity)}>{f.severity}</Badge>, sortValue: f => f.severity },
    { key: 'region', header: 'Region', render: f => f.region ?? '—' },
    { key: 'status', header: 'Status', render: f => <Badge tone={severityTone(f.status)}>{f.status}</Badge> },
    { key: 'discovered_at', header: 'Discovered', render: f => formatDate(f.discovered_at), sortValue: f => f.discovered_at },
  ];

  const identityColumns: Column<CloudIdentity>[] = [
    { key: 'name', header: 'Identity', render: i => i.display_name || i.native_label || i.native_id, sticky: true },
    { key: 'type', header: 'Type', render: i => i.identity_type },
    { key: 'provider', header: 'Provider', render: i => i.provider.toUpperCase() },
    { key: 'privilege', header: 'Privilege', render: i => i.privilege_level ? <Badge tone={i.privilege_level === 'admin_equivalent' ? 'critical' : 'warning'}>{i.privilege_level.replace('_', ' ')}</Badge> : '—' },
    { key: 'mfa', header: 'MFA', render: i => i.mfa_enabled === null ? '—' : <Badge tone={i.mfa_enabled ? 'good' : 'critical'}>{i.mfa_enabled ? 'Enabled' : 'Disabled'}</Badge> },
  ];

  return (
    <div className="min-w-0">
      <FilterBar title="Cloud Security" breadcrumb={<Breadcrumb />} showAccountFilter={false} showRegionFilter={false} showDateFilter={false} />

      <div className="mb-5">
        <p className="max-w-3xl text-sm text-slate-500 dark:text-slate-400">
          Multi-cloud posture, misconfigurations, identity risk, and exposure across every connected AWS, GCP, and Azure account — one view instead of switching between provider consoles.
        </p>
      </div>

      {loadError && (
        <div className="mb-4 rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-300 flex items-center justify-between gap-3" role="alert">
          <span>{loadError}</span>
          <button type="button" onClick={() => void load()} className="text-xs underline shrink-0">Retry</button>
        </div>
      )}
      {loading && !loadError && <p className="text-xs text-slate-400 mb-4">Loading…</p>}

      <div className="flex gap-1 text-sm flex-wrap mb-4">
        {visibleTabs.map(t => (
          <button
            type="button"
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`shrink-0 rounded-md px-3 py-1.5 text-sm transition-colors ${
              tab === t ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Connected Accounts" value={String(connections.length)} icon="cloud" />
            <StatCard label="Misconfigurations" value={String(misconfigs.length)} icon="settings-2" iconTone={misconfigs.length > 0 ? 'warning' : 'good'} />
            <StatCard label="Exposed Resources" value={String(exposed.length)} icon="globe" iconTone={exposed.length > 0 ? 'critical' : 'good'} />
            <StatCard label="Risk Score" value={dashboard ? `${dashboard.riskScore}/100` : '—'} icon="gauge" iconTone={dashboard && dashboard.riskScore >= 50 ? 'critical' : dashboard && dashboard.riskScore >= 20 ? 'warning' : 'good'} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {PROVIDERS.map(provider => {
              const providerConns = connections.filter(c => c.provider === provider);
              const connected = providerConns.filter(c => c.status === 'connected').length;
              return (
                <div key={provider} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{PROVIDER_LABEL[provider]}</span>
                    <Badge tone={providerConns.length === 0 ? 'neutral' : connected === providerConns.length ? 'good' : 'warning'}>
                      {providerConns.length === 0 ? 'Not connected' : `${connected} / ${providerConns.length} connected`}
                    </Badge>
                  </div>
                  <button type="button" onClick={() => setTab('Multi-Cloud Coverage')} className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">
                    {providerConns.length === 0 ? 'Connect an account →' : 'View coverage →'}
                  </button>
                </div>
              );
            })}
            <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">OCI</span>
                <Badge tone="neutral">No connector</Badge>
              </div>
              <p className="text-xs text-slate-400">Not built yet — see Multi-Cloud Coverage.</p>
            </div>
          </div>
        </div>
      )}

      {tab === 'Posture' && dashboard && <SecurityPostureSummary dashboard={dashboard} variant="full" />}

      {tab === 'Misconfigurations' && (
        <>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">AWS Config rule evaluations, re-presented as a posture/risk view of the same real findings behind Vulnerability Management's AWS Config tab.</p>
          <DataTable columns={findingColumns} rows={misconfigs} rowKey={f => f.id} emptyMessage="No misconfigurations found." />
        </>
      )}

      {tab === 'Identity & Access Risk' && (
        <>
          {identitySummary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <StatCard label="Total Identities" value={String(identitySummary.total)} icon="key" />
              <StatCard label="Admin-Equivalent" value={String(identitySummary.adminEquivalent)} icon="alert-triangle" iconTone="critical" />
              <StatCard label="Broad Privilege" value={String(identitySummary.broad)} icon="alert-triangle" iconTone="warning" />
              <StatCard label="Human Without MFA" value={String(identitySummary.humanWithoutMfa)} icon="shield-check-2" iconTone={identitySummary.humanWithoutMfa > 0 ? 'critical' : 'good'} />
            </div>
          )}
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            The most over-privileged identities across every connected account. <Link to="/cloud-accounts?tab=Identities" className="text-brand-600 dark:text-brand-400 hover:underline">View the full identity inventory →</Link>
          </p>
          <DataTable columns={identityColumns} rows={riskyIdentities} rowKey={i => i.id} emptyMessage="No over-privileged identities found." />
        </>
      )}

      {tab === 'Exposed Resources' && (
        <>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            Resources IAM Access Analyzer flagged as shared outside your account or organization — a real, if partial, slice of "exposure." Full attack-path correlation (exposure + vulnerability + over-privileged identity on the same resource) lives in <Link to="/vulnerability-management?tab=Attack%20Paths" className="text-brand-600 dark:text-brand-400 hover:underline">Vulnerability Management's Attack Paths tab</Link>.
          </p>
          <DataTable columns={findingColumns} rows={exposed} rowKey={f => f.id} emptyMessage="No externally-shared resources found." />
        </>
      )}

      {tab === 'Cloud Vulnerabilities' && (
        <RoadmapPanel
          icon="target"
          title="See the full unified vulnerability list"
          description="Cloud vulnerabilities across every source live in Vulnerability Management's Security Findings tab — this page doesn't duplicate that table, it links to it."
        />
      )}

      {tab === 'Compliance' && (
        <>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            Benchmark pass rates across connected accounts. <Link to="/vulnerability-management?tab=Compliance" className="text-brand-600 dark:text-brand-400 hover:underline">View the full framework breakdown →</Link>
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {benchmarks.length === 0 && <p className="text-xs text-slate-400 col-span-full">No benchmarks evaluated yet.</p>}
            {benchmarks.map(b => (
              <div key={b.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{b.framework.replace(/_/g, ' ').toUpperCase()}</div>
                <div className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-white mt-1">
                  {b.passRate === null ? '—' : `${Math.round(b.passRate * 100)}%`}
                </div>
                <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{b.passed_checks} / {b.total_checks} checks passed</div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'Multi-Cloud Coverage' && (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            AWS posture is covered by the Misconfigurations/Exposed Resources tabs above (AWS Config + IAM Access Analyzer). GCP Security Command Center and Azure Defender for Cloud are real, connected sources too — OCI has no native posture connector built yet.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">GCP — Security Command Center</span>
                <Badge tone={gcpFindings.length > 0 ? 'warning' : 'good'}>{gcpFindings.length} finding{gcpFindings.length === 1 ? '' : 's'}</Badge>
              </div>
              {gcpFindings.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-slate-400">No Security Command Center findings — either clean, or no GCP project with SCC enabled is connected yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {gcpFindings.slice(0, 6).map(f => (
                    <li key={f.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                      <span className="truncate text-slate-700 dark:text-slate-200">{f.title}</span>
                      <Badge tone={severityTone(f.severity)}>{f.severity}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Azure — Defender for Cloud</span>
                <Badge tone={azureFindings.length > 0 ? 'warning' : 'good'}>{azureFindings.length} finding{azureFindings.length === 1 ? '' : 's'}</Badge>
              </div>
              {azureFindings.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-slate-400">No Defender for Cloud findings — either clean, or no Azure subscription with Defender enabled is connected yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {azureFindings.slice(0, 6).map(f => (
                    <li key={f.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                      <span className="truncate text-slate-700 dark:text-slate-200">{f.title}</span>
                      <Badge tone={severityTone(f.severity)}>{f.severity}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <RoadmapPanel
            icon="globe"
            title="OCI posture scanning isn't built yet"
            description="No OCI connector or Cloud Guard integration exists today — this section will show real OCI findings once that's built, not before."
          />
        </div>
      )}
    </div>
  );
}
