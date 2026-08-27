import { useCallback, useEffect, useState } from 'react';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { RoadmapPanel } from '../components/EmptyState';
import { ScanCategoryCard } from '../components/ScanCategoryCard';
import { SecurityPostureSummary, type SecurityPostureDashboard } from '../components/SecurityPostureSummary';
import { useTabParam } from '../lib/useTabParam';
import { useSubmenuAccess } from '../lib/useCanSeeSubmenu';
import { api } from '../lib/api';
import type { IconName } from '../components/icons';

const TABS = ['Overview', 'SAST', 'DAST', 'SCA', 'Container Scanning', 'IaC Scanning', 'Secrets Detection', 'API Security Testing', 'Web Security Testing', 'Pentest', 'Cloud Posture'] as const;
type Tab = typeof TABS[number];

const SCANNERS_URL = '/vulnerability-management?tab=Scanners';

interface CategorySpec { icon: IconName; title: string; description: string; scanners?: string[]; href: string }

const CATEGORIES: CategorySpec[] = [
  { icon: 'code', title: 'SAST', description: 'Static application security testing on source code.', scanners: ['semgrep'], href: SCANNERS_URL },
  { icon: 'globe', title: 'DAST', description: 'Dynamic testing against a running application.', href: '/security-scanning?tab=DAST' },
  { icon: 'package', title: 'SCA', description: 'Software composition analysis of open-source dependencies.', scanners: ['dependency-check', 'grype'], href: SCANNERS_URL },
  { icon: 'layers', title: 'Container Scanning', description: 'Container image vulnerability scanning.', scanners: ['trivy', 'syft'], href: '/container-security?tab=Docker%20%26%20Container%20Images' },
  { icon: 'file', title: 'IaC Scanning', description: 'Infrastructure-as-code misconfiguration scanning.', scanners: ['checkov'], href: SCANNERS_URL },
  { icon: 'key', title: 'Secrets Detection', description: 'Hardcoded credentials and API keys in source and history.', scanners: ['gitleaks', 'trufflehog'], href: SCANNERS_URL },
  { icon: 'lock', title: 'API Security Testing', description: 'Dedicated API endpoint security testing.', href: '/security-scanning?tab=API%20Security%20Testing' },
  { icon: 'target', title: 'Web Security Testing', description: 'Templated web vulnerability scanning.', scanners: ['nuclei'], href: SCANNERS_URL },
  { icon: 'life-buoy', title: 'Pentest', description: 'Structured penetration-testing engagement workflows.', href: '/security-scanning?tab=Pentest' },
  { icon: 'shield-check-2', title: 'Cloud Posture', description: 'Multi-cloud configuration and posture scanning.', scanners: ['prowler'], href: '/cloud-security' },
];

/**
 * The command center the "don't build a pile of separate scanner pages"
 * requirement calls for -- one place to see every scan category's status.
 * Real scanner mapping and reachability come from api.getScannerStatuses();
 * category tabs deep-link into the real cross-linked view (Container
 * Scanning -> Container & Kubernetes Security, Cloud Posture -> Cloud
 * Security) rather than duplicating those tables, or into the Scanners tab
 * for categories whose results are still session-ephemeral (see that tab's
 * own scanner-status grid and the SAST/SCA/IaC/Secrets/Web tabs below).
 */
export function SecurityScanningCenter() {
  const canSeeTab = useSubmenuAccess('scanning-center');
  const visibleTabs = TABS.filter(canSeeTab);
  const [tab, setTab] = useTabParam<Tab>(TABS, 'Overview');
  useEffect(() => {
    if (!canSeeTab(tab) && visibleTabs.length > 0) setTab(visibleTabs[0]);
  }, [tab, canSeeTab, visibleTabs, setTab]);

  const [statuses, setStatuses] = useState<Record<string, boolean>>({});
  const [dashboard, setDashboard] = useState<SecurityPostureDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [scannerRes, dash] = await Promise.all([api.getScannerStatuses(), api.getVulnerabilityDashboard()]);
      setStatuses(Object.fromEntries(scannerRes.scanners.map(s => [s.scanner, s.reachable])));
      setDashboard(dash);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load scanning center data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="min-w-0">
      <FilterBar title="Security Scanning Center" breadcrumb={<Breadcrumb />} showAccountFilter={false} showRegionFilter={false} showDateFilter={false} />

      <div className="mb-5">
        <p className="max-w-3xl text-sm text-slate-500 dark:text-slate-400">
          Every scan category HorizonVigil supports — SAST, DAST, SCA, container, IaC, secrets, API, web, pentest, and cloud posture — in one place instead of a separate page per tool.
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {CATEGORIES.map(c => (
            <ScanCategoryCard key={c.title} icon={c.icon} title={c.title} description={c.description} scanners={c.scanners} statuses={statuses} href={c.href} ctaLabel={c.scanners ? 'View results' : 'Learn more'} />
          ))}
        </div>
      )}

      {tab === 'SAST' && <ScannerRoadmap category="SAST" scanner="Semgrep" />}
      {tab === 'DAST' && (
        <RoadmapPanel icon="globe" title="DAST isn't built yet" description="Dynamic application security testing against a running application is on the roadmap — no DAST tool is connected today." />
      )}
      {tab === 'SCA' && <ScannerRoadmap category="SCA" scanner="Dependency-Check and Grype" />}
      {tab === 'Container Scanning' && (
        <RoadmapPanel icon="layers" title="See Container & Kubernetes Security" description="Real Trivy container-image findings live under Container & Kubernetes Security's Docker & Container Images tab — this page links there instead of duplicating the table." />
      )}
      {tab === 'IaC Scanning' && <ScannerRoadmap category="IaC scanning" scanner="Checkov" />}
      {tab === 'Secrets Detection' && <ScannerRoadmap category="Secrets detection" scanner="Gitleaks and TruffleHog" />}
      {tab === 'API Security Testing' && (
        <RoadmapPanel icon="lock" title="API security testing isn't built yet" description="Dedicated API endpoint testing (auth bypass, injection, schema conformance) is on the roadmap — no tool is connected today." />
      )}
      {tab === 'Web Security Testing' && <ScannerRoadmap category="Web security testing" scanner="Nuclei" />}
      {tab === 'Pentest' && (
        <RoadmapPanel icon="life-buoy" title="Pentest workflows aren't built yet" description="Structured penetration-testing engagement tracking (scope, findings, retest, sign-off) is on the roadmap — this is a workflow, not a scanner, and needs its own data model." />
      )}
      {tab === 'Cloud Posture' && dashboard && <SecurityPostureSummary dashboard={dashboard} variant="compact" detailHref="/cloud-security" />}
    </div>
  );
}

function ScannerRoadmap({ category, scanner }: { category: string; scanner: string }) {
  return (
    <RoadmapPanel
      icon="terminal"
      title={`${category} results run live, not persisted yet`}
      description={`${scanner} runs on demand from Vulnerability Management's Scanners tab — there's no list-all-scans endpoint yet to show a persisted, independently-queryable history here.`}
    />
  );
}
