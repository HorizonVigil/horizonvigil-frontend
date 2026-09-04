import { useNavigate } from 'react-router-dom';
import { BarChart } from '../../charts/BarChart';
import { LineChart } from '../../charts/LineChart';
import { EmptyState } from '../../EmptyState';
import { SectionCard, SectionError } from './primitives';
import {
  recordToBars,
  resourceGrowthSeries,
  type ResourcesDashboardLike,
} from '../../../lib/cloudAccounts/overview';

/** Spec §11 / §12 — resource distribution by category. Click a bar → Resources module, filtered. */
export function ResourceDistribution({ res, error }: { res: ResourcesDashboardLike | null; error?: boolean }) {
  const navigate = useNavigate();
  return (
    <SectionCard title="Resource Distribution" icon="resources" to="/resources" linkLabel="Resources">
      {error ? (
        <SectionError label="resource distribution" />
      ) : !res || res.total === 0 ? (
        <EmptyState icon="resources" title="No resources discovered yet" description="Run discovery on a connected environment to populate this." />
      ) : (
        <>
          <BarChart
            data={recordToBars(res.byCategory, 8)}
            onBarClick={(cat) => navigate(`/resources?category=${encodeURIComponent(cat)}`)}
          />
          <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">{res.total.toLocaleString()} resources across all connected environments</p>
        </>
      )}
    </SectionCard>
  );
}

/** Spec §13 — cumulative resource growth over the selected window. */
export function ResourceGrowth({ res, days, error }: { res: ResourcesDashboardLike | null; days: number; error?: boolean }) {
  return (
    <SectionCard title="Resource Growth" icon="chart-area">
      {error ? (
        <SectionError label="resource growth" />
      ) : !res || res.trend30d.length === 0 ? (
        <EmptyState icon="chart-line" title="Not enough history yet" description="Growth appears once discovery has run over several days." />
      ) : (
        <>
          <LineChart
            series={[{ label: 'Resources', points: resourceGrowthSeries(res) }]}
            height={200}
          />
          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">Net change over the last {days} days</p>
        </>
      )}
    </SectionCard>
  );
}

/** Spec §23 / §24 — where resources live + which environments they're in. */
export function DistributionPanel({
  res,
  environments,
  error,
}: {
  res: ResourcesDashboardLike | null;
  environments: { environment: string; count: number }[] | null;
  error?: boolean;
}) {
  const navigate = useNavigate();
  const regionBars = res ? recordToBars(res.byRegion, 8) : [];
  const envBars = (environments ?? []).map((e) => ({ label: e.environment, value: e.count })).sort((a, b) => b.value - a.value);

  return (
    <SectionCard title="Distribution" icon="map-pin">
      {error && !res ? (
        <SectionError label="distribution" />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">By region</p>
            {regionBars.length === 0 ? (
              <p className="text-xs text-slate-400">No regional data yet.</p>
            ) : (
              <BarChart data={regionBars} onBarClick={() => navigate('/cloud-accounts?tab=Regions')} />
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">By environment</p>
            {envBars.length === 0 ? (
              <p className="text-xs text-slate-400">No environment data yet.</p>
            ) : (
              <BarChart data={envBars} />
            )}
          </div>
        </div>
      )}
    </SectionCard>
  );
}
