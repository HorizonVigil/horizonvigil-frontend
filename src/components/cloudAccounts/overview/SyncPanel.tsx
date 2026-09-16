import { useCallback, useMemo } from 'react';

import { StackedBar } from '../../charts/StackedBar';
import { EmptyState } from '../../EmptyState';
import { formatDate } from '../../../lib/format';

import { SectionCard, MiniStat } from './primitives';

import {
  syncBuckets,
  syncStackRow,
  type OverviewAggregate,
  type ProviderDashes,
} from '../../../lib/cloudAccounts/overview';

interface SyncPanelProps {
  agg: OverviewAggregate;
  dashes: ProviderDashes;
  onDrill: () => void;
}

interface SyncBucketView {
  total: number;
  successful: number;
  permissionIssues: number;
  failed: number;
}

function normalizeNonNegativeNumber(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value)
  ) {
    return 0;
  }

  return Math.max(0, value);
}

function normalizeSyncBuckets(
  buckets: ReturnType<typeof syncBuckets>,
): SyncBucketView {
  return {
    total: normalizeNonNegativeNumber(buckets?.total),
    successful: normalizeNonNegativeNumber(
      buckets?.successful,
    ),
    permissionIssues: normalizeNonNegativeNumber(
      buckets?.permissionIssues,
    ),
    failed: normalizeNonNegativeNumber(
      buckets?.failed,
    ),
  };
}

function getLastDiscoveryLabel(
  value: unknown,
): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0
  ) {
    return 'Never';
  }

  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return 'Unavailable';
  }

  return formatDate(value);
}

/**
 * Synchronization health summary.
 *
 * Displays the synchronization state returned by the overview domain layer:
 * - successful/synced
 * - permission-blocked
 * - failed
 * - last successful discovery
 *
 * Important:
 * `agg`/`dashes` are assumed to have already passed through the application's
 * authorization and data-fetching layers. This component performs only
 * presentation-level defensive normalization; it does not implement access
 * control or infer missing cloud state.
 */
export function SyncPanel({
  agg,
  dashes,
  onDrill,
}: SyncPanelProps) {
  const buckets = useMemo(
    () => normalizeSyncBuckets(syncBuckets(agg, dashes)),
    [agg, dashes],
  );

  const lastDiscoveryLabel = useMemo(
    () => getLastDiscoveryLabel(agg?.lastDiscovery),
    [agg?.lastDiscovery],
  );

  const handleDrill = useCallback(() => {
    onDrill();
  }, [onDrill]);

  const stackRows = useMemo(
    () => syncStackRow(buckets),
    [buckets],
  );

  /*
   * A total of zero means the synchronization domain reports no sync targets
   * for this scope. It does NOT mean synchronization is healthy.
   *
   * This distinction is important:
   * - "Nothing to sync" = there are no sync targets.
   * - "Synced" = sync targets exist and have completed successfully.
   */
  if (buckets.total === 0) {
    return (
      <SectionCard
        title="Synchronization Health"
        icon="refresh-cw"
        onLinkClick={handleDrill}
        linkLabel="Sync Center"
      >
        <EmptyState
          icon="refresh-cw"
          title="Nothing to sync yet"
          description="No synchronization targets are currently available for this scope."
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Synchronization Health"
      icon="refresh-cw"
      onLinkClick={handleDrill}
      linkLabel="Sync Center"
    >
      <div className="flex flex-col gap-4">
        <div
          className="flex flex-wrap gap-x-8 gap-y-3"
          aria-label="Synchronization summary"
        >
          <MiniStat
            label="Synced"
            value={buckets.successful.toLocaleString()}
            tone="good"
          />

          {buckets.permissionIssues > 0 && (
            <MiniStat
              label="Permission issue"
              value={buckets.permissionIssues.toLocaleString()}
              tone="warning"
            />
          )}

          {buckets.failed > 0 && (
            <MiniStat
              label="Failed"
              value={buckets.failed.toLocaleString()}
              tone="critical"
            />
          )}
        </div>

        {stackRows.length > 0 ? (
          <div
            className="min-w-0"
            aria-label="Synchronization status breakdown"
          >
            <StackedBar
              rows={stackRows}
              height={14}
              onSegmentClick={handleDrill}
            />
          </div>
        ) : (
          <p
            role="status"
            className="text-xs text-slate-500 dark:text-slate-400"
          >
            Synchronization status breakdown is not available.
          </p>
        )}

        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          <span className="sr-only">
            Synchronization information.{' '}
          </span>
          Last successful discovery:{' '}
          <time>
            {lastDiscoveryLabel}
          </time>
        </p>
      </div>
    </SectionCard>
  );
}