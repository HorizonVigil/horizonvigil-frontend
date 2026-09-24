import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart } from '../../charts/BarChart';
import { EmptyState } from '../../EmptyState';
import { money } from '../../../lib/format';
import { SectionCard, MiniStat } from './primitives';
import {
  costByProviderBars,
  type OverviewAggregate,
} from '../../../lib/cloudAccounts/overview';

export interface CostPanelProps {
  agg: OverviewAggregate;
  monthToDate: number | null;
  potentialSavings?: number;
}

const FINOPS_ROUTE = '/finops';

function normalizeNonNegative(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 0;
  }

  return value;
}

function formatMoney(value: number): string {
  try {
    return money(value);
  } catch {
    return value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
}

/**
 * Spec §14 / §15 — cloud spend panel.
 *
 * Cost data is displayed only from values supplied by the overview aggregate
 * and month-to-date input. This component does not infer missing provider
 * costs or fabricate billing data.
 *
 * Current product limitation:
 * - GCP spend is not ingested by this build.
 * - The panel therefore explicitly communicates that limitation when GCP
 *   resources exist but GCP spend is unavailable.
 *
 * Navigation:
 * - The panel's SectionCard links to FinOps.
 * - Clicking a provider bar also navigates to FinOps.
 */
export function CostPanel({
  agg,
  monthToDate,
  potentialSavings = 0,
}: CostPanelProps) {
  const navigate = useNavigate();

  const bars = useMemo(() => {
    return costByProviderBars(agg);
  }, [agg]);

  const cost = useMemo(() => {
    const aggregateMonthlyCost = normalizeNonNegative(
      agg?.totals?.monthlyCost,
    );

    const suppliedMonthToDate =
      monthToDate == null
        ? null
        : normalizeNonNegative(monthToDate);

    return suppliedMonthToDate ?? aggregateMonthlyCost;
  }, [agg, monthToDate]);

  const savings = useMemo(
    () => normalizeNonNegative(potentialSavings),
    [potentialSavings],
  );

  const aws = useMemo(
    () => ({
      total: normalizeNonNegative(agg?.perProvider?.aws?.total),
      monthlyCost: normalizeNonNegative(
        agg?.perProvider?.aws?.monthlyCost,
      ),
    }),
    [agg],
  );

  const azure = useMemo(
    () => ({
      total: normalizeNonNegative(agg?.perProvider?.azure?.total),
      monthlyCost: normalizeNonNegative(
        agg?.perProvider?.azure?.monthlyCost,
      ),
    }),
    [agg],
  );

  const gcpResourceCount = useMemo(
    () => normalizeNonNegative(agg?.perProvider?.gcp?.total),
    [agg],
  );

  const hasCostData = cost > 0 || bars.length > 0;

  const hasAwsCost = aws.total > 0 || aws.monthlyCost > 0;
  const hasAzureCost = azure.total > 0 || azure.monthlyCost > 0;
  const hasGcpResources = gcpResourceCount > 0;

  const handleBarClick = useCallback(() => {
    navigate(FINOPS_ROUTE);
  }, [navigate]);

  if (!hasCostData) {
    return (
      <SectionCard
        title="Cloud Cost"
        icon="cost"
        to={FINOPS_ROUTE}
        linkLabel="FinOps"
      >
        <EmptyState
          icon="cost"
          title="No cost data"
          description="Connect cost ingestion (AWS CUR / Azure billing) to see spend here."
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Cloud Cost"
      icon="cost"
      to={FINOPS_ROUTE}
      linkLabel="FinOps"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <MiniStat
            label="Month to date"
            value={formatMoney(cost)}
          />

          {hasAwsCost ? (
            <MiniStat
              label="AWS"
              value={formatMoney(aws.monthlyCost)}
            />
          ) : null}

          {hasAzureCost ? (
            <MiniStat
              label="Azure"
              value={formatMoney(azure.monthlyCost)}
            />
          ) : null}
        </div>

        {bars.length > 0 ? (
          <BarChart
            data={bars}
            valueFormatter={formatMoney}
            onBarClick={handleBarClick}
          />
        ) : null}

        {hasGcpResources ? (
          <p className="text-[11px] leading-4 text-slate-400 dark:text-slate-500">
            GCP resources are present, but GCP spend isn’t ingested in this
            build.
          </p>
        ) : null}

        {savings > 0 ? (
          <MiniStat
            label="Potential savings / mo"
            value={formatMoney(savings)}
            tone="good"
          />
        ) : null}
      </div>
    </SectionCard>
  );
}