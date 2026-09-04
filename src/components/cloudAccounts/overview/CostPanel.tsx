import { useNavigate } from 'react-router-dom';
import { BarChart } from '../../charts/BarChart';
import { EmptyState } from '../../EmptyState';
import { money } from '../../../lib/format';
import { SectionCard, MiniStat } from './primitives';
import { costByProviderBars, type OverviewAggregate } from '../../../lib/cloudAccounts/overview';

/**
 * Spec §14 / §15 — cloud spend (gated on `cost.read`). Compose data only
 * exposes month-to-date + per-provider monthly cost, so this shows the
 * current figure, the provider split, and potential savings — and is honest
 * that GCP spend isn't ingested. Links into FinOps for the trend.
 */
export function CostPanel({
  agg,
  monthToDate,
  potentialSavings = 0,
}: {
  agg: OverviewAggregate;
  monthToDate: number | null;
  potentialSavings?: number;
}) {
  const navigate = useNavigate();
  const bars = costByProviderBars(agg);
  const total = monthToDate ?? agg.totals.monthlyCost;

  return (
    <SectionCard title="Cloud Cost" icon="cost" to="/cost-management" linkLabel="FinOps">
      {total === 0 && bars.length === 0 ? (
        <EmptyState icon="cost" title="No cost data" description="Connect cost ingestion (AWS CUR / Azure billing) to see spend here." />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-end gap-6">
            <MiniStat label="Month to date" value={money(total)} />
            {agg.perProvider.aws.total > 0 && <MiniStat label="AWS" value={money(agg.perProvider.aws.monthlyCost)} />}
            {agg.perProvider.azure.monthlyCost > 0 && <MiniStat label="Azure" value={money(agg.perProvider.azure.monthlyCost)} />}
          </div>
          {bars.length > 0 && (
            <BarChart data={bars} valueFormatter={(v) => money(v)} onBarClick={() => navigate('/cost-management')} />
          )}
          {agg.perProvider.gcp.total > 0 && (
            <p className="text-[11px] text-slate-400 dark:text-slate-500">GCP spend isn’t ingested in this build.</p>
          )}
          {potentialSavings > 0 && <MiniStat label="Potential savings / mo" value={money(potentialSavings)} tone="good" />}
        </div>
      )}
    </SectionCard>
  );
}
