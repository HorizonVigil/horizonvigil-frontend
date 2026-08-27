import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { RoadmapPanel } from '../components/EmptyState';
import { useTabParam } from '../lib/useTabParam';
import { useSubmenuAccess } from '../lib/useCanSeeSubmenu';

const TABS = ['Overview', 'Applications', 'APIs', 'URLs & Domains', 'DAST Results', 'SAST Results', 'API Security Findings', 'Web Vulnerabilities', 'Testing History'] as const;
type Tab = typeof TABS[number];

/**
 * Application & API security -- no first-class Application/API/URL/Domain
 * entity exists anywhere in the product today (confirmed against
 * api.ts and the Resources category taxonomy), so this module is primarily
 * an honest IA/positioning placeholder in Phase 1, not a functionally rich
 * page like Cloud Security or Code & Repository Security. SAST/Web tabs
 * cross-link to the real (session-ephemeral) scanner results rather than
 * duplicating them.
 */
export function ApplicationSecurity() {
  const canSeeTab = useSubmenuAccess('app-security');
  const visibleTabs = TABS.filter(canSeeTab);
  const [tab, setTab] = useTabParam<Tab>(TABS, 'Overview');
  useEffect(() => {
    if (!canSeeTab(tab) && visibleTabs.length > 0) setTab(visibleTabs[0]);
  }, [tab, canSeeTab, visibleTabs, setTab]);

  return (
    <div className="min-w-0">
      <FilterBar title="Application & API Security" breadcrumb={<Breadcrumb />} showAccountFilter={false} showRegionFilter={false} showDateFilter={false} />

      <div className="mb-5">
        <p className="max-w-3xl text-sm text-slate-500 dark:text-slate-400">
          Applications, APIs, and URLs/domains as first-class security assets — dynamic testing, API security findings, and web vulnerability coverage in one place.
        </p>
      </div>

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
        <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 px-6 py-8">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Positioning today, not yet a functionally rich module</p>
          <p className="max-w-2xl text-xs text-slate-500 dark:text-slate-400">
            No Application, API, or URL/domain entity exists in the product yet — every tab below is honestly scoped rather than showing fabricated data. SAST and Web Vulnerabilities cross-link to real (session-ephemeral) scanner results in{' '}
            <Link to="/vulnerability-management?tab=Scanners" className="text-brand-600 dark:text-brand-400 hover:underline">Vulnerability Management's Scanners tab</Link>. The rest are on the roadmap.
          </p>
        </div>
      )}

      {tab === 'Applications' && (
        <RoadmapPanel icon="box" title="Application inventory isn't built yet" description="No first-class application entity exists today — this needs a new data model, not just a UI addition." />
      )}
      {tab === 'APIs' && (
        <RoadmapPanel icon="link" title="API inventory isn't built yet" description="No first-class API entity exists today — endpoint discovery and cataloging is on the roadmap." />
      )}
      {tab === 'URLs & Domains' && (
        <RoadmapPanel icon="globe" title="URL/domain inventory isn't built yet" description="Tracking domains and URLs as security assets in their own right is on the roadmap, not implemented." />
      )}
      {tab === 'DAST Results' && (
        <RoadmapPanel icon="globe" title="DAST isn't built yet" description="No dynamic application security testing tool is connected today — see Security Scanning Center's DAST tab for the same honest status." />
      )}
      {tab === 'SAST Results' && (
        <RoadmapPanel
          icon="terminal"
          title="SAST results run live, not persisted yet"
          description="Semgrep runs on demand from Vulnerability Management's Scanners tab — there's no list-all-scans endpoint yet to show a persisted, independently-queryable history here."
        />
      )}
      {tab === 'API Security Findings' && (
        <RoadmapPanel icon="lock" title="API security testing isn't built yet" description="Dedicated API endpoint testing (auth bypass, injection, schema conformance) is on the roadmap." />
      )}
      {tab === 'Web Vulnerabilities' && (
        <RoadmapPanel
          icon="terminal"
          title="Web vulnerability results run live, not persisted yet"
          description="Nuclei runs on demand from Vulnerability Management's Scanners tab — there's no list-all-scans endpoint yet to show a persisted, independently-queryable history here."
        />
      )}
      {tab === 'Testing History' && (
        <RoadmapPanel icon="clock" title="Persisted testing history isn't built yet" description="A cross-category testing history needs a persisted results store behind every scan type, which doesn't exist yet — see each tab above for its own status." />
      )}
    </div>
  );
}
