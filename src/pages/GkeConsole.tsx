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
import { RelatedList, RelatedRow, RawMetadata, podHealthTone } from '../components/k8s/DetailPrimitives';

// GCP's Kubernetes offering — GKE — plus Cloud Run and Artifact Registry,
// GCP's other container-adjacent services discovered via the same
// connection. Split out from the old unified Clusters.tsx so this page only
// ever shows GCP data — see the multi-cloud K8s consoles plan.
//
// GKE workload scanning (pods/deployments) is real but shallower than EKS's
// today — no namespaces, no nodes, thinner per-object metadata — and is
// self-documented as unverified against a live cluster (gkeWorkloads.ts).
// Phase 1 of the consoles plan brings this to EKS's depth; until then,
// deployments/pods here fall back to a raw-metadata view rather than a
// half-built rich panel.
const TABS = ['GKE Clusters', 'Deployments', 'Pods', 'Helm Releases', 'Cloud Run', 'Artifact Registry'] as const;
type Tab = typeof TABS[number];

function costCell(c: CloudResource) {
  if (c.cost_monthly == null) return <span className="text-slate-400 text-xs">no cost data</span>;
  return <span className="tabular-nums font-medium">${c.cost_monthly.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>;
}

export function GkeConsole() {
  const { account, refreshToken } = useFilters();
  const [tab, setTab] = useTabParam<Tab>(TABS, 'GKE Clusters');

  const [gkeClusters, setGkeClusters] = useState<CloudResource[]>([]);
  const [gkeDeployments, setGkeDeployments] = useState<CloudResource[]>([]);
  const [gkePods, setGkePods] = useState<CloudResource[]>([]);
  const [cloudRun, setCloudRun] = useState<CloudResource[]>([]);
  const [artifactRepos, setArtifactRepos] = useState<CloudResource[]>([]);
  const [artifactImages, setArtifactImages] = useState<CloudResource[]>([]);
  const [helmReleaseReason, setHelmReleaseReason] = useState('Helm release scanning is available in the Enterprise plan.');
  const [selected, setSelected] = useState<CloudResource | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<CloudResource | null>(null);

  const load = useCallback(async () => {
    const connectionId = account === 'all' ? undefined : account;
    const [gkeClusterRes, gkeDeployRes, gkePodRes, cloudRunRes, artifactRepoRes, artifactImageRes, helmReleases] = await Promise.all([
      api.getGkeClusters({ connectionId, limit: 200 }),
      api.getGkeDeployments({ connectionId, limit: 500 }),
      api.getGkePods({ connectionId, limit: 500 }),
      api.getGcpCloudRun({ connectionId, limit: 200 }),
      api.getGcpArtifactRegistryRepos({ connectionId, limit: 200 }),
      api.getGcpArtifactRegistryImages({ connectionId, limit: 500 }),
      // Helm release tracking isn't built for either provider — this
      // endpoint's "not built" reason is provider-agnostic, so it's reused
      // here rather than standing up a duplicate GCP-specific stub route.
      api.getEksHelmReleases(),
    ]);
    setGkeClusters(gkeClusterRes.items);
    setGkeDeployments(gkeDeployRes.items);
    setGkePods(gkePodRes.items);
    setCloudRun(cloudRunRes.items);
    setArtifactRepos(artifactRepoRes.items);
    setArtifactImages(artifactImageRes.items);
    setHelmReleaseReason(helmReleases.reason);
  }, [account]);

  useEffect(() => { void load(); }, [load, refreshToken]);

  const gkeClusterColumns: Column<CloudResource>[] = [
    { key: 'name', header: 'Cluster', render: c => c.resource_name ?? c.resource_id, sortValue: c => c.resource_name ?? '' },
    { key: 'region', header: 'Region', render: c => c.region ?? 'global', sortValue: c => c.region ?? '' },
    { key: 'status', header: 'Status', render: c => <Badge>{c.state ?? c.status}</Badge>, sortValue: c => c.state ?? c.status },
    { key: 'version', header: 'Version', render: c => (c.metadata?.version as string) ?? '—' },
    { key: 'nodeCount', header: 'Nodes', render: c => (c.metadata?.nodeCount as number) ?? '—' },
    { key: 'cost', header: 'Est. Monthly Cost', render: costCell, sortValue: c => c.cost_monthly ?? 0 },
  ];

  const deploymentColumns: Column<CloudResource>[] = [
    { key: 'name', header: 'Deployment', render: d => d.resource_name ?? d.resource_id, sortValue: d => d.resource_name ?? '' },
    { key: 'namespace', header: 'Namespace', render: d => (d.metadata?.namespace as string) ?? '—' },
    { key: 'cluster', header: 'Cluster', render: d => (d.relationships?.clusterName as string) ?? '—', sortValue: d => (d.relationships?.clusterName as string) ?? '' },
    { key: 'replicas', header: 'Ready / Desired', render: d => `${(d.metadata?.readyReplicas as number) ?? 0} / ${(d.metadata?.replicas as number) ?? 0}` },
    { key: 'region', header: 'Region', render: d => d.region ?? '—', sortValue: d => d.region ?? '' },
  ];

  const podColumns: Column<CloudResource>[] = [
    { key: 'name', header: 'Pod', render: p => p.resource_name ?? p.resource_id, sortValue: p => p.resource_name ?? '' },
    { key: 'namespace', header: 'Namespace', render: p => (p.metadata?.namespace as string) ?? '—' },
    { key: 'cluster', header: 'Cluster', render: p => (p.relationships?.clusterName as string) ?? '—', sortValue: p => (p.relationships?.clusterName as string) ?? '' },
    { key: 'node', header: 'Node', render: p => (p.metadata?.nodeName as string) ?? '—' },
    { key: 'status', header: 'Status', render: p => <Badge tone={podHealthTone(p)}>{p.state ?? p.status}</Badge>, sortValue: p => p.state ?? p.status },
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

  return (
    <div>
      <FilterBar title="GCP GKE Console" breadcrumb={<Breadcrumb />} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCard label="GKE Clusters" value={String(gkeClusters.length)} />
        <StatCard label="Deployments" value={String(gkeDeployments.length)} />
        <StatCard label="Pods" value={String(gkePods.length)} />
        <StatCard label="Cloud Run Services" value={String(cloudRun.length)} />
      </div>

      <div className="flex gap-1 text-sm flex-wrap mb-4">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-md whitespace-nowrap ${tab === t ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'GKE Clusters' && (
        <DataTable columns={gkeClusterColumns} rows={gkeClusters} rowKey={c => c.id} onRowClick={setSelected} emptyMessage="No GKE clusters discovered yet." />
      )}
      {tab === 'Deployments' && (
        <>
          <p className="text-xs text-slate-400 mb-3">A cluster only appears here if its connection's identity has been granted Kubernetes RBAC access (a ClusterRoleBinding) — a cluster without that mapping shows zero deployments, not an error.</p>
          <DataTable columns={deploymentColumns} rows={gkeDeployments} rowKey={d => d.id} onRowClick={setSelected} emptyMessage="No deployments discovered yet." />
        </>
      )}
      {tab === 'Pods' && (
        <DataTable columns={podColumns} rows={gkePods} rowKey={p => p.id} onRowClick={setSelected} emptyMessage="No pods discovered yet." />
      )}
      {tab === 'Helm Releases' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-400">{helmReleaseReason}</p>
        </div>
      )}
      {tab === 'Cloud Run' && (
        <DataTable columns={cloudRunColumns} rows={cloudRun} rowKey={c => c.id} onRowClick={setSelected} emptyMessage="No Cloud Run services discovered yet." />
      )}
      {tab === 'Artifact Registry' && (
        <>
          <p className="text-xs text-slate-400 mb-3">{artifactRepos.length} repositories, {artifactImages.length} images total. Click a repository to filter images.</p>
          <div className="mb-4">
            <DataTable columns={artifactRepoColumns} rows={artifactRepos} rowKey={r => r.id} onRowClick={(r) => { setSelectedRepo(r); setSelected(r); }} emptyMessage="No Artifact Registry repositories discovered yet." />
          </div>
          {selectedRepo && (
            <div className="flex items-center justify-between mb-3 rounded-md border border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-900/20 px-3 py-2">
              <span className="text-sm text-slate-700 dark:text-slate-200">
                <strong>{selectedRepo.resource_name}</strong> — {artifactImages.filter(i => i.relationships?.repositoryName === selectedRepo.resource_name).length} images
              </span>
              <button onClick={() => { setSelectedRepo(null); setSelected(null); }} className="text-xs text-brand-600 dark:text-brand-400 hover:underline">Show all images</button>
            </div>
          )}
          <DataTable columns={artifactImageColumns} rows={selectedRepo ? artifactImages.filter(i => i.relationships?.repositoryName === selectedRepo.resource_name) : artifactImages} rowKey={i => i.id} onRowClick={setSelected} emptyMessage={selectedRepo ? `No images found in "${selectedRepo.resource_name}".` : "No container images discovered yet."} />
        </>
      )}

      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected?.resource_name ?? ''}>
        {selected && <ResourceDetail resource={selected} onNavigate={setSelected} gkePods={gkePods} />}
      </Drawer>
    </div>
  );
}

interface ResourceDetailProps {
  resource: CloudResource;
  onNavigate: (r: CloudResource) => void;
  gkePods: CloudResource[];
}

function ResourceDetail({ resource: r, onNavigate, gkePods }: ResourceDetailProps) {
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

  // Deployments/Pods/Cloud Run/Artifact Registry — no dedicated panel yet
  // (see the Phase 1 note in this file's header comment); honest raw view.
  return (
    <div className="flex flex-col gap-4 text-sm">
      <RawMetadata metadata={r.metadata} />
    </div>
  );
}
