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
  // Two genuinely different things: eksNodes is real Kubernetes Node objects
  // (hostname, IPs, kubelet version, capacity) via getEksNodes(); eksNodegroups
  // is AWS's own management abstraction (instance types, AMI, nodegroup-level
  // status like CREATE_FAILED) via getEksNodegroups() — a nodegroup can fail
  // to create while some nodes it did manage to launch are still Ready.
  const [eksNodes, setEksNodes] = useState<CloudResource[]>([]);
  const [eksNodegroups, setEksNodegroups] = useState<CloudResource[]>([]);
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
      namespaces, helmReleases, nodegroupsRes,
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
      api.getEksNodegroups({ connectionId, limit: 200 }),
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
    setEksNodegroups(nodegroupsRes.items);
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
    { key: 'internalIp', header: 'Internal IP', render: n => (n.metadata?.internalIp as string) ?? '—' },
    { key: 'kubeletVersion', header: 'Kubelet', render: n => (n.metadata?.kubeletVersion as string) ?? '—' },
    { key: 'zone', header: 'Zone', render: n => (n.metadata?.zone as string) ?? n.region ?? '—', sortValue: n => n.region ?? '' },
    { key: 'status', header: 'Status', render: n => <Badge tone={n.state === 'Ready' ? 'good' : 'critical'}>{n.state ?? n.status}</Badge>, sortValue: n => n.state ?? n.status },
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
          <ResourceDetail
            resource={selected}
            onNavigate={setSelected}
            eksClusters={eksClusters} eksNodes={eksNodes} eksNodegroups={eksNodegroups}
            eksNamespaces={eksNamespaces} eksDeployments={eksDeployments} eksPods={eksPods}
            ecsServices={ecsServices} gkePods={gkePods}
          />
        )}
      </Drawer>
    </div>
  );
}

// ── Detail panel ─────────────────────────────────────────────────────────
// Replaces a raw JSON dump with labeled fields + clickable related
// resources, per resource type — every relationship below is derived from
// data already loaded on this page (no extra API calls), matched the same
// way the K8s objects themselves relate: pod.metadata.namespace/nodeName
// are literal Kubernetes fields, not something CloudOps360 invented.
// Deployment -> Pod matching is the one heuristic (K8s pods are owned by a
// ReplicaSet, which is owned by the Deployment; no ReplicaSet scanner
// exists yet) -- matched by namespace + the standard "<deployment>-<hash>"
// pod-name prefix Kubernetes itself generates, not exact but reliable in
// practice and clearly labeled as such below.

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="flex justify-between gap-4 py-1 text-xs border-b border-slate-100 dark:border-slate-800/60 last:border-0">
      <dt className="text-slate-400 dark:text-slate-500 shrink-0">{label}</dt>
      <dd className="text-slate-700 dark:text-slate-200 text-right break-all">{value}</dd>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">{title}</h4>
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 px-3">{children}</div>
    </div>
  );
}

function RelatedList({ title, items, empty, render }: { title: string; items: CloudResource[]; empty: string; render: (r: CloudResource) => React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">{title} {items.length > 0 && <span className="text-slate-300 dark:text-slate-600 normal-case font-normal">({items.length})</span>}</h4>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1">{items.map(render)}</ul>
      )}
    </div>
  );
}

function RelatedRow({ resource, onClick, right }: { resource: CloudResource; onClick: () => void; right?: React.ReactNode }) {
  return (
    <li>
      <button onClick={onClick} className="w-full flex items-center justify-between gap-2 text-left text-xs rounded-md px-2 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
        <span className="truncate">{resource.resource_name ?? resource.resource_id}</span>
        {right && <span className="shrink-0">{right}</span>}
      </button>
    </li>
  );
}

function bytesFromK8sQuantity(q?: string): string {
  // Kubernetes memory quantities are usually "Ki" suffixed (e.g. "16330000Ki") — real unit
  // conversion, not a guess, since that's the one suffix kubelet actually reports for memory.
  if (!q) return '—';
  const m = /^(\d+)Ki$/.exec(q);
  if (!m) return q;
  return `${(Number(m[1]) / (1024 * 1024)).toFixed(1)} GiB`;
}

