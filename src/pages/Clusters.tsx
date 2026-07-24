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
  const [clusterCosts, setClusterCosts] = useState<Map<string, { instanceCount: number; estimatedMonthlyCost: number }>>(new Map());
  const [unallocatedInstances, setUnallocatedInstances] = useState(0);

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

  // Cluster-level cost is a live, per-account estimate (proportional to
  // node count against real synced EC2 cost) — only meaningful for one
  // specific connection, same reason Cost Management's tag showback is.
  useEffect(() => {
    setClusterCosts(new Map());
    setUnallocatedInstances(0);
    if (account === 'all') return;
    void api.getClusterCosts(account).then(res => {
      if (!res.ok) return;
      setClusterCosts(new Map(res.clusters.map(c => [c.clusterName, { instanceCount: c.instanceCount, estimatedMonthlyCost: c.estimatedMonthlyCost }])));
      setUnallocatedInstances(res.unallocatedInstanceCount);
    });
  }, [account, refreshToken]);

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
    {
      key: 'cost', header: 'Est. Monthly Cost', render: c => {
        if (c.resourceTypeKey !== 'eks_cluster') return <span className="text-slate-400 text-xs">not available for ECS</span>;
        if (account === 'all') return <span className="text-slate-400 text-xs">select an account</span>;
        const cost = clusterCosts.get(c.resourceName ?? '');
        if (!cost) return <span className="text-slate-400 text-xs">no data</span>;
        return <span className="tabular-nums font-medium">${cost.estimatedMonthlyCost.toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-slate-400 font-normal">({cost.instanceCount} nodes)</span></span>;
      },
      sortValue: c => clusterCosts.get(c.resourceName ?? '')?.estimatedMonthlyCost ?? 0,
    },
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

      <p className="text-xs text-slate-400 mb-3">
        {account === 'all'
          ? 'Select a specific AWS account in the top filter bar to see estimated cost per EKS cluster.'
          : 'EKS cost is an estimate: real, synced EC2 compute cost for this account is split across clusters in proportion to each cluster\'s node count (via the kubernetes.io/cluster tag AWS applies automatically) — cluster-level granularity only, as noted in the build spec; namespace/workload detail would need an in-cluster collector. ECS cost-per-cluster isn\'t available — ECS has no equivalent standardized cluster tag to allocate by.'}
        {unallocatedInstances > 0 && account !== 'all' && ` ${unallocatedInstances} EC2 instance${unallocatedInstances === 1 ? '' : 's'} in this account aren't part of any EKS cluster and are excluded from these estimates.`}
      </p>

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
