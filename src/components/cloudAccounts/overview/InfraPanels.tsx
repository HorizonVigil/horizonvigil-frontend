import { useMemo } from 'react';
import { EmptyState } from '../../EmptyState';
import { SectionCard, MeterRow, MiniStat } from './primitives';
import {
  signalHealthRows,
  type ProviderHealth,
} from '../../../lib/cloudAccounts/overview';

export interface ConnectivityHealthProps {
  health: ProviderHealth;
}

export interface ContainerTypeSummary {
  key: string;
  displayName: string;
  count: number;
}

export interface ContainersDash {
  total?: number;
  ecsCount?: number;
  eksCount?: number;
  types?: ContainerTypeSummary[];
}

export interface KubernetesSummaryProps {
  containers: ContainersDash | null;
}

const HEALTH_ROUTE = '/cloud-accounts?tab=Health';
const CONTAINERS_ROUTE = '/resources/Containers';
const MAX_VISIBLE_CONTAINER_TYPES = 6;

function normalizeNonNegative(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    return 0;
  }

  return value;
}

function normalizePercent(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value)
  ) {
    return 0;
  }

  return Math.min(100, Math.max(0, value));
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isContainerType(
  value: unknown,
): value is ContainerTypeSummary {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const type = value as Partial<ContainerTypeSummary>;

  return (
    typeof type.key === 'string' ||
    typeof type.displayName === 'string'
  );
}

function getContainerTypeKey(
  type: ContainerTypeSummary,
  index: number,
): string {
  const key = normalizeText(type.key);

  return key
    ? `container-type-${key}`
    : `container-type-fallback-${index}`;
}

function getContainerTypeLabel(
  type: ContainerTypeSummary,
): string {
  return (
    normalizeText(type.displayName) ||
    normalizeText(type.key) ||
    'Unknown type'
  );
}

/**
 * Spec §17 — connectivity and discovery health.
 *
 * The aggregation layer provides the actual health signal rows. This
 * component intentionally does not infer infrastructure health from
 * incomplete data.
 *
 * The displayed percentage represents the share of environments for which
 * each connectivity/discovery signal is healthy.
 */
export function ConnectivityHealth({
  health,
}: ConnectivityHealthProps) {
  const rows = useMemo(
    () => signalHealthRows(health),
    [health],
  );

  return (
    <SectionCard
      title="Connectivity & Discovery Health"
      icon="activity"
      to={HEALTH_ROUTE}
      linkLabel="Health"
    >
      {rows.length === 0 ? (
        <EmptyState
          icon="activity"
          title="No health signals yet"
          description="Validate a connection to populate this."
        />
      ) : (
        <div
          className="flex flex-col gap-2.5"
          aria-label="Connectivity and discovery health signals"
        >
          {rows.map((row, index) => {
            const label =
              normalizeText(row.label) ||
              `Health signal ${index + 1}`;

            const okCount = normalizeNonNegative(row.okCount);
            const total = normalizeNonNegative(row.total);
            const percent = normalizePercent(row.okPercent);

            return (
              <MeterRow
                key={
                  normalizeText(row.key)
                    ? `health-${normalizeText(row.key)}`
                    : `health-fallback-${index}`
                }
                label={label}
                percent={percent}
                caption={`${okCount.toLocaleString()}/${total.toLocaleString()}`}
              />
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

/**
 * Spec §18 — Kubernetes / container summary.
 *
 * This component displays discovered container resources only. It does not
 * claim that a provider has container workloads when the aggregation layer
 * reports no discovered resources.
 *
 * The current summary exposes EKS and ECS counts. Cloud Run may appear in
 * the resource-type breakdown when supplied by the aggregation layer.
 */
export function KubernetesSummary({
  containers,
}: KubernetesSummaryProps) {
  const normalized = useMemo(() => {
    if (!containers) {
      return {
        total: 0,
        eks: 0,
        ecs: 0,
        types: [] as ContainerTypeSummary[],
      };
    }

    const total = normalizeNonNegative(containers.total);
    const eks = normalizeNonNegative(containers.eksCount);
    const ecs = normalizeNonNegative(containers.ecsCount);

    const types = Array.isArray(containers.types)
      ? containers.types.filter(isContainerType)
      : [];

    return {
      total,
      eks,
      ecs,
      types,
    };
  }, [containers]);

  const { total, eks, ecs, types } = normalized;

  return (
    <SectionCard
      title="Kubernetes & Containers"
      icon="containers"
      to={CONTAINERS_ROUTE}
      linkLabel="Open"
    >
      {total === 0 ? (
        <EmptyState
          icon="containers"
          title="No container workloads discovered"
          description="EKS / ECS / Cloud Run resources show up here once discovered."
        />
      ) : (
        <div className="flex min-w-0 flex-col">
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            <MiniStat
              label="Clusters"
              value={(eks + ecs).toLocaleString()}
            />

            <MiniStat
              label="EKS"
              value={eks.toLocaleString()}
            />

            <MiniStat
              label="ECS"
              value={ecs.toLocaleString()}
            />

            <MiniStat
              label="Total resources"
              value={total.toLocaleString()}
            />
          </div>

          {types.length > 0 ? (
            <ul
              className="mt-3 flex flex-wrap gap-1.5"
              aria-label="Container resource types"
            >
              {types
                .slice(0, MAX_VISIBLE_CONTAINER_TYPES)
                .map((type, index) => {
                  const label = getContainerTypeLabel(type);
                  const count = normalizeNonNegative(type.count);

                  return (
                    <li
                      key={getContainerTypeKey(type, index)}
                      title={`${label}: ${count.toLocaleString()}`}
                      className={[
                        'rounded-full border px-2 py-0.5',
                        'text-[11px]',
                        'border-slate-200 text-slate-500',
                        'dark:border-slate-700 dark:text-slate-400',
                      ].join(' ')}
                    >
                      {label}
                      <span aria-hidden="true"> · </span>
                      <span className="tabular-nums">
                        {count.toLocaleString()}
                      </span>
                    </li>
                  );
                })}
            </ul>
          ) : null}
        </div>
      )}
    </SectionCard>
  );
}