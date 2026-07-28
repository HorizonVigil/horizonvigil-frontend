import { useEffect, useState, useCallback } from 'react';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { StatCard } from '../components/StatCard';
import { DataTable, type Column } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { Drawer } from '../components/Drawer';
import { useFilters } from '../lib/filterContext';
import { api, type CloudResource } from '../lib/api';

export function Clusters() {
  const { account, refreshToken } = useFilters();
  const [clusters, setClusters] = useState<CloudResource[]>([]);
  // The containers domain exposes individual EKS nodes (not aggregated node
  // groups the way the old API did) — see getEksNodes() in api.ts.
  const [eksNodes, setEksNodes] = useState<CloudResource[]>([]);
  const [ecsServices, setEcsServices] = useState<CloudResource[]>([]);
  const [selected, setSelected] = useState<CloudResource | null>(null);

  const load = useCallback(async () => {
    const connectionId = account === 'all' ? undefined : account;
    const [eksRes, ecsClusterRes, nodesRes, svcRes] = await Promise.all([
      api.getEksClusters({ connectionId, limit: 200 }),
      api.getEcsClusters({ connectionId, limit: 200 }),
      api.getEksNodes({ connectionId, limit: 500 }),
      api.getEcsServices({ connectionId, limit: 500 }),
    ]);
    setClusters([...eksRes.items, ...ecsClusterRes.items]);
    setEksNodes(nodesRes.items);
    setEcsServices(svcRes.items);
  }, [account]);

  useEffect(() => { void load(); }, [load, refreshToken]);

  const columns: Column<CloudResource>[] = [
    { key: 'name', header: 'Cluster', render: c => c.resource_name ?? c.resource_id, sortValue: c => c.resource_name ?? '' },
    { key: 'type', header: 'Type', render: c => c.resource_type_key === 'eks_cluster' ? 'EKS' : 'ECS', sortValue: c => c.resource_type_key },
    { key: 'region', header: 'Region', render: c => c.region ?? 'global', sortValue: c => c.region ?? '' },
    { key: 'status', header: 'Status', render: c => <Badge>{c.state ?? c.status}</Badge>, sortValue: c => c.state ?? c.status },
    {
      key: 'nodes', header: 'Nodes / Services', render: c => c.resource_type_key === 'eks_cluster'
        ? `${eksNodes.filter(n => n.relationships?.clusterName === c.resource_name).length} nodes`
        : `${ecsServices.filter(s => s.relationships?.clusterArn === c.resource_id).length} services`,
    },
    { key: 'version', header: 'Version', render: c => (c.metadata?.version as string) ?? '—' },
    {
      key: 'cost', header: 'Est. Monthly Cost', render: c => {
        if (c.cost_monthly == null) return <span className="text-slate-400 text-xs">no cost data</span>;
        return <span className="tabular-nums font-medium">${c.cost_monthly.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>;
      },
      sortValue: c => c.cost_monthly ?? 0,
    },
  ];

  return (
    <div>
      <FilterBar title="EKS / ECS Clusters" breadcrumb={<Breadcrumb />} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Total Clusters" value={String(clusters.length)} />
        <StatCard label="EKS Clusters" value={String(clusters.filter(c => c.resource_type_key === 'eks_cluster').length)} />
        <StatCard label="ECS Clusters" value={String(clusters.filter(c => c.resource_type_key === 'ecs_cluster').length)} />
        <StatCard label="Nodes / Services" value={String(eksNodes.length + ecsServices.length)} />
      </div>

      <p className="text-xs text-slate-400 mb-3">
        Est. Monthly Cost is each cluster resource's own synced cost figure — this rebuild doesn't compute a
        proportional EC2-to-cluster cost allocation the way the previous version did, so it will read "no cost
        data" for accounts without a direct per-resource cost sync yet.
      </p>

      <DataTable columns={columns} rows={clusters} rowKey={c => c.id} onRowClick={setSelected} emptyMessage="No EKS or ECS clusters discovered yet." />

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
