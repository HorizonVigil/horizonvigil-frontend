import { useCallback, useEffect, useState } from 'react';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { DataTable, type Column } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { StatCard } from '../components/StatCard';
import { RoadmapPanel } from '../components/EmptyState';
import { ScanHistoryTable } from '../components/ScanHistoryTable';
import { useTabParam } from '../lib/useTabParam';
import { useSubmenuAccess } from '../lib/useCanSeeSubmenu';
import { api } from '../lib/api';

const TABS = ['Overview', 'Repositories', 'Code Vulnerabilities', 'Dependency Vulnerabilities', 'Secrets Detected', 'Findings by Branch/Project'] as const;
type Tab = typeof TABS[number];

interface RepoRow { key: string; installationLogin: string; fullName: string; defaultBranch: string; private: boolean }
interface InstallationCard { id: string; login: string; repoCount: number }

// The 5 scanners this page's own tabs are backed by (Semgrep/Dependency-
// Check/Grype/Gitleaks/TruffleHog) -- same set ScanHistoryTable instances
// below use, just aggregated here for the Overview tab's scan-count/last-
// scan stats instead of the full row list.
const CODE_SCANNERS = ['semgrep', 'dependency-check', 'grype', 'gitleaks', 'trufflehog'] as const;

/**
 * Code & repository security -- Repositories, Code Vulnerabilities,
 * Dependency Vulnerabilities, and Secrets Detected are all real, persisted
 * data today: Repositories via the same GitHub App installation Settings >
 * Git Integration's Auto-PR feature already uses, and the finding-shaped
 * tabs via each backing scanner's own GET /v1/scans (Semgrep, Dependency-
 * Check + Grype, Gitleaks + TruffleHog) -- no longer session-ephemeral.
 */
export function CodeSecurity() {
  const canSeeTab = useSubmenuAccess('code-security');
  const visibleTabs = TABS.filter(canSeeTab);
  const [tab, setTab] = useTabParam<Tab>(TABS, 'Overview');
  useEffect(() => {
    if (!canSeeTab(tab) && visibleTabs.length > 0) setTab(visibleTabs[0]);
  }, [tab, canSeeTab, visibleTabs, setTab]);

  const [repos, setRepos] = useState<RepoRow[]>([]);
  const [installationCards, setInstallationCards] = useState<InstallationCard[]>([]);
  // Per-scanner {count, lastScan} for the Overview tab -- Promise.allSettled
  // (not all) since an org that's never run one of the 5 scanners shouldn't
  // blank the whole tab over that scanner's empty/erroring list call.
  const [scanStats, setScanStats] = useState<Record<string, { count: number; lastScan: string | null }>>({});
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
          return { card: { id: inst.id, login: inst.account_login, repoCount: items.length }, rows: items.map((r): RepoRow => ({ key: `${inst.id}:${r.fullName}`, installationLogin: inst.account_login, fullName: r.fullName, defaultBranch: r.defaultBranch, private: r.private })) };
        }),
      );
      setRepos(perInstallation.flatMap(p => p.rows));
      setInstallationCards(perInstallation.map(p => p.card));

      const scanResults = await Promise.allSettled(CODE_SCANNERS.map(s => api.listScans(s, { limit: 1 })));
      setScanStats(Object.fromEntries(CODE_SCANNERS.map((s, i) => {
        const res = scanResults[i];
        return [s, res.status === 'fulfilled' ? { count: res.value.total, lastScan: res.value.items[0]?.finished_at ?? null } : { count: 0, lastScan: null }];
      })));
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
            <StatCard label="SAST/SCA/Secrets Scans" value={String(Object.values(scanStats).reduce((sum, s) => sum + s.count, 0))} icon="target" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {installationCards.length === 0 ? (
              <p className="text-xs text-slate-400 col-span-full">No Git installations connected yet — connect one under Settings &gt; Git Integration.</p>
            ) : installationCards.map(inst => (
              <div key={inst.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{inst.login}</span>
                  <Badge tone="good">GitHub</Badge>
                </div>
                <p className="text-xs text-slate-400">{inst.repoCount} repositor{inst.repoCount === 1 ? 'y' : 'ies'}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Scan History by Tool</h3>
            <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
              {CODE_SCANNERS.map(s => {
                const stat = scanStats[s];
                return (
                  <li key={s} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="capitalize text-slate-700 dark:text-slate-200">{s.replace('-', ' ')}</span>
                    <span className="text-xs text-slate-400 tabular-nums">
                      {stat && stat.count > 0 ? `${stat.count} scan${stat.count === 1 ? '' : 's'} · last ${new Date(stat.lastScan!).toLocaleDateString()}` : 'No scans recorded yet'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Real, persisted data across every tab — Repositories (GitHub App installations) and Code/Dependency/Secrets findings (each backed by a real scanner's own scan history).
          </p>
        </div>
      )}

      {tab === 'Repositories' && (
        <DataTable columns={repoColumns} rows={repos} rowKey={r => r.key} emptyMessage="No repositories connected yet — connect a GitHub App installation under Settings > Git Integration." />
      )}

      {tab === 'Code Vulnerabilities' && <ScanHistoryTable scannerKey="semgrep" scannerLabel="Semgrep" />}
      {tab === 'Dependency Vulnerabilities' && (
        <div className="flex flex-col gap-6">
          <ScanHistoryTable scannerKey="dependency-check" scannerLabel="Dependency-Check" />
          <ScanHistoryTable scannerKey="grype" scannerLabel="Grype" />
        </div>
      )}
      {tab === 'Secrets Detected' && (
        <div className="flex flex-col gap-6">
          <ScanHistoryTable scannerKey="gitleaks" scannerLabel="Gitleaks" />
          <ScanHistoryTable scannerKey="trufflehog" scannerLabel="TruffleHog" />
        </div>
      )}

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
