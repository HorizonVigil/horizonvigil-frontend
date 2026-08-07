import type { CloudResource } from '../../lib/api';

// Provider-agnostic building blocks for Kubernetes resource detail panels —
// shared by the EKS/GKE/AKS consoles, since a Kubernetes Node/Pod/Deployment
// object has the same shape regardless of which control plane created it.
// Only the scanning/auth side of each console differs; the rendering here
// does not.

export function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="flex justify-between gap-4 py-1 text-xs border-b border-slate-100 dark:border-slate-800/60 last:border-0">
      <dt className="text-slate-400 dark:text-slate-500 shrink-0">{label}</dt>
      <dd className="text-slate-700 dark:text-slate-200 text-right break-all">{value}</dd>
    </div>
  );
}

export function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">{title}</h4>
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 px-3">{children}</div>
    </div>
  );
}

export function RelatedList({ title, items, empty, render }: { title: string; items: CloudResource[]; empty: string; render: (r: CloudResource) => React.ReactNode }) {
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

export function RelatedRow({ resource, onClick, right }: { resource: CloudResource; onClick: () => void; right?: React.ReactNode }) {
  return (
    <li>
      <button onClick={onClick} className="w-full flex items-center justify-between gap-2 text-left text-xs rounded-md px-2 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
        <span className="truncate">{resource.resource_name ?? resource.resource_id}</span>
        {right && <span className="shrink-0">{right}</span>}
      </button>
    </li>
  );
}

export function RawMetadata({ metadata }: { metadata?: Record<string, unknown> | null }) {
  if (!metadata || Object.keys(metadata).length === 0) return null;
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-slate-400 dark:text-slate-500 select-none">Raw metadata</summary>
      <pre className="mt-2 bg-slate-50 dark:bg-slate-800 rounded p-2 overflow-x-auto">{JSON.stringify(metadata, null, 2)}</pre>
    </details>
  );
}

export function bytesFromK8sQuantity(q?: string): string {
  // Kubernetes memory quantities are usually "Ki" suffixed (e.g. "16330000Ki") — real unit
  // conversion, not a guess, since that's the one suffix kubelet actually reports for memory.
  if (!q) return '—';
  const m = /^(\d+)Ki$/.exec(q);
  if (!m) return q;
  return `${(Number(m[1]) / (1024 * 1024)).toFixed(1)} GiB`;
}

export function formatAge(iso?: string): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

// A K8s "condition" is good/bad depending on its type — Ready=True is
// healthy, but so is MemoryPressure=False; there's no single "True is good"
// rule across condition types, so this maps each type's healthy polarity.
const NEGATIVE_CONDITION_TYPES = new Set(['MemoryPressure', 'DiskPressure', 'PIDPressure', 'NetworkUnavailable']);
export function conditionTone(type: string, status: string): 'good' | 'warning' | 'critical' | 'neutral' {
  const healthy = NEGATIVE_CONDITION_TYPES.has(type) ? status === 'False' : status === 'True';
  if (healthy) return 'good';
  return status === 'Unknown' ? 'neutral' : 'critical';
}

export function podHealthTone(p: CloudResource): 'good' | 'warning' | 'critical' | 'neutral' {
  const phase = p.state ?? p.status;
  if (phase === 'Running' || phase === 'Succeeded') return 'good';
  if (phase === 'Pending') return 'warning';
  if (phase === 'Failed') return 'critical';
  return 'neutral';
}

export interface K8sContainerState {
  running?: { startedAt?: string };
  waiting?: { reason?: string; message?: string };
  terminated?: { reason?: string; exitCode?: number; message?: string; startedAt?: string; finishedAt?: string };
}
export interface K8sContainerStatusUI { name: string; image: string; ready: boolean; restartCount: number; state?: K8sContainerState; lastState?: K8sContainerState }

const CRASH_REASONS = new Set(['CrashLoopBackOff', 'ImagePullBackOff', 'ErrImagePull', 'OOMKilled', 'Error']);
export function containerStateSummary(state?: K8sContainerState): { label: string; tone: 'good' | 'warning' | 'critical' | 'neutral'; detail?: string } {
  if (!state) return { label: 'Unknown', tone: 'neutral' };
  if (state.running) return { label: 'Running', tone: 'good' };
  if (state.waiting) {
    const reason = state.waiting.reason ?? 'Waiting';
    return { label: reason, tone: CRASH_REASONS.has(reason) ? 'critical' : 'warning', detail: state.waiting.message };
  }
  if (state.terminated) {
    const reason = state.terminated.reason ?? 'Terminated';
    const detail = state.terminated.message ?? (state.terminated.exitCode != null ? `exit code ${state.terminated.exitCode}` : undefined);
    return { label: reason, tone: state.terminated.exitCode === 0 ? 'neutral' : (CRASH_REASONS.has(reason) ? 'critical' : 'warning'), detail };
  }
  return { label: 'Unknown', tone: 'neutral' };
}

