import { BarChart } from '../charts/BarChart';
import type { VulnerabilityDashboard } from '../../lib/api';

interface Props {
  dashboard: VulnerabilityDashboard | null;
}

/**
 * The single consolidated dashboard.bySource chart -- replaces two duplicate
 * renderings that used to live on VulnerabilityManagement.tsx (an
 * always-visible progress-bar list above the tab row, shown on every tab,
 * and a second bar-chart copy inside the Overview tab specifically). `label`
 * already comes from the backend's own friendly-name mapping (dashboard.ts's
 * SOURCE_LABELS, covering both AWS-native and scanner_* sources) -- no
 * client-side label lookup needed here.
 */
export function FindingsByScanType({ dashboard }: Props) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Findings by Scan Type</h3>
      {dashboard && dashboard.bySource.length > 0 ? (
        <BarChart data={dashboard.bySource.map(s => ({ label: s.label, value: s.count }))} />
      ) : (
        <p className="text-xs text-slate-400">No findings recorded yet.</p>
      )}
    </div>
  );
}
