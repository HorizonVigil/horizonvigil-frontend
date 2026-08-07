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
import {
  DetailField, DetailSection, RelatedList, RelatedRow, RawMetadata, ContainerSpecPanel,
  bytesFromK8sQuantity, formatAge, conditionTone, podHealthTone, containerStateSummary,
  type K8sContainerSpecUI, type K8sContainerStatusUI,
} from '../components/k8s/DetailPrimitives';

// AWS's Kubernetes/container offering — EKS (Kubernetes-native) plus ECS
// (AWS's own, non-Kubernetes container orchestrator, kept on this console
// since both are AWS-only container platforms discovered via the same
// connection). Split out from the old unified Clusters.tsx so this page
// only ever shows AWS data — see the multi-cloud K8s consoles plan.
const TABS = ['EKS Clusters', 'Nodes', 'Namespaces', 'Deployments', 'Pods', 'Helm Releases', 'ECS Clusters', 'ECS Services', 'ECS Tasks'] as const;
type Tab = typeof TABS[number];

function costCell(c: CloudResource) {
  if (c.cost_monthly == null) return <span className="text-slate-400 text-xs">no cost data</span>;
  return <span className="tabular-nums font-medium">${c.cost_monthly.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>;
}

export function EksConsole() {
  const { account, refreshToken } = useFilters();
  const [tab, setTab] = useTabParam<Tab>(TABS, 'EKS Clusters');

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
  const [helmReleaseReason, setHelmReleaseReason] = useState('Not built in this pass.');
  const [selected, setSelected] = useState<CloudResource | null>(null);

  const load = useCallback(async () => {
    const connectionId = account === 'all' ? undefined : account;
    const [eksRes, ecsClusterRes, nodesRes, svcRes, taskRes, eksDeployRes, eksPodRes, namespaces, helmReleases, nodegroupsRes] = await Promise.all([
      api.getEksClusters({ connectionId, limit: 200 }),
      api.getEcsClusters({ connectionId, limit: 200 }),
      api.getEksNodes({ connectionId, limit: 500 }),
      api.getEcsServices({ connectionId, limit: 500 }),
      api.getEcsTasks({ connectionId, limit: 500 }),
      api.getEksDeployments({ connectionId, limit: 500 }),
      api.getEksPods({ connectionId, limit: 500 }),
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
    setEksNamespaces(namespaces.items);
    setEksNodegroups(nodegroupsRes.items);
    setHelmReleaseReason(helmReleases.reason);
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
    { key: 'internalIp', header: 'Internal IP', render: n => (n.metadata?.internalIp as string) ?? '—' },
    { key: 'kubeletVersion', header: 'Kubelet', render: n => (n.metadata?.kubeletVersion as string) ?? '—' },
    { key: 'zone', header: 'Zone', render: n => (n.metadata?.zone as string) ?? n.region ?? '—', sortValue: n => n.region ?? '' },
    { key: 'status', header: 'Status', render: n => <Badge tone={n.state === 'Ready' ? 'good' : 'critical'}>{n.state ?? n.status}</Badge>, sortValue: n => n.state ?? n.status },
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

  const namespaceColumns: Column<CloudResource>[] = [
    { key: 'name', header: 'Namespace', render: n => n.resource_name ?? n.resource_id, sortValue: n => n.resource_name ?? '' },
    { key: 'cluster', header: 'Cluster', render: n => (n.relationships?.clusterName as string) ?? '—', sortValue: n => (n.relationships?.clusterName as string) ?? '' },
    { key: 'region', header: 'Region', render: n => n.region ?? '—', sortValue: n => n.region ?? '' },
    { key: 'status', header: 'Status', render: n => <Badge>{n.state ?? n.status}</Badge>, sortValue: n => n.state ?? n.status },
  ];

  const totalClusters = ecsClusters.length + eksClusters.length;

  return (
    <div>
      <FilterBar title="AWS EKS Console" breadcrumb={<Breadcrumb />} />

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-5">
        <StatCard label="Total Clusters" value={String(totalClusters)} />
        <StatCard label="EKS Clusters" value={String(eksClusters.length)} />
        <StatCard label="Nodes" value={String(eksNodes.length)} />
        <StatCard label="ECS Clusters" value={String(ecsClusters.length)} />
        <StatCard label="Deployments" value={String(eksDeployments.length)} />
        <StatCard label="Pods" value={String(eksPods.length)} />
      </div>

      <div className="flex gap-1 text-sm flex-wrap mb-4">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-md whitespace-nowrap ${tab === t ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
            {t}
          </button>
        ))}
      </div>

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
      {tab === 'Nodes' && (
        <DataTable columns={nodeColumns} rows={eksNodes} rowKey={n => n.id} onRowClick={setSelected} emptyMessage="No EKS nodes discovered yet." />
      )}
      {tab === 'Namespaces' && (
        <>
          <p className="text-xs text-slate-400 mb-3">A cluster only appears here if its connection's identity has been granted Kubernetes RBAC access (aws-auth ConfigMap or an EKS access entry) — a cluster without that mapping shows zero namespaces, not an error.</p>
          <DataTable columns={namespaceColumns} rows={eksNamespaces} rowKey={n => n.id} onRowClick={setSelected} emptyMessage="No namespaces discovered yet." />
        </>
      )}
      {tab === 'Deployments' && (
        <DataTable columns={deploymentColumns} rows={eksDeployments} rowKey={d => d.id} onRowClick={setSelected} emptyMessage="No deployments discovered yet." />
      )}
      {tab === 'Pods' && (
        <DataTable columns={podColumns} rows={eksPods} rowKey={p => p.id} onRowClick={setSelected} emptyMessage="No pods discovered yet." />
      )}
      {tab === 'Helm Releases' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-400">{helmReleaseReason}</p>
        </div>
      )}
      {tab === 'ECS Clusters' && (
        <DataTable columns={ecsClusterColumns} rows={ecsClusters} rowKey={c => c.id} onRowClick={setSelected} emptyMessage="No ECS clusters discovered yet." />
      )}
      {tab === 'ECS Services' && (
        <DataTable columns={ecsServiceColumns} rows={ecsServices} rowKey={s => s.id} onRowClick={setSelected} emptyMessage="No ECS services discovered yet." />
      )}
      {tab === 'ECS Tasks' && (
        <DataTable columns={ecsTaskColumns} rows={ecsTasks} rowKey={t => t.id} onRowClick={setSelected} emptyMessage="No ECS tasks discovered yet." />
      )}

      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected?.resource_name ?? ''}>
        {selected && (
          <ResourceDetail
            resource={selected}
            onNavigate={setSelected}
            eksClusters={eksClusters} eksNodes={eksNodes} eksNodegroups={eksNodegroups}
            eksNamespaces={eksNamespaces} eksDeployments={eksDeployments} eksPods={eksPods}
            ecsServices={ecsServices}
          />
        )}
      </Drawer>
    </div>
  );
}

// ── Detail panel ─────────────────────────────────────────────────────────
// Every relationship below is derived from data already loaded on this page
// (no extra API calls), matched the same way the K8s objects themselves
// relate: pod.metadata.namespace/nodeName are literal Kubernetes fields, not
// something CloudOps360 invented. Deployment -> Pod matching is the one
// heuristic (K8s pods are owned by a ReplicaSet, which is owned by the
// Deployment; no ReplicaSet scanner exists yet) -- matched by namespace +
// the standard "<deployment>-<hash>" pod-name prefix Kubernetes itself
// generates, not exact but reliable in practice and labeled as such below.

interface ResourceDetailProps {
  resource: CloudResource;
  onNavigate: (r: CloudResource) => void;
  eksClusters: CloudResource[]; eksNodes: CloudResource[]; eksNodegroups: CloudResource[];
  eksNamespaces: CloudResource[]; eksDeployments: CloudResource[]; eksPods: CloudResource[];
  ecsServices: CloudResource[];
}

function ResourceDetail({ resource: r, onNavigate, eksClusters, eksNodes, eksNodegroups, eksNamespaces, eksDeployments, eksPods, ecsServices }: ResourceDetailProps) {
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
    const taints = (m.taints as { key: string; value?: string; effect: string }[] | undefined) ?? [];
    const conditions = (m.conditions as { type: string; status: string; reason?: string; message?: string }[] | undefined) ?? [];
    const labels = r.tags ?? {};
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
          <DetailField label="Age" value={formatAge(m.createdAt as string)} />
          <DetailField label="Schedulable" value={m.unschedulable ? <Badge tone="warning">Cordoned</Badge> : 'Yes'} />
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
        {conditions.length > 0 && (
          <DetailSection title="Conditions">
            {conditions.map(c => (
              <DetailField key={c.type} label={c.type} value={
                <span className="inline-flex items-center gap-1.5">
                  <Badge tone={conditionTone(c.type, c.status)}>{c.status}</Badge>
                  {c.reason && <span className="text-slate-400">{c.reason}</span>}
                </span>
              } />
            ))}
          </DetailSection>
        )}
        {taints.length > 0 && (
          <DetailSection title="Taints">
            {taints.map((t, i) => <DetailField key={i} label={t.key} value={<span className="font-mono text-[11px]">{t.value ? `${t.value}:` : ''}{t.effect}</span>} />)}
          </DetailSection>
        )}
        {Object.keys(labels).length > 0 && (
          <DetailSection title="Labels">
            {Object.entries(labels).map(([k, v]) => <DetailField key={k} label={k} value={<span className="font-mono text-[11px]">{v}</span>} />)}
          </DetailSection>
        )}
        <RelatedList title="Pods on this node" items={podsHere} empty="No pods scheduled here." render={p => (
          <RelatedRow key={p.id} resource={p} onClick={() => onNavigate(p)} right={<Badge tone={podHealthTone(p)}>{p.state ?? p.status}</Badge>} />
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
    const containers = (m.containers as K8sContainerSpecUI[] | undefined) ?? [];
    const strategy = m.strategy as { type?: string; rollingUpdate?: { maxSurge?: string | number; maxUnavailable?: string | number } } | undefined;
    const conditions = (m.conditions as { type: string; status: string; reason?: string; message?: string }[] | undefined) ?? [];
    const unavailable = (m.unavailableReplicas as number) ?? 0;
    return (
      <div className="flex flex-col gap-4 text-sm">
        <DetailSection title="Overview">
          {clusterLink}
          <DetailField label="Namespace" value={namespaceObj ? <button onClick={() => onNavigate(namespaceObj)} className="text-brand-600 dark:text-brand-400 hover:underline">{namespace}</button> : namespace} />
          <DetailField label="Replicas (ready / desired)" value={
            <span className="inline-flex items-center gap-1.5">
              {`${(m.readyReplicas as number) ?? 0} / ${(m.replicas as number) ?? 0}`}
              {unavailable > 0 && <Badge tone="critical">{unavailable} unavailable</Badge>}
            </span>
          } />
          <DetailField label="Updated / Available" value={`${(m.updatedReplicas as number) ?? 0} / ${(m.availableReplicas as number) ?? 0}`} />
          <DetailField label="Strategy" value={strategy?.type} />
          {strategy?.rollingUpdate && <DetailField label="Rolling Update" value={`maxSurge ${strategy.rollingUpdate.maxSurge ?? '—'}, maxUnavailable ${strategy.rollingUpdate.maxUnavailable ?? '—'}`} />}
          <DetailField label="Service Account" value={m.serviceAccountName as string} />
          <DetailField label="Created" value={m.createdAt ? new Date(m.createdAt as string).toLocaleString() : undefined} />
        </DetailSection>
        {conditions.length > 0 && (
          <DetailSection title="Conditions">
            {conditions.map(c => (
              <DetailField key={c.type} label={c.type} value={
                <span className="inline-flex items-center gap-1.5">
                  <Badge tone={conditionTone(c.type, c.status)}>{c.status}</Badge>
                  {c.reason && <span className="text-slate-400">{c.reason}</span>}
                </span>
              } />
            ))}
          </DetailSection>
        )}
        {containers.map((c, i) => <ContainerSpecPanel key={i} container={c} />)}
        <RelatedList title="Pods" items={podsHere} empty="No pods matched by name — this is a name-prefix heuristic (no ReplicaSet scanner yet), so a pod from a very old rollout may not match." render={p => (
          <RelatedRow key={p.id} resource={p} onClick={() => onNavigate(p)} right={<Badge tone={podHealthTone(p)}>{p.state ?? p.status}</Badge>} />
        )} />
      </div>
    );
  }

  if (r.resource_type_key === 'eks_pod') {
    const namespace = m.namespace as string | undefined;
    const node = eksNodes.find(n => n.resource_name === m.nodeName && n.relationships?.clusterName === clusterName);
    const namespaceObj = eksNamespaces.find(n => n.resource_name === namespace && n.relationships?.clusterName === clusterName);
    const containerStatuses = (m.containerStatuses as K8sContainerStatusUI[] | undefined) ?? [];
    const conditions = (m.conditions as { type: string; status: string; reason?: string; message?: string }[] | undefined) ?? [];
    const failing = containerStatuses.filter(cs => containerStateSummary(cs.state).tone === 'critical');
    return (
      <div className="flex flex-col gap-4 text-sm">
        {(m.podReason || failing.length > 0) && (
          <div className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-900/10 px-3 py-2 text-xs text-red-800 dark:text-red-300 flex flex-col gap-1">
            {Boolean(m.podReason) && <div>⚠ Pod: {m.podReason as string}{m.podMessage ? ` — ${m.podMessage}` : ''}</div>}
            {failing.map(cs => {
              const s = containerStateSummary(cs.state);
              return <div key={cs.name}>⚠ Container "{cs.name}": {s.label}{s.detail ? ` — ${s.detail}` : ''} ({cs.restartCount} restart{cs.restartCount === 1 ? '' : 's'})</div>;
            })}
          </div>
        )}
        <DetailSection title="Overview">
          <DetailField label="Status" value={<Badge tone={podHealthTone(r)}>{r.state ?? r.status}</Badge>} />
          {clusterLink}
          <DetailField label="Namespace" value={namespaceObj ? <button onClick={() => onNavigate(namespaceObj)} className="text-brand-600 dark:text-brand-400 hover:underline">{namespace}</button> : namespace} />
          <DetailField label="Node" value={node ? <button onClick={() => onNavigate(node)} className="text-brand-600 dark:text-brand-400 hover:underline">{m.nodeName as string}</button> : (m.nodeName as string)} />
          <DetailField label="QoS Class" value={m.qosClass as string} />
          <DetailField label="Pod IP" value={m.podIP as string} />
          <DetailField label="Host IP" value={m.hostIP as string} />
          <DetailField label="Restarts" value={m.restartCount as number} />
          <DetailField label="Age" value={formatAge(m.createdAt as string)} />
        </DetailSection>
        {containerStatuses.length > 0 && (
          <DetailSection title="Containers">
            {containerStatuses.map(cs => {
              const s = containerStateSummary(cs.state);
              return (
                <DetailField key={cs.name} label={cs.name} value={
                  <span className="inline-flex items-center gap-1.5">
                    <Badge tone={s.tone}>{s.label}</Badge>
                    {cs.restartCount > 0 && <span className="text-slate-400">{cs.restartCount}× restart</span>}
                  </span>
                } />
              );
            })}
          </DetailSection>
        )}
        {conditions.length > 0 && (
          <DetailSection title="Conditions">
            {conditions.map(c => (
              <DetailField key={c.type} label={c.type} value={
                <span className="inline-flex items-center gap-1.5">
                  <Badge tone={conditionTone(c.type, c.status)}>{c.status}</Badge>
                  {c.reason && <span className="text-slate-400">{c.reason}</span>}
                </span>
              } />
            ))}
          </DetailSection>
        )}
        {Array.isArray(m.images) && (m.images as string[]).length > 0 && (
          <DetailSection title="Images">
            {(m.images as string[]).map((img, i) => <DetailField key={i} label={containerStatuses[i]?.name ?? `Container ${i + 1}`} value={<span className="font-mono text-[11px]">{img}</span>} />)}
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

  // Anything else (ECS services/tasks, addons, fargate profiles, identity
  // provider configs) — no dedicated panel built yet, honest raw view.
  return (
    <div className="flex flex-col gap-4 text-sm">
      <RawMetadata metadata={r.metadata} />
    </div>
  );
}
