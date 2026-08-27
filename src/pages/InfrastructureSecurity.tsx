import { useEffect } from 'react';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { RoadmapPanel } from '../components/EmptyState';
import { useTabParam } from '../lib/useTabParam';
import { useSubmenuAccess } from '../lib/useCanSeeSubmenu';

const TABS = ['Overview', 'Servers', 'Linux', 'Ubuntu', 'Windows', 'On-Premises Infrastructure', 'Network & Security Configuration'] as const;
type Tab = typeof TABS[number];

/**
 * Servers/OS/on-prem security -- zero backend surface exists anywhere in
 * the product for this today (confirmed against api.ts's full section
 * list). This module exists in Phase 1 to state real product scope
 * honestly, the same precedent AksConsole already set for Azure AKS before
 * that connector existed -- every tab is a RoadmapPanel, not fabricated
 * server data.
 */
export function InfrastructureSecurity() {
  const canSeeTab = useSubmenuAccess('infra-security');
  const visibleTabs = TABS.filter(canSeeTab);
  const [tab, setTab] = useTabParam<Tab>(TABS, 'Overview');
  useEffect(() => {
    if (!canSeeTab(tab) && visibleTabs.length > 0) setTab(visibleTabs[0]);
  }, [tab, canSeeTab, visibleTabs, setTab]);

  return (
    <div className="min-w-0">
      <FilterBar title="Infrastructure Security" breadcrumb={<Breadcrumb />} showAccountFilter={false} showRegionFilter={false} showDateFilter={false} />

      <div className="mb-5">
        <p className="max-w-3xl text-sm text-slate-500 dark:text-slate-400">
          Servers, operating systems, and on-premises infrastructure as security surface — Linux, Ubuntu, Windows, and network/security configuration coverage alongside cloud-native scanning.
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
        <RoadmapPanel
          icon="server"
          title="Infrastructure security isn't built yet"
          description="No server/OS/on-prem scanning surface exists anywhere in HorizonVigil today — this module states real, planned product scope rather than showing fabricated data. Every tab below will show real server, OS, and network-configuration data once a scanning agent or credentialed-access model is built, not before."
        />
      )}
      {tab === 'Servers' && <RoadmapPanel icon="server" title="Server inventory isn't built yet" description="No server entity or discovery mechanism exists today." />}
      {tab === 'Linux' && <RoadmapPanel icon="terminal" title="Linux scanning isn't built yet" description="OS-level vulnerability and configuration scanning for Linux hosts is on the roadmap." />}
      {tab === 'Ubuntu' && <RoadmapPanel icon="terminal" title="Ubuntu scanning isn't built yet" description="OS-level vulnerability and configuration scanning for Ubuntu hosts is on the roadmap." />}
      {tab === 'Windows' && <RoadmapPanel icon="terminal" title="Windows scanning isn't built yet" description="OS-level vulnerability and configuration scanning for Windows hosts is on the roadmap." />}
      {tab === 'On-Premises Infrastructure' && <RoadmapPanel icon="hard-drive" title="On-premises infrastructure isn't built yet" description="Discovery and scanning for non-cloud, on-premises infrastructure is on the roadmap — this platform is cloud-connector-based today." />}
      {tab === 'Network & Security Configuration' && <RoadmapPanel icon="network" title="Network/security configuration scanning isn't built yet" description="Host-level firewall, network, and security configuration assessment is on the roadmap." />}
    </div>
  );
}
