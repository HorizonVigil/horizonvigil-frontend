import { useEffect, useState, useCallback } from 'react';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { StatCard } from '../components/StatCard';
import { DataTable, type Column } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { Drawer } from '../components/Drawer';
import { useFilters } from '../lib/filterContext';
import { api, type CloudResource } from '../lib/api';

// One tab per real AWS resource type the sidebar promises (ECS Clusters, ECS
// Services, ECS Tasks, EKS Clusters, Nodes) — previously ECS/EKS clusters were
// merged into one table and Services/Nodes were only reachable by clicking
// into a specific cluster's drawer, so those two submenu items landed on the
// same generic view no matter what you clicked. Split out so each type has
// its own findable, filterable table.
const TABS = ['ECS Clusters', 'ECS Services', 'ECS Tasks', 'EKS Clusters', 'Nodes'] as const;
type Tab = typeof TABS[number];

function costCell(c: CloudResource) {
  if (c.cost_monthly == null) return <span className="text-slate-400 text-xs">no cost data</span>;
  return <span className="tabular-nums font-medium">${c.cost_monthly.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>;
}

export function Clusters() {
  const { account, refreshToken } = useFilters();
  const [tab, setTab] = useState<Tab>('ECS Clusters');
  const [ecsClusters, setEcsClusters] = useState<CloudResource[]>([]);
  const [eksClusters, setEksClusters] = useState<CloudResource[]>([]);
  // The containers domain exposes individual EKS nodes (not aggregated node
  // groups the way the old API did) — see getEksNodes() in api.ts.
  const [eksNodes, setEksNodes] = useState<CloudResource[]>([]);
  const [ecsServices, setEcsServices] = useState<CloudResource[]>([]);
  const [ecsTasks, setEcsTasks] = useState<CloudResource[]>([]);
  const [k8sWorkloads, setK8sWorkloads] = useState<{ label: string; reason: string }[]>([]);
  const [selected, setSelected] = useState<CloudResource | null>(null);

  const load = useCallback(async () => {
    const connectionId = account === 'all' ? undefined : account;
    const [eksRes, ecsClusterRes, nodesRes, svcRes, taskRes, namespaces, deployments, pods, helmReleases] = await Promise.all([
      api.getEksClusters({ connectionId, limit: 200 }),
      api.getEcsClusters({ connectionId, limit: 200 }),
      api.getEksNodes({ connectionId, limit: 500 }),
      api.getEcsServices({ connectionId, limit: 500 }),
      api.getEcsTasks({ connectionId, limit: 500 }),
      api.getEksNamespaces(),
      api.getEksDeployments(),
      api.getEksPods(),
      api.getEksHelmReleases(),
    ]);
    setEksClusters(eksRes.items);
    setEcsClusters(ecsClusterRes.items);
    setEksNodes(nodesRes.items);
    setEcsServices(svcRes.items);
    setEcsTasks(taskRes.items);
    // These four always come back { items: [], notIntegrated: true, reason } — no
    // Kubernetes API access to any cluster exists in this build. Shown honestly
    // below rather than as silent empty tables with no explanation.
    setK8sWorkloads([
      { label: 'Namespaces', reason: namespaces.reason },
      { label: 'Deployments', reason: deployments.reason },
      { label: 'Pods', reason: pods.reason },
      { label: 'Helm Releases', reason: helmReleases.reason },
    ]);
  }, [account]);

  useEffect(() => { void load(); }, [load, refreshToken]);

  const ecsClusterNameByArn = new Map(ecsClusters.map(c => [c.resource_id, c.resource_name ?? c.resource_id]));

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

  const totalClusters = ecsClusters.length + eksClusters.length;

  return (
    <div>
      <FilterBar title="EKS / ECS Clusters" breadcrumb={<Breadcrumb />} />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <StatCard label="Total Clusters" value={String(totalClusters)} />
        <StatCard label="ECS Clusters" value={String(ecsClusters.length)} />
        <StatCard label="ECS Services" value={String(ecsServices.length)} />
        <StatCard label="EKS Clusters" value={String(eksClusters.length)} />
        <StatCard label="Nodes" value={String(eksNodes.length)} />
      </div>

      <div className="flex gap-1 text-sm flex-wrap mb-4">
        {TABS.map(t => (
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

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mt-5">
        <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Kubernetes Workloads</h3>
        <p className="text-xs text-slate-400 mb-2">Covers the Namespaces, Deployments, Pods and Helm Releases submenu items — none are buildable yet because no Kubernetes API access to any cluster exists in this build (that needs a control-plane connection per EKS cluster, not just the AWS API).</p>
        <ul className="text-xs text-slate-400 flex flex-col gap-1.5">
          {k8sWorkloads.map(w => (
            <li key={w.label}><span className="text-slate-500 dark:text-slate-400 font-medium">{w.label}:</span> {w.reason}</li>
          ))}
        </ul>
      </div>

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
          </div>
        )}
      </Drawer>
    </div>
  );
}
