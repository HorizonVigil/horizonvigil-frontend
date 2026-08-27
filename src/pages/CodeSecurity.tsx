import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { DataTable, type Column } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { StatCard } from '../components/StatCard';
import { RoadmapPanel } from '../components/EmptyState';
import { useTabParam } from '../lib/useTabParam';
import { useSubmenuAccess } from '../lib/useCanSeeSubmenu';
import { api } from '../lib/api';

const TABS = ['Overview', 'Repositories', 'Code Vulnerabilities', 'Dependency Vulnerabilities', 'Secrets Detected', 'Findings by Branch/Project'] as const;
type Tab = typeof TABS[number];

interface RepoRow { key: string; installationLogin: string; fullName: string; defaultBranch: string; private: boolean }

function ScannerCta({ scanner, label }: { scanner: string; label: string }) {
  return (
    <RoadmapPanel
      icon="terminal"
      title={`${label} results run live, not persisted yet`}
      description={`${scanner} runs on demand from the Scanners tab this session — there's no list-all-scans endpoint yet to show a persisted, independently-queryable history here. Run it from Vulnerability Management > Scanners, or check back once a persisted results store ships.`}
    />
  );
}

/**
 * Code & repository security -- Repositories is the one tab with genuinely
 * real, persisted data today (via the same GitHub App installation the
 * Settings > Git Integration Auto-PR feature already uses). The finding-shaped
 * tabs (Code/Dependency/Secrets) point at the real scanners (Semgrep,
 * Dependency-Check + Grype, Gitleaks + TruffleHog) but those results are
 * session-ephemeral today -- no persisted, independently-queryable store
 * exists, so this page is honest about that instead of faking a table.
 */
export function CodeSecurity() {
  const canSeeTab = useSubmenuAccess('code-security');
  const visibleTabs = TABS.filter(canSeeTab);
  const [tab, setTab] = useTabParam<Tab>(TABS, 'Overview');
  useEffect(() => {
    if (!canSeeTab(tab) && visibleTabs.length > 0) setTab(visibleTabs[0]);
  }, [tab, canSeeTab, visibleTabs, setTab]);

  const [repos, setRepos] = useState<RepoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { items: installations } = await api.getGitInstallations();
      const perInstallation = await Promise.all(
        installations.map(async inst => {
          const { items } = await api.getInstallationRepos(inst.id);
          return items.map((r): RepoRow => ({ key: `${inst.id}:${r.fullName}`, installationLogin: inst.account_login, fullName: r.fullName, defaultBranch: r.defaultBranch, private: r.private }));
        }),
      );
      setRepos(perInstallation.flat());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load repositories.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const repoColumns: Column<RepoRow>[] = [
    { key: 'fullName', header: 'Repository', render: r => r.fullName, sticky: true },
    { key: 'installation', header: 'Installation', render: r => r.installationLogin },
    { key: 'branch', header: 'Default Branch', render: r => r.defaultBranch },
    { key: 'visibility', header: 'Visibility', render: r => <Badge tone={r.private ? 'neutral' : 'warning'}>{r.private ? 'Private' : 'Public'}</Badge> },
  ];

  return (
    <div className="min-w-0">
      <FilterBar title="Code & Repository Security" breadcrumb={<Breadcrumb />} showAccountFilter={false} showRegionFilter={false} showDateFilter={false} />

      <div className="mb-5">
        <p className="max-w-3xl text-sm text-slate-500 dark:text-slate-400">
          Repository inventory, code vulnerabilities, dependency risk, and exposed secrets across every connected GitHub, GitLab, and Bitbucket source — GitHub App installations are wired today; GitLab/Bitbucket aren't connected yet.
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
            <StatCard label="Connected Repositories" value={String(repos.length)} icon="git-branch" />
            <StatCard label="Private Repos" value={String(repos.filter(r => r.private).length)} icon="key" />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Real data today: Repositories (GitHub App installations). Code/Dependency/Secrets findings run live from{' '}
            <Link to="/vulnerability-management?tab=Scanners" className="text-brand-600 dark:text-brand-400 hover:underline">Vulnerability Management's Scanners tab</Link> but aren't persisted yet — see each tab for detail.
          </p>
        </div>
      )}

      {tab === 'Repositories' && (
        <DataTable columns={repoColumns} rows={repos} rowKey={r => r.key} emptyMessage="No repositories connected yet — connect a GitHub App installation under Settings > Git Integration." />
      )}

      {tab === 'Code Vulnerabilities' && <ScannerCta scanner="Semgrep (SAST)" label="Code vulnerability" />}
      {tab === 'Dependency Vulnerabilities' && <ScannerCta scanner="Dependency-Check + Grype (SCA)" label="Dependency vulnerability" />}
      {tab === 'Secrets Detected' && <ScannerCta scanner="Gitleaks + TruffleHog" label="Secrets detection" />}

      {tab === 'Findings by Branch/Project' && (
        <RoadmapPanel
          icon="git-branch"
          title="Per-repository finding attribution isn't possible yet"
          description="Scanner findings don't carry a repo/branch/project field today — this needs a backend data-model change, not just a UI update, before results can be grouped this way."
        />
      )}
    </div>
  );
}
