import { useEffect, useState, useCallback } from 'react';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { StatCard } from '../components/StatCard';
import { DataTable, type Column } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { Drawer } from '../components/Drawer';
import { useFilters } from '../lib/filterContext';
import { useTabParam } from '../lib/useTabParam';
import { api, type CloudResource } from '../lib/api';

// One tab per real resource type the sidebar promises. Deployments/Pods merge
// AWS EKS and GCP GKE data into a single provider-aware table rather than
// splitting per-provider — both now have real Kubernetes-API-backed scanners
// (see eksWorkloads.ts / gkeWorkloads.ts), so there's real data to merge.
// Namespaces is AWS-only (EKS scanner only, GKE's own isn't built yet — see
// gkeWorkloads.ts), same shape as Nodes, so it lives here rather than in
// SHARED_TABS to avoid showing an always-empty table under a GCP-only view.
const AWS_ONLY_TABS = ['ECS Clusters', 'ECS Services', 'ECS Tasks', 'EKS Clusters', 'Nodes', 'Namespaces'] as const;
const GCP_ONLY_TABS = ['Cloud Run', 'Artifact Registry', 'GKE Clusters'] as const;
// Deployments/Pods already merge both providers' real data; Helm Releases
// honestly reports "not built" for both — no provider-specific version of
// either exists, so they stay visible regardless of which provider's
// account is selected.
const SHARED_TABS = ['Deployments', 'Pods', 'Helm Releases'] as const;
const TABS = [...AWS_ONLY_TABS, ...GCP_ONLY_TABS, ...SHARED_TABS] as const;
type Tab = typeof TABS[number];