export interface K8sProbeUI {
  httpGet?: { path?: string; port?: number | string; scheme?: string };
  tcpSocket?: { port?: number | string };
  exec?: { command?: string[] };
  initialDelaySeconds?: number; periodSeconds?: number; timeoutSeconds?: number; failureThreshold?: number;
}
function describeProbe(p?: K8sProbeUI): string | undefined {
  if (!p) return undefined;
  const target = p.httpGet ? `HTTP GET ${p.httpGet.path ?? '/'}:${p.httpGet.port ?? ''}` : p.tcpSocket ? `TCP :${p.tcpSocket.port ?? ''}` : p.exec ? `exec [${(p.exec.command ?? []).join(' ')}]` : undefined;
  if (!target) return undefined;
  return `${target} — every ${p.periodSeconds ?? '?'}s, ${p.failureThreshold ?? '?'} failures to trip`;
}

export interface K8sEnvVarUI {
  name: string; value?: string;
  valueFrom?: { secretKeyRef?: { name: string; key: string }; configMapKeyRef?: { name: string; key: string }; fieldRef?: { fieldPath: string } };
}
function describeEnvVar(e: K8sEnvVarUI): string {
  if (e.value !== undefined) return e.value;
  if (e.valueFrom?.secretKeyRef) return `from secret ${e.valueFrom.secretKeyRef.name}.${e.valueFrom.secretKeyRef.key}`;
  if (e.valueFrom?.configMapKeyRef) return `from configmap ${e.valueFrom.configMapKeyRef.name}.${e.valueFrom.configMapKeyRef.key}`;
  if (e.valueFrom?.fieldRef) return `from ${e.valueFrom.fieldRef.fieldPath}`;
  return '—';
}

export interface K8sContainerSpecUI {
  name: string; image: string; imagePullPolicy?: string;
  command?: string[]; args?: string[];
  ports?: { containerPort: number; protocol?: string; name?: string }[];
  env?: K8sEnvVarUI[];
  resources?: { requests?: { cpu?: string; memory?: string }; limits?: { cpu?: string; memory?: string } };
  volumeMounts?: { name: string; mountPath: string; readOnly?: boolean }[];
  readinessProbe?: K8sProbeUI; livenessProbe?: K8sProbeUI; startupProbe?: K8sProbeUI;
}

export function ContainerSpecPanel({ container: c }: { container: K8sContainerSpecUI }) {
  const readiness = describeProbe(c.readinessProbe);
  const liveness = describeProbe(c.livenessProbe);
  return (
    <DetailSection title={`Container: ${c.name}`}>
      <DetailField label="Image" value={<span className="font-mono text-[11px]">{c.image}</span>} />
      <DetailField label="Pull Policy" value={c.imagePullPolicy} />
      {c.command && c.command.length > 0 && <DetailField label="Command" value={<span className="font-mono text-[11px]">{c.command.join(' ')}</span>} />}
      {c.args && c.args.length > 0 && <DetailField label="Args" value={<span className="font-mono text-[11px]">{c.args.join(' ')}</span>} />}
      {c.ports && c.ports.length > 0 && <DetailField label="Ports" value={c.ports.map(p => `${p.containerPort}/${p.protocol ?? 'TCP'}${p.name ? ` (${p.name})` : ''}`).join(', ')} />}
      <DetailField label="CPU (request / limit)" value={`${c.resources?.requests?.cpu ?? '—'} / ${c.resources?.limits?.cpu ?? '—'}`} />
      <DetailField label="Memory (request / limit)" value={`${c.resources?.requests?.memory ?? '—'} / ${c.resources?.limits?.memory ?? '—'}`} />
      {readiness && <DetailField label="Readiness Probe" value={readiness} />}
      {liveness && <DetailField label="Liveness Probe" value={liveness} />}
      {c.volumeMounts && c.volumeMounts.length > 0 && (
        <DetailField label="Volume Mounts" value={c.volumeMounts.map(v => `${v.name} → ${v.mountPath}${v.readOnly ? ' (ro)' : ''}`).join(', ')} />
      )}
      {c.env && c.env.length > 0 && (
        <div className="pt-1.5">
          <div className="text-[11px] text-slate-400 mb-1">Environment</div>
          {c.env.map(e => <DetailField key={e.name} label={e.name} value={<span className="font-mono text-[11px]">{describeEnvVar(e)}</span>} />)}
        </div>
      )}
    </DetailSection>
  );
}
