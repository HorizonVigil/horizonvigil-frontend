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
  const [nodegroups, setNodegroups] = useState<CloudResource[]>([]);
  const [ecsServices, setEcsServices] = useState<CloudResource[]>([]);
  const [selected, setSelected] = useState<CloudResource | null>(null);

  const load = useCallback(async () => {
    const connectionId = account === 'all' ? undefined : account;
    const [eksRes, ecsClusterRes, ngRes, svcRes] = await Promise.all([
      api.getResources({ resourceTypeKey: 'eks_cluster', connectionId, limit: 200 }),
      api.getResources({ resourceTypeKey: 'ecs_cluster', connectionId, limit: 200 }),
      api.getResources({ resourceTypeKey: 'eks_nodegroup', connectionId, limit: 500 }),
      api.getResources({ resourceTypeKey: 'ecs_service', connectionId, limit: 500 }),
    ]);
    setClusters([...eksRes.resources, ...ecsClusterRes.resources]);
    setNodegroups(ngRes.resources);
    setEcsServices(svcRes.resources);
  }, [account]);

  useEffect(() => { void load(); }, [load, refreshToken]);

  const columns: Column<CloudResource>[] = [
    { key: 'name', header: 'Cluster', render: c => c.resourceName ?? c.resourceId, sortValue: c => c.resourceName ?? '' },
    { key: 'type', header: 'Type', render: c => c.resourceTypeKey === 'eks_cluster' ? 'EKS' : 'ECS', sortValue: c => c.resourceTypeKey },
    { key: 'region', header: 'Region', render: c => c.region ?? 'global', sortValue: c => c.region ?? '' },
    { key: 'status', header: 'Status', render: c => <Badge>{c.state ?? c.status}</Badge>, sortValue: c => c.state ?? c.status },
    {
      key: 'nodes', header: 'Nodes / Services', render: c => c.resourceTypeKey === 'eks_cluster'
        ? `${nodegroups.filter(n => n.relationships?.clusterName === c.resourceName).length} node groups`
        : `${ecsServices.filter(s => s.relationships?.clusterArn === c.resourceId).length} services`,
    },
    { key: 'version', header: 'Version', render: c => (c.metadata?.version as string) ?? '—' },
  ];

  return (
    <div>
      <FilterBar title="EKS / ECS Clusters" breadcrumb={<Breadcrumb />} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Total Clusters" value={String(clusters.length)} />
        <StatCard label="EKS Clusters" value={String(clusters.filter(c => c.resourceTypeKey === 'eks_cluster').length)} />
        <StatCard label="ECS Clusters" value={String(clusters.filter(c => c.resourceTypeKey === 'ecs_cluster').length)} />
        <StatCard label="Node Groups / Services" value={String(nodegroups.length + ecsServices.length)} />
      </div>

      <DataTable columns={columns} rows={clusters} rowKey={c => c.id} onRowClick={setSelected} emptyMessage="No EKS or ECS clusters discovered yet." />

      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected?.resourceName ?? ''}>
        {selected && (
          <div className="flex flex-col gap-4 text-sm">
            <pre className="text-xs bg-slate-50 dark:bg-slate-800 rounded p-2 overflow-x-auto">{JSON.stringify(selected.metadata, null, 2)}</pre>
            {selected.resourceTypeKey === 'eks_cluster' && (
              <div>
                <h4 className="font-medium text-slate-700 dark:text-slate-200 mb-1.5">Node Groups</h4>
                <ul className="text-xs space-y-1">
                  {nodegroups.filter(n => n.relationships?.clusterName === selected.resourceName).map(n => (
                    <li key={n.id} className="text-slate-600 dark:text-slate-300">{n.resourceName} — {(n.metadata?.desiredSize as number) ?? '—'} nodes</li>
                  ))}
                </ul>
              </div>
            )}
            {selected.resourceTypeKey === 'ecs_cluster' && (
              <div>
                <h4 className="font-medium text-slate-700 dark:text-slate-200 mb-1.5">Services</h4>
                <ul className="text-xs space-y-1">
                  {ecsServices.filter(s => s.relationships?.clusterArn === selected.resourceId).map(s => (
                    <li key={s.id} className="text-slate-600 dark:text-slate-300">{s.resourceName} — {(s.metadata?.runningCount as number) ?? 0}/{(s.metadata?.desiredCount as number) ?? 0} running</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