function costCell(c: CloudResource) {
  if (c.cost_monthly == null) return <span className="text-slate-400 text-xs">no cost data</span>;
  return <span className="tabular-nums font-medium">${c.cost_monthly.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>;
}

function providerOf(c: CloudResource): 'AWS' | 'GCP' {
  return c.resource_type_key.startsWith('gcp_') ? 'GCP' : 'AWS';
}

// Provider is categorical, not a status — Badge's color system is reserved
// for semantic status (see Badge.tsx's own doc comment), so this renders a
// plain neutral pill instead of misusing Badge's tone palette here.
function providerBadge(c: CloudResource) {
  return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{providerOf(c)}</span>;
}

export function Clusters() {
  const { account, connections, refreshToken } = useFilters();
  const [tab, setTab] = useTabParam<Tab>(TABS, 'ECS Clusters');

  // 'all' shows every tab (resources from either provider could exist);
  // a specific account narrows to that account's own provider — no point
  // showing ECS/EKS tabs while a GCP project is selected, or vice versa.
  // Azure isn't a supported provider in this codebase yet (no connector,
  // no resource types), so this can only ever resolve to 'aws' | 'gcp' | 'all'.
  const selectedProvider = account === 'all' ? null : connections.find(c => c.id === account)?.provider ?? null;
  const visibleTabs: readonly Tab[] =
    selectedProvider === 'aws' ? [...AWS_ONLY_TABS, ...SHARED_TABS]
    : selectedProvider === 'gcp' ? [...GCP_ONLY_TABS, ...SHARED_TABS]
    : TABS;

  useEffect(() => {
    if (!visibleTabs.includes(tab)) setTab(visibleTabs[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProvider]);
  const [ecsClusters, setEcsClusters] = useState<CloudResource[]>([]);
  const [eksClusters, setEksClusters] = useState<CloudResource[]>([]);
  // The containers domain exposes individual EKS nodes (not aggregated node
  // groups the way the old API did) — see getEksNodes() in api.ts.
  const [eksNodes, setEksNodes] = useState<CloudResource[]>([]);
  const [ecsServices, setEcsServices] = useState<CloudResource[]>([]);
  const [ecsTasks, setEcsTasks] = useState<CloudResource[]>([]);
  const [eksDeployments, setEksDeployments] = useState<CloudResource[]>([]);
  const [eksPods, setEksPods] = useState<CloudResource[]>([]);
  const [eksNamespaces, setEksNamespaces] = useState<CloudResource[]>([]);
  const [cloudRun, setCloudRun] = useState<CloudResource[]>([]);
  const [artifactRepos, setArtifactRepos] = useState<CloudResource[]>([]);
  const [artifactImages, setArtifactImages] = useState<CloudResource[]>([]);
  const [gkeClusters, setGkeClusters] = useState<CloudResource[]>([]);
  const [gkeDeployments, setGkeDeployments] = useState<CloudResource[]>([]);
  const [gkePods, setGkePods] = useState<CloudResource[]>([]);
  const [notBuilt, setNotBuilt] = useState<{ label: string; reason: string }[]>([]);
  const [selected, setSelected] = useState<CloudResource | null>(null);

  const load = useCallback(async () => {
    const connectionId = account === 'all' ? undefined : account;
    const [
      eksRes, ecsClusterRes, nodesRes, svcRes, taskRes,
      eksDeployRes, eksPodRes,
      cloudRunRes, artifactRepoRes, artifactImageRes, gkeClusterRes, gkeDeployRes, gkePodRes,
      namespaces, helmReleases,
    ] = await Promise.all([
      api.getEksClusters({ connectionId, limit: 200 }),
      api.getEcsClusters({ connectionId, limit: 200 }),
      api.getEksNodes({ connectionId, limit: 500 }),
      api.getEcsServices({ connectionId, limit: 500 }),
      api.getEcsTasks({ connectionId, limit: 500 }),
      api.getEksDeployments({ connectionId, limit: 500 }),
      api.getEksPods({ connectionId, limit: 500 }),
      api.getGcpCloudRun({ connectionId, limit: 200 }),
      api.getGcpArtifactRegistryRepos({ connectionId, limit: 200 }),
      api.getGcpArtifactRegistryImages({ connectionId, limit: 500 }),
      api.getGkeClusters({ connectionId, limit: 200 }),
      api.getGkeDeployments({ connectionId, limit: 500 }),
      api.getGkePods({ connectionId, limit: 500 }),
      api.getEksNamespaces({ connectionId, limit: 500 }),
      api.getEksHelmReleases(),
    ]);
    setEksClusters(eksRes.items);
    setEcsClusters(ecsClusterRes.items);
    setEksNodes(nodesRes.items);
    setEcsServices(svcRes.items);
    setEcsTasks(taskRes.items);
    setEksDeployments(eksDeployRes.items);
    setEksPods(eksPodRes.items);
    setCloudRun(cloudRunRes.items);
    setArtifactRepos(artifactRepoRes.items);
    setArtifactImages(artifactImageRes.items);
    setGkeClusters(gkeClusterRes.items);
    setGkeDeployments(gkeDeployRes.items);
    setGkePods(gkePodRes.items);
    // Namespaces now has a real EKS scanner (GKE's own is still not built —
    // see gkeWorkloads.ts). Helm releases still has no scanner for either
    // provider — shown honestly rather than as a silent empty table.
    setEksNamespaces(namespaces.items);
    setNotBuilt([
      { label: 'Helm Releases', reason: helmReleases.reason },
    ]);
  }, [account]);

  useEffect(() => { void load(); }, [load, refreshToken]);

  const ecsClusterNameByArn = new Map(ecsClusters.map(c => [c.resource_id, c.resource_name ?? c.resource_id]));
  const deployments = [...eksDeployments, ...gkeDeployments];
  const pods = [...eksPods, ...gkePods];

  const ecsClusterColumns: Column<CloudResource>[] = [
    { key: 'name', header: 'Cluster', render: c => c.resource_name ?? c.resource_id, sortValue: c => c.resource_name ?? '' },
    { key: 'region', header: 'Region', render: c => c.region ?? 'global', sortValue: c => c.region ?? '' },
    { key: 'status', header: 'Status', render: c => <Badge>{c.state ?? c.status}</Badge>, sortValue: c => c.state ?? c.status },
    { key: 'services', header: 'Services', render: c => ecsServices.filter(s => s.relationships?.clusterArn === c.resource_id).length, sortValue: c => ecsServices.filter(s => s.relationships?.clusterArn === c.resource_id).length },
    { key: 'tasks', header: 'Tasks', render: c => ecsTasks.filter(t => t.relationships?.clusterArn === c.resource_id).length, sortValue: c => ecsTasks.filter(t => t.relationships?.clusterArn === c.resource_id).length },
    { key: 'cost', header: 'Est. Monthly Cost', render: costCell, sortValue: c => c.cost_monthly ?? 0 },
  ];

  const eksClusterColumns: Column<CloudResource>[] = [
    { key: 'name', header: 'Cluster', render: c => c.resource_name ?? c.resource_id, sortValue: c => c.resource_name ?? '' },
    { key: 'region', header: 'Region', render: c => c.region ?? 'global', sortValue: c => c.region ?? '' },
    { key: 'status', header: 'Status', render: c => <Badge>{c.state ?? c.status}</Badge>, sortValue: c => c.state ?? c.status },
    { key: 'nodes', header: 'Nodes', render: c => eksNodes.filter(n => n.relationships?.clusterName === c.resource_name).length, sortValue: c => eksNodes.filter(n => n.relationships?.clusterName === c.resource_name).length },
    { key: 'version', header: 'Version', render: c => (c.metadata?.version as string) ?? '—' },
    { key: 'cost', header: 'Est. Monthly Cost', render: costCell, sortValue: c => c.cost_monthly ?? 0 },
  ];

  const ecsServiceColumns: Column<CloudResource>[] = [
    { key: 'name', header: 'Service', render: s => s.resource_name ?? s.resource_id, sortValue: s => s.resource_name ?? '' },
    { key: 'cluster', header: 'Cluster', render: s => ecsClusterNameByArn.get(s.relationships?.clusterArn as string) ?? (s.relationships?.clusterArn as string) ?? '—', sortValue: s => (s.relationships?.clusterArn as string) ?? '' },
    { key: 'running', header: 'Running / Desired', render: s => `${(s.metadata?.runningCount as number) ?? 0} / ${(s.metadata?.desiredCount as number) ?? 0}` },
    { key: 'region', header: 'Region', render: s => s.region ?? '—', sortValue: s => s.region ?? '' },
    { key: 'status', header: 'Status', render: s => <Badge>{s.state ?? s.status}</Badge>, sortValue: s => s.state ?? s.status },
  ];

  const ecsTaskColumns: Column<CloudResource>[] = [
    { key: 'name', header: 'Task', render: t => t.resource_name ?? t.resource_id, sortValue: t => t.resource_name ?? '' },
    { key: 'cluster', header: 'Cluster', render: t => ecsClusterNameByArn.get(t.relationships?.clusterArn as string) ?? (t.relationships?.clusterArn as string) ?? '—', sortValue: t => (t.relationships?.clusterArn as string) ?? '' },
    { key: 'region', header: 'Region', render: t => t.region ?? '—', sortValue: t => t.region ?? '' },
    { key: 'status', header: 'Status', render: t => <Badge>{t.state ?? t.status}</Badge>, sortValue: t => t.state ?? t.status },
  ];

  const nodeColumns: Column<CloudResource>[] = [
    { key: 'name', header: 'Node', render: n => n.resource_name ?? n.resource_id, sortValue: n => n.resource_name ?? '' },
    { key: 'cluster', header: 'Cluster', render: n => (n.relationships?.clusterName as string) ?? '—', sortValue: n => (n.relationships?.clusterName as string) ?? '' },
    { key: 'instanceType', header: 'Instance Type', render: n => (n.metadata?.instanceType as string) ?? '—' },
    { key: 'region', header: 'Region', render: n => n.region ?? '—', sortValue: n => n.region ?? '' },
    { key: 'status', header: 'Status', render: n => <Badge>{n.state ?? n.status}</Badge>, sortValue: n => n.state ?? n.status },
  ];

  const cloudRunColumns: Column<CloudResource>[] = [
    { key: 'name', header: 'Service', render: c => c.resource_name ?? c.resource_id, sortValue: c => c.resource_name ?? '' },
    { key: 'region', header: 'Region', render: c => c.region ?? '—', sortValue: c => c.region ?? '' },
    { key: 'status', header: 'Status', render: c => <Badge>{c.state ?? c.status}</Badge>, sortValue: c => c.state ?? c.status },
    { key: 'cost', header: 'Est. Monthly Cost', render: costCell, sortValue: c => c.cost_monthly ?? 0 },
  ];

  const artifactImageColumns: Column<CloudResource>[] = [
    { key: 'name', header: 'Image', render: i => i.resource_name ?? i.resource_id, sortValue: i => i.resource_name ?? '' },
    { key: 'repo', header: 'Repository', render: i => (i.relationships?.repositoryName as string) ?? '—' },
    { key: 'tags', header: 'Tags', render: i => ((i.metadata?.tags as string[] | undefined)?.join(', ')) || '—' },
    { key: 'region', header: 'Region', render: i => i.region ?? '—', sortValue: i => i.region ?? '' },
  ];

  const artifactRepoColumns: Column<CloudResource>[] = [
    { key: 'name', header: 'Repository', render: r => r.resource_name ?? r.resource_id, sortValue: r => r.resource_name ?? '' },
    { key: 'images', header: 'Images', render: r => artifactImages.filter(i => i.relationships?.repositoryName === r.resource_name).length },
    { key: 'region', header: 'Region', render: r => r.region ?? '—', sortValue: r => r.region ?? '' },
  ];

  const gkeClusterColumns: Column<CloudResource>[] = [
    { key: 'name', header: 'Cluster', render: c => c.resource_name ?? c.resource_id, sortValue: c => c.resource_name ?? '' },
    { key: 'region', header: 'Region', render: c => c.region ?? 'global', sortValue: c => c.region ?? '' },
    { key: 'status', header: 'Status', render: c => <Badge>{c.state ?? c.status}</Badge>, sortValue: c => c.state ?? c.status },
    { key: 'version', header: 'Version', render: c => (c.metadata?.version as string) ?? '—' },
    { key: 'cost', header: 'Est. Monthly Cost', render: costCell, sortValue: c => c.cost_monthly ?? 0 },
  ];

  const deploymentColumns: Column<CloudResource>[] = [
    { key: 'provider', header: 'Provider', render: providerBadge, sortValue: providerOf },
    { key: 'name', header: 'Deployment', render: d => d.resource_name ?? d.resource_id, sortValue: d => d.resource_name ?? '' },
    { key: 'namespace', header: 'Namespace', render: d => (d.metadata?.namespace as string) ?? '—' },
    { key: 'cluster', header: 'Cluster', render: d => (d.relationships?.clusterName as string) ?? '—', sortValue: d => (d.relationships?.clusterName as string) ?? '' },
    { key: 'replicas', header: 'Ready / Desired', render: d => `${(d.metadata?.readyReplicas as number) ?? 0} / ${(d.metadata?.replicas as number) ?? 0}` },
    { key: 'region', header: 'Region', render: d => d.region ?? '—', sortValue: d => d.region ?? '' },
  ];

  const podColumns: Column<CloudResource>[] = [
    { key: 'provider', header: 'Provider', render: providerBadge, sortValue: providerOf },
    { key: 'name', header: 'Pod', render: p => p.resource_name ?? p.resource_id, sortValue: p => p.resource_name ?? '' },
    { key: 'namespace', header: 'Namespace', render: p => (p.metadata?.namespace as string) ?? '—' },
    { key: 'cluster', header: 'Cluster', render: p => (p.relationships?.clusterName as string) ?? '—', sortValue: p => (p.relationships?.clusterName as string) ?? '' },
    { key: 'node', header: 'Node', render: p => (p.metadata?.nodeName as string) ?? '—' },
    { key: 'status', header: 'Status', render: p => <Badge>{p.state ?? p.status}</Badge>, sortValue: p => p.state ?? p.status },
  ];

  // AWS-only for now (GKE has no namespace scanner yet — gkeWorkloads.ts
  // still only covers pods/deployments), unlike Deployments/Pods which
  // already merge both providers. No providerBadge column for that reason.
  const namespaceColumns: Column<CloudResource>[] = [
    { key: 'name', header: 'Namespace', render: n => n.resource_name ?? n.resource_id, sortValue: n => n.resource_name ?? '' },
    { key: 'cluster', header: 'Cluster', render: n => (n.relationships?.clusterName as string) ?? '—', sortValue: n => (n.relationships?.clusterName as string) ?? '' },
    { key: 'region', header: 'Region', render: n => n.region ?? '—', sortValue: n => n.region ?? '' },
    { key: 'status', header: 'Status', render: n => <Badge>{n.state ?? n.status}</Badge>, sortValue: n => n.state ?? n.status },
  ];

  const totalClusters = ecsClusters.length + eksClusters.length + gkeClusters.length;

  return (
    <div>
      <FilterBar title="Container Clusters" breadcrumb={<Breadcrumb />} />

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-5">
        <StatCard label="Total Clusters" value={String(totalClusters)} />
        {selectedProvider !== 'gcp' && <StatCard label="ECS Clusters" value={String(ecsClusters.length)} />}
        {selectedProvider !== 'gcp' && <StatCard label="EKS Clusters" value={String(eksClusters.length)} />}
        {selectedProvider !== 'aws' && <StatCard label="GKE Clusters" value={String(gkeClusters.length)} />}
        {selectedProvider !== 'aws' && <StatCard label="Cloud Run Services" value={String(cloudRun.length)} />}
        {selectedProvider !== 'aws' && <StatCard label="Container Images" value={String(artifactImages.length)} />}
        {selectedProvider !== 'gcp' && <StatCard label="Nodes" value={String(eksNodes.length)} />}
      </div>

      <div className="flex gap-1 text-sm flex-wrap mb-4">
        {visibleTabs.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-md whitespace-nowrap ${tab === t ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'ECS Clusters' && (
        <DataTable columns={ecsClusterColumns} rows={ecsClusters} rowKey={c => c.id} onRowClick={setSelected} emptyMessage="No ECS clusters discovered yet." />
      )}
      {tab === 'EKS Clusters' && (
        <>
          <p className="text-xs text-slate-400 mb-3">
            Est. Monthly Cost is each cluster resource's own synced cost figure — this doesn't compute a
            proportional EC2-to-cluster cost allocation, so it will read "no cost data" for accounts without a
            direct per-resource cost sync yet.
          </p>
          <DataTable columns={eksClusterColumns} rows={eksClusters} rowKey={c => c.id} onRowClick={setSelected} emptyMessage="No EKS clusters discovered yet." />
        </>
      )}
      {tab === 'ECS Services' && (
        <DataTable columns={ecsServiceColumns} rows={ecsServices} rowKey={s => s.id} onRowClick={setSelected} emptyMessage="No ECS services discovered yet." />
      )}
      {tab === 'ECS Tasks' && (
        <DataTable columns={ecsTaskColumns} rows={ecsTasks} rowKey={t => t.id} onRowClick={setSelected} emptyMessage="No ECS tasks discovered yet." />
      )}
      {tab === 'Nodes' && (
        <DataTable columns={nodeColumns} rows={eksNodes} rowKey={n => n.id} onRowClick={setSelected} emptyMessage="No EKS nodes discovered yet." />
      )}
      {tab === 'Cloud Run' && (
        <DataTable columns={cloudRunColumns} rows={cloudRun} rowKey={c => c.id} onRowClick={setSelected} emptyMessage="No Cloud Run services discovered yet." />
      )}
      {tab === 'Artifact Registry' && (
        <>
          <p className="text-xs text-slate-400 mb-3">{artifactRepos.length} repositories, {artifactImages.length} images. Showing images — click a repository row's image count to filter (not yet wired, showing all images below).</p>
          <div className="mb-4">
            <DataTable columns={artifactRepoColumns} rows={artifactRepos} rowKey={r => r.id} onRowClick={setSelected} emptyMessage="No Artifact Registry repositories discovered yet." />
          </div>
          <DataTable columns={artifactImageColumns} rows={artifactImages} rowKey={i => i.id} onRowClick={setSelected} emptyMessage="No container images discovered yet." />
        </>
      )}
      {tab === 'GKE Clusters' && (
        <DataTable columns={gkeClusterColumns} rows={gkeClusters} rowKey={c => c.id} onRowClick={setSelected} emptyMessage="No GKE clusters discovered yet." />
      )}
      {tab === 'Deployments' && (
        <>
          <p className="text-xs text-slate-400 mb-3">Combines AWS EKS and GCP GKE deployments. A cluster only appears here if its connection's identity has been granted Kubernetes RBAC access (aws-auth ConfigMap for EKS, a ClusterRoleBinding for GKE) — a cluster without that mapping shows zero deployments, not an error.</p>
          <DataTable columns={deploymentColumns} rows={deployments} rowKey={d => d.id} onRowClick={setSelected} emptyMessage="No deployments discovered yet." />
        </>
      )}
      {tab === 'Pods' && (
        <DataTable columns={podColumns} rows={pods} rowKey={p => p.id} onRowClick={setSelected} emptyMessage="No pods discovered yet." />
      )}
      {tab === 'Namespaces' && (
        <>
          <p className="text-xs text-slate-400 mb-3">AWS EKS only for now — GKE namespace scanning isn't built yet. A cluster only appears here if its connection's identity has been granted Kubernetes RBAC access (same requirement as Deployments/Pods above).</p>
          <DataTable columns={namespaceColumns} rows={eksNamespaces} rowKey={n => n.id} onRowClick={setSelected} emptyMessage="No namespaces discovered yet." />
        </>
      )}
      {tab === 'Helm Releases' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-400">
            {notBuilt.find(w => w.label === tab)?.reason ?? 'Not built in this pass.'}
          </p>
        </div>
      )}

      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected?.resource_name ?? ''}>
        {selected && (
          <div className="flex flex-col gap-4 text-sm">
            <pre className="text-xs bg-slate-50 dark:bg-slate-800 rounded p-2 overflow-x-auto">{JSON.stringify(selected.metadata, null, 2)}</pre>
            {selected.resource_type_key === 'eks_cluster' && (
              <div>
                <h4 className="font-medium text-slate-700 dark:text-slate-200 mb-1.5">Nodes</h4>
                <ul className="text-xs space-y-1">
                  {eksNodes.filter(n => n.relationships?.clusterName === selected.resource_name).map(n => (
                    <li key={n.id} className="text-slate-600 dark:text-slate-300">{n.resource_name ?? n.resource_id} — {(n.metadata?.instanceType as string) ?? n.state ?? n.status}</li>
                  ))}
                  {eksNodes.filter(n => n.relationships?.clusterName === selected.resource_name).length === 0 && (
                    <li className="text-slate-400">No nodes discovered for this cluster.</li>
                  )}
                </ul>
              </div>
            )}
            {selected.resource_type_key === 'ecs_cluster' && (
              <div>
                <h4 className="font-medium text-slate-700 dark:text-slate-200 mb-1.5">Services</h4>
                <ul className="text-xs space-y-1">
                  {ecsServices.filter(s => s.relationships?.clusterArn === selected.resource_id).map(s => (
                    <li key={s.id} className="text-slate-600 dark:text-slate-300">{s.resource_name} — {(s.metadata?.runningCount as number) ?? 0}/{(s.metadata?.desiredCount as number) ?? 0} running</li>
                  ))}
                  {ecsServices.filter(s => s.relationships?.clusterArn === selected.resource_id).length === 0 && (
                    <li className="text-slate-400">No services discovered for this cluster.</li>
                  )}
                </ul>
              </div>
            )}
            {(selected.resource_type_key === 'gcp_gke_cluster') && (
              <div>
                <h4 className="font-medium text-slate-700 dark:text-slate-200 mb-1.5">Pods</h4>
                <ul className="text-xs space-y-1">
                  {gkePods.filter(p => p.relationships?.clusterName === selected.resource_name).map(p => (
                    <li key={p.id} className="text-slate-600 dark:text-slate-300">{p.resource_name ?? p.resource_id} — {p.state ?? p.status}</li>
                  ))}
                  {gkePods.filter(p => p.relationships?.clusterName === selected.resource_name).length === 0 && (
                    <li className="text-slate-400">No pods discovered for this cluster.</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
