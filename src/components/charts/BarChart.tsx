import { useTheme } from '../../lib/theme';
import { CHROME, SEQUENTIAL_BLUE, pick } from './palette';

export interface BarDatum { label: string; value: number }

/** Horizontal bar chart for magnitude ranking (top-N tables) — one hue, no identity to encode. Rows are click-through when `onBarClick` is given. */
export function BarChart({ data, valueFormatter = (v: number) => v.toLocaleString(), height, onBarClick }: { data: BarDatum[]; valueFormatter?: (v: number) => string; height?: number; onBarClick?: (label: string) => void }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const max = Math.max(1, ...data.map(d => d.value));
  const barColor = SEQUENTIAL_BLUE[3];
  const trackColor = pick(CHROME.gridline, isDark);

  return (
    <div className="flex flex-col gap-2.5" style={height ? { height, overflowY: 'auto' } : undefined}>
      {data.map(d => {
        const row = (
          <>
            <span className="truncate text-slate-600 dark:text-slate-300" title={d.label}>{d.label}</span>
            <div className="h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: trackColor }}>
              <div className="h-full rounded-full" style={{ width: `${(d.value / max) * 100}%`, backgroundColor: barColor }} />
            </div>
            <span className="tabular-nums font-medium text-slate-800 dark:text-slate-100 w-16 text-right">{valueFormatter(d.value)}</span>
          </>
        );
        const cls = 'grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-2 text-xs';
        return onBarClick ? (
          <button key={d.label} type="button" onClick={() => onBarClick(d.label)} className={`${cls} text-left hover:opacity-80`}>{row}</button>
        ) : (
          <div key={d.label} className={cls}>{row}</div>
        );
      })}
      {data.length === 0 && <p className="text-sm text-slate-400 dark:text-slate-500">No data yet.</p>}
    </div>
  );
}