interface ResourceDetailProps {
  resource: CloudResource;
  onNavigate: (r: CloudResource) => void;
  eksClusters: CloudResource[]; eksNodes: CloudResource[]; eksNodegroups: CloudResource[];
  eksNamespaces: CloudResource[]; eksDeployments: CloudResource[]; eksPods: CloudResource[];
  ecsServices: CloudResource[]; gkePods: CloudResource[];
}

function ResourceDetail({ resource: r, onNavigate, eksClusters, eksNodes, eksNodegroups, eksNamespaces, eksDeployments, eksPods, ecsServices, gkePods }: ResourceDetailProps) {
  const m = r.metadata ?? {};
  const clusterName = r.relationships?.clusterName as string | undefined;
  const cluster = clusterName ? eksClusters.find(c => c.resource_name === clusterName) : undefined;

  const clusterLink = cluster && (
    <DetailField label="Cluster" value={<button onClick={() => onNavigate(cluster)} className="text-brand-600 dark:text-brand-400 hover:underline">{clusterName}</button>} />
  );

  if (r.resource_type_key === 'eks_cluster') {
    const nodesHere = eksNodes.filter(n => n.relationships?.clusterName === r.resource_name);
    const nodegroupsHere = eksNodegroups.filter(n => n.relationships?.clusterName === r.resource_name);
    const nsHere = eksNamespaces.filter(n => n.relationships?.clusterName === r.resource_name);
    const depsHere = eksDeployments.filter(d => d.relationships?.clusterName === r.resource_name);
    const readyCount = nodesHere.filter(n => n.state === 'Ready').length;
    return (
      <div className="flex flex-col gap-4 text-sm">
        <DetailSection title="Overview">
          <DetailField label="Status" value={<Badge>{r.state ?? r.status}</Badge>} />
          <DetailField label="Version" value={m.version as string} />
          <DetailField label="Region" value={r.region} />
          <DetailField label="Endpoint" value={<span className="font-mono text-[11px]">{m.endpoint as string}</span>} />
          <DetailField label="Nodes Ready" value={`${readyCount} / ${nodesHere.length}`} />
        </DetailSection>
        {nodegroupsHere.some(ng => ng.state && !['ACTIVE'].includes(ng.state)) && (
          <div className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-900/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            {nodegroupsHere.filter(ng => ng.state && ng.state !== 'ACTIVE').map(ng => (
              <div key={ng.id}>⚠ Node group "{ng.resource_name}" is {ng.state} — check the AWS EKS Console's Compute tab for the reason (capacity, IAM, or subnet/security-group issues are the common causes). Any nodes it did launch may still be Ready below.</div>
            ))}
          </div>
        )}
        <RelatedList title="Nodes" items={nodesHere} empty="No nodes discovered — re-run Discover Resources, or check the access entry / aws-auth mapping." render={n => (
          <RelatedRow key={n.id} resource={n} onClick={() => onNavigate(n)} right={<Badge tone={n.state === 'Ready' ? 'good' : 'critical'}>{n.state}</Badge>} />
        )} />
        <RelatedList title="Namespaces" items={nsHere} empty="No namespaces discovered." render={n => <RelatedRow key={n.id} resource={n} onClick={() => onNavigate(n)} />} />
        <RelatedList title="Deployments" items={depsHere} empty="No deployments discovered." render={d => <RelatedRow key={d.id} resource={d} onClick={() => onNavigate(d)} />} />
      </div>
    );
  }

  if (r.resource_type_key === 'eks_node') {
    const podsHere = eksPods.filter(p => p.metadata?.nodeName === r.resource_name);
    return (
      <div className="flex flex-col gap-4 text-sm">
        <DetailSection title="Overview">
          <DetailField label="Status" value={<Badge tone={r.state === 'Ready' ? 'good' : 'critical'}>{r.state}</Badge>} />
          {clusterLink}
          <DetailField label="Zone" value={m.zone as string} />
          <DetailField label="Instance Type" value={m.instanceType as string} />
          <DetailField label="Capacity Type" value={m.capacityType as string} />
          <DetailField label="Internal IP" value={m.internalIp as string} />
          <DetailField label="External IP" value={m.externalIp as string} />
        </DetailSection>
        <DetailSection title="System">
          <DetailField label="OS" value={m.osImage as string} />
          <DetailField label="Architecture" value={m.architecture as string} />
          <DetailField label="Kernel" value={m.kernelVersion as string} />
          <DetailField label="Container Runtime" value={m.containerRuntimeVersion as string} />
          <DetailField label="Kubelet Version" value={m.kubeletVersion as string} />
        </DetailSection>
        <DetailSection title="Capacity">
          <DetailField label="CPU (allocatable / capacity)" value={`${m.allocatableCpu ?? '—'} / ${m.capacityCpu ?? '—'}`} />
          <DetailField label="Memory (allocatable / capacity)" value={`${bytesFromK8sQuantity(m.allocatableMemory as string)} / ${bytesFromK8sQuantity(m.capacityMemory as string)}`} />
          <DetailField label="Pods (allocatable / capacity)" value={`${m.allocatablePods ?? '—'} / ${m.capacityPods ?? '—'}`} />
        </DetailSection>
        <RelatedList title="Pods on this node" items={podsHere} empty="No pods scheduled here." render={p => (
          <RelatedRow key={p.id} resource={p} onClick={() => onNavigate(p)} right={<Badge>{p.state ?? p.status}</Badge>} />
        )} />
      </div>
    );
  }

  if (r.resource_type_key === 'eks_namespace') {
    const podsHere = eksPods.filter(p => p.metadata?.namespace === r.resource_name && p.relationships?.clusterName === clusterName);
    const depsHere = eksDeployments.filter(d => d.metadata?.namespace === r.resource_name && d.relationships?.clusterName === clusterName);
    return (
      <div className="flex flex-col gap-4 text-sm">
        <DetailSection title="Overview">
          <DetailField label="Status" value={<Badge>{r.state ?? r.status}</Badge>} />
          {clusterLink}
          <DetailField label="Pods" value={podsHere.length} />
          <DetailField label="Deployments" value={depsHere.length} />
        </DetailSection>
        <RelatedList title="Deployments" items={depsHere} empty="No deployments in this namespace." render={d => <RelatedRow key={d.id} resource={d} onClick={() => onNavigate(d)} />} />
        <RelatedList title="Pods" items={podsHere} empty="No pods in this namespace." render={p => (
          <RelatedRow key={p.id} resource={p} onClick={() => onNavigate(p)} right={<Badge>{p.state ?? p.status}</Badge>} />
        )} />
      </div>
    );
  }

  if (r.resource_type_key === 'eks_deployment') {
    const namespace = m.namespace as string | undefined;
    // Heuristic pod match — see the section doc comment above.
    const podsHere = eksPods.filter(p =>
      p.metadata?.namespace === namespace &&
      p.relationships?.clusterName === clusterName &&
      (p.resource_name ?? '').startsWith(`${r.resource_name}-`),
    );
    const namespaceObj = eksNamespaces.find(n => n.resource_name === namespace && n.relationships?.clusterName === clusterName);
    return (
      <div className="flex flex-col gap-4 text-sm">
        <DetailSection title="Overview">
          {clusterLink}
          <DetailField label="Namespace" value={namespaceObj ? <button onClick={() => onNavigate(namespaceObj)} className="text-brand-600 dark:text-brand-400 hover:underline">{namespace}</button> : namespace} />
          <DetailField label="Replicas (ready / desired)" value={`${(m.readyReplicas as number) ?? 0} / ${(m.replicas as number) ?? 0}`} />
          <DetailField label="Available" value={m.availableReplicas as number} />
          <DetailField label="Created" value={m.createdAt ? new Date(m.createdAt as string).toLocaleString() : undefined} />
        </DetailSection>
        {Array.isArray(m.images) && (m.images as string[]).length > 0 && (
          <DetailSection title="Images">
            {(m.images as string[]).map((img, i) => <DetailField key={i} label={`Container ${i + 1}`} value={<span className="font-mono text-[11px]">{img}</span>} />)}
          </DetailSection>
        )}
        <RelatedList title="Pods" items={podsHere} empty="No pods matched by name — this is a name-prefix heuristic (no ReplicaSet scanner yet), so a pod from a very old rollout may not match." render={p => (
          <RelatedRow key={p.id} resource={p} onClick={() => onNavigate(p)} right={<Badge>{p.state ?? p.status}</Badge>} />
        )} />
      </div>
    );
  }

  if (r.resource_type_key === 'eks_pod') {
    const namespace = m.namespace as string | undefined;
    const node = eksNodes.find(n => n.resource_name === m.nodeName && n.relationships?.clusterName === clusterName);
    const namespaceObj = eksNamespaces.find(n => n.resource_name === namespace && n.relationships?.clusterName === clusterName);
    return (
      <div className="flex flex-col gap-4 text-sm">
        <DetailSection title="Overview">
          <DetailField label="Status" value={<Badge>{r.state ?? r.status}</Badge>} />
          {clusterLink}
          <DetailField label="Namespace" value={namespaceObj ? <button onClick={() => onNavigate(namespaceObj)} className="text-brand-600 dark:text-brand-400 hover:underline">{namespace}</button> : namespace} />
          <DetailField label="Node" value={node ? <button onClick={() => onNavigate(node)} className="text-brand-600 dark:text-brand-400 hover:underline">{m.nodeName as string}</button> : (m.nodeName as string)} />
          <DetailField label="Created" value={m.createdAt ? new Date(m.createdAt as string).toLocaleString() : undefined} />
        </DetailSection>
        {Array.isArray(m.images) && (m.images as string[]).length > 0 && (
          <DetailSection title="Containers">
            {(m.images as string[]).map((img, i) => <DetailField key={i} label={`Container ${i + 1}`} value={<span className="font-mono text-[11px]">{img}</span>} />)}
          </DetailSection>
        )}
        {r.tags && Object.keys(r.tags).length > 0 && (
          <DetailSection title="Labels">
            {Object.entries(r.tags).map(([k, v]) => <DetailField key={k} label={k} value={v} />)}
          </DetailSection>
        )}
      </div>
    );
  }

  if (r.resource_type_key === 'ecs_cluster') {
    const servicesHere = ecsServices.filter(s => s.relationships?.clusterArn === r.resource_id);
    return (
      <div className="flex flex-col gap-4 text-sm">
        <RelatedList title="Services" items={servicesHere} empty="No services discovered for this cluster." render={s => (
          <RelatedRow key={s.id} resource={s} onClick={() => onNavigate(s)} right={`${(s.metadata?.runningCount as number) ?? 0}/${(s.metadata?.desiredCount as number) ?? 0} running`} />
        )} />
        <RawMetadata metadata={r.metadata} />
      </div>
    );
  }

  if (r.resource_type_key === 'gcp_gke_cluster') {
    const podsHere = gkePods.filter(p => p.relationships?.clusterName === r.resource_name);
    return (
      <div className="flex flex-col gap-4 text-sm">
        <RelatedList title="Pods" items={podsHere} empty="No pods discovered for this cluster." render={p => (
          <RelatedRow key={p.id} resource={p} onClick={() => onNavigate(p)} right={<Badge>{p.state ?? p.status}</Badge>} />
        )} />
        <RawMetadata metadata={r.metadata} />
      </div>
    );
  }

  // Anything else (ECS services/tasks, Cloud Run, Artifact Registry, GKE
  // deployments/pods, nodegroups) — no dedicated panel built yet, honest
  // raw view rather than a half-built one.
  return (
    <div className="flex flex-col gap-4 text-sm">
      <RawMetadata metadata={r.metadata} />
    </div>
  );
}

function RawMetadata({ metadata }: { metadata?: Record<string, unknown> | null }) {
  if (!metadata || Object.keys(metadata).length === 0) return null;
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-slate-400 dark:text-slate-500 select-none">Raw metadata</summary>
      <pre className="mt-2 bg-slate-50 dark:bg-slate-800 rounded p-2 overflow-x-auto">{JSON.stringify(metadata, null, 2)}</pre>
    </details>
  );
}
