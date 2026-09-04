import { EmptyState } from '../../EmptyState';
import { SectionCard, MeterRow, MiniStat } from './primitives';
import { signalHealthRows, type ProviderHealth } from '../../../lib/cloudAccounts/overview';

/**
 * Spec §17, adapted to compose data — real "Compute/DB/Network %" isn't
 * available without the aggregation API, so this shows the share of
 * environments where each connectivity/discovery signal is healthy. It's the
 * honest, actionable version of "infrastructure health".
 */
export function ConnectivityHealth({ health }: { health: ProviderHealth }) {
  const rows = signalHealthRows(health);
  return (
    <SectionCard title="Connectivity & Discovery Health" icon="activity" to="/cloud-accounts?tab=Health" linkLabel="Health">
      {rows.length === 0 ? (
        <EmptyState icon="activity" title="No health signals yet" description="Validate a connection to populate this." />
      ) : (
        <div className="flex flex-col gap-2.5">
          {rows.map((r) => (
            <MeterRow key={r.key} label={r.label} percent={r.okPercent} caption={`${r.okCount}/${r.total}`} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}

export interface ContainersDash {
  total?: number;
  ecsCount?: number;
  eksCount?: number;
  types?: { key: string; displayName: string; count: number }[];
}

const n = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : 0);

/**
 * Spec §18 — Kubernetes / container summary. Only rendered when the user has
 * `kubernetes.read` AND containers have actually been discovered.
 */
export function KubernetesSummary({ containers }: { containers: ContainersDash | null }) {
  const total = n(containers?.total);
  const eks = n(containers?.eksCount);
  const ecs = n(containers?.ecsCount);
  const types = Array.isArray(containers?.types) ? containers!.types.filter((t) => t && typeof t === 'object') : [];

  if (!containers || total === 0) {
    return (
      <SectionCard title="Kubernetes & Containers" icon="containers" to="/containers" linkLabel="Open">
        <EmptyState icon="containers" title="No container workloads discovered" description="EKS / ECS / Cloud Run resources show up here once discovered." />
      </SectionCard>
    );
  }
  return (
    <SectionCard title="Kubernetes & Containers" icon="containers" to="/containers" linkLabel="Open">
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <MiniStat label="Clusters" value={(eks + ecs).toLocaleString()} />
        <MiniStat label="EKS" value={eks.toLocaleString()} />
        <MiniStat label="ECS" value={ecs.toLocaleString()} />
        <MiniStat label="Total resources" value={total.toLocaleString()} />
      </div>
      {types.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {types.slice(0, 6).map((t) => (
            <li key={t.key} className="text-[11px] rounded-full border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-slate-500 dark:text-slate-400">
              {t.displayName} · {n(t.count).toLocaleString()}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
