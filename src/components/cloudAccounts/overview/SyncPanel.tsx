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

/** Spec §19 — synchronisation health. Where the compose data has real numbers: synced / failed / permission-blocked, plus last discovery. */
export function SyncPanel({
  agg,
  dashes,
  onDrill,
}: {
  agg: OverviewAggregate;
  dashes: ProviderDashes;
  onDrill: () => void;
}) {
  const b = syncBuckets(agg, dashes);
  return (
    <SectionCard title="Synchronization Health" icon="refresh-cw" onLinkClick={onDrill} linkLabel="Sync Center">
      {b.total === 0 ? (
        <EmptyState icon="refresh-cw" title="Nothing to sync yet" />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            <MiniStat label="Synced" value={b.successful.toLocaleString()} tone="good" />
            {b.permissionIssues > 0 && <MiniStat label="Permission issue" value={b.permissionIssues.toLocaleString()} tone="warning" />}
            {b.failed > 0 && <MiniStat label="Failed" value={b.failed.toLocaleString()} tone="critical" />}
          </div>
          <StackedBar rows={syncStackRow(b)} height={14} onSegmentClick={onDrill} />
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Last successful discovery: {agg.lastDiscovery ? formatDate(agg.lastDiscovery) : 'never'}
          </p>
        </div>
      )}
    </SectionCard>
  );
}
