import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { DataTable, type Column } from '../components/DataTable';
import { Badge, severityTone } from '../components/Badge';
import { StatCard } from '../components/StatCard';
import { RoadmapPanel } from '../components/EmptyState';
import { useTabParam } from '../lib/useTabParam';
import { useSubmenuAccess } from '../lib/useCanSeeSubmenu';
import { api, type VulnerabilityFinding, type CloudResource } from '../lib/api';

const TABS = ['Overview', 'Kubernetes Security', 'Rancher', 'Docker & Container Images', 'Container Registries', 'Runtime Risks', 'Configuration Risks'] as const;
type Tab = typeof TABS[number];

/**
 * The security-posture lens over containers/Kubernetes -- distinct from the
 * operational Clusters module (pods/deployments/nodes/Helm at /clusters/*),
 * which stays exactly as-is. This page re-presents the same real Trivy
 * container-image findings Vulnerability Management's Container Images tab
 * already shows, plus real GCP Artifact Registry inventory, through a
 * security lens; everything genuinely new (Kubernetes posture, Rancher,
 * runtime risk) is an honest RoadmapPanel, not fabricated data.
 */
export function ContainerKubernetesSecurity() {
  const canSeeTab = useSubmenuAccess('container-security');
  const visibleTabs = TABS.filter(canSeeTab);
  const [tab, setTab] = useTabParam<Tab>(TABS, 'Overview');
  useEffect(() => {
    if (!canSeeTab(tab) && visibleTabs.length > 0) setTab(visibleTabs[0]);
  }, [tab, canSeeTab, visibleTabs, setTab]);

  const [images, setImages] = useState<VulnerabilityFinding[]>([]);
  const [registries, setRegistries] = useState<CloudResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Real, live K8s inventory (EKS + GKE) for the Kubernetes Security tab --
  // genuinely calls the cluster's own API server (see connector-aws/gcp's
  // eksWorkloads.ts/gkeWorkloads.ts), not just a control-plane resource
  // describe-call. Paired with an explicit "no vulnerability scanner
  // connected" note below since kube-bench/kubescape are unimplemented --
  // this is real inventory, not a security posture score. Promise.allSettled
  // (not all) since an org with only one of EKS/GKE connected shouldn't blank
  // the whole tab because the other provider's call 404s/errors.
  const [k8sInventory, setK8sInventory] = useState<{ pods: number; nodes: number; deployments: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [imageFindings, gcpRepos, eksPods, eksNodes, eksDeployments, gkePods, gkeDeployments] = await Promise.all([
        api.getFindingsBySource('container-images', { limit: 100 }),
        api.getGcpArtifactRegistryRepos({ limit: 50 }),
        api.getEksPods({ limit: 1 }).catch(() => null),
        api.getEksNodes({ limit: 1 }).catch(() => null),
        api.getEksDeployments({ limit: 1 }).catch(() => null),
        api.getGkePods({ limit: 1 }).catch(() => null),
        api.getGkeDeployments({ limit: 1 }).catch(() => null),
      ]);
      setImages(imageFindings.items);
      setRegistries(gcpRepos.items);
      setK8sInventory({
        pods: (eksPods?.pagination.total ?? 0) + (gkePods?.pagination.total ?? 0),
        nodes: eksNodes?.pagination.total ?? 0,
        deployments: (eksDeployments?.pagination.total ?? 0) + (gkeDeployments?.pagination.total ?? 0),
      });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load container security data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const criticalCount = images.filter(f => f.severity === 'critical' && f.status === 'open').length;
  const highCount = images.filter(f => f.severity === 'high' && f.status === 'open').length;

  const imageColumns: Column<VulnerabilityFinding>[] = [
    { key: 'title', header: 'Finding', render: f => f.title, sticky: true },
    { key: 'severity', header: 'Severity', render: f => <Badge tone={severityTone(f.severity)}>{f.severity}</Badge>, sortValue: f => f.severity },
    { key: 'region', header: 'Region', render: f => f.region ?? '—' },
    { key: 'status', header: 'Status', render: f => <Badge tone={severityTone(f.status)}>{f.status}</Badge> },
  ];

  const registryColumns: Column<CloudResource>[] = [
    { key: 'name', header: 'Repository', render: r => r.resource_name ?? r.resource_id, sticky: true },
    { key: 'region', header: 'Region', render: r => r.region ?? '—' },
    { key: 'state', header: 'State', render: r => r.state ?? '—' },
  ];

  return (
    <div className="min-w-0">
      <FilterBar title="Container & Kubernetes Security" breadcrumb={<Breadcrumb />} showAccountFilter={false} showRegionFilter={false} showDateFilter={false} />

      <div className="mb-5">
        <p className="max-w-3xl text-sm text-slate-500 dark:text-slate-400">
          Security posture across Kubernetes, Rancher, Docker images, and registries — distinct from the operational cluster consoles under Clusters, which handle pods, deployments, and workloads.
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
            <StatCard label="Scanned Images" value={String(images.length)} icon="package" />
            <StatCard label="Critical Findings" value={String(criticalCount)} icon="target" iconTone="critical" />
            <StatCard label="High Findings" value={String(highCount)} icon="target" iconTone="serious" />
            <StatCard label="GCP Registries" value={String(registries.length)} icon="layers" />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Real data today: Docker & Container Images (Trivy) and GCP Container Registries. Kubernetes posture, Rancher, runtime risk, and configuration risk are on the roadmap — see their own tabs.
          </p>
        </div>
      )}

      {tab === 'Kubernetes Security' && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatCard label="Pods" value={String(k8sInventory?.pods ?? 0)} icon="box" caption="EKS + GKE, live" />
            <StatCard label="Nodes" value={String(k8sInventory?.nodes ?? 0)} icon="server" caption="EKS, live" />
            <StatCard label="Deployments" value={String(k8sInventory?.deployments ?? 0)} icon="layers" caption="EKS + GKE, live" />
          </div>
          <RoadmapPanel
            icon="shield-alert"
            title="No vulnerability/CVE overlay on this inventory yet"
            description="The counts above are real, live cluster state (pulled directly from each connected cluster's own Kubernetes API, not just cloud-provider resource inventory). What's missing is a security scan on top of it — kube-bench (CIS benchmark) and Kubescape (posture/compliance) are both planned scanners in this platform but neither has been implemented yet, so there's no CVE, RBAC-risk, or pod-security-standard finding to show against these workloads today."
          />
        </div>
      )}

      {tab === 'Rancher' && (
        <RoadmapPanel
          icon="hammer"
          title="Rancher support isn't built yet"
          description="No Rancher connector or scanner exists today — this page will show real cluster/fleet data once that's built, not before."
        />
      )}

      {tab === 'Docker & Container Images' && (
        <>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            Trivy scan results for ECR (AWS) and Artifact Registry (GCP) images — the same real, persisted findings behind <Link to="/vulnerability-management?tab=Container%20Images" className="text-brand-600 dark:text-brand-400 hover:underline">Vulnerability Management's Container Images tab</Link>.
          </p>
          <DataTable columns={imageColumns} rows={images} rowKey={f => f.id} emptyMessage="No container image findings yet." />
        </>
      )}

      {tab === 'Container Registries' && (
        <>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            GCP Artifact Registry repositories shown below are real, live inventory. AWS ECR repository inventory isn't wired into this tab yet — it needs a confirmed resource-catalog filter, tracked as follow-up work.
          </p>
          <DataTable columns={registryColumns} rows={registries} rowKey={r => r.id} emptyMessage="No registries found." />
        </>
      )}

      {tab === 'Runtime Risks' && (
        <RoadmapPanel
          icon="activity"
          title="Runtime risk detection isn't built yet"
          description="Detecting risk from actually-running containers (privileged mode, host mounts, unexpected process activity) needs a runtime agent, which doesn't exist in this API-based scanning model today."
        />
      )}

      {tab === 'Configuration Risks' && (
        <RoadmapPanel
          icon="settings-2"
          title="See IaC scanning for configuration risk today"
          description="Checkov already evaluates Kubernetes manifests and Dockerfiles for misconfiguration as part of IaC scanning — results are session-ephemeral (run from the Scanners tab) until a persisted results store exists."
        />
      )}
    </div>
  );
}
