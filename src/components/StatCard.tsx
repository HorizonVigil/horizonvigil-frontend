import { useTheme } from '../lib/theme';
import { STATUS, pick } from './charts/palette';
import { Icon } from './icons';

export interface StatCardProps {
  label: string;
  value: string;
  delta?: { value: string; direction: 'up' | 'down' | 'flat'; goodDirection?: 'up' | 'down' };
  sparkline?: number[];
  caption?: string;
}

export function StatCard({ label, value, delta, sparkline, caption }: StatCardProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  let deltaColor: string | undefined;
  if (delta && delta.direction !== 'flat') {
    const isGood = delta.direction === (delta.goodDirection ?? 'up');
    deltaColor = pick(isGood ? STATUS.good : STATUS.critical, isDark);
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col gap-1.5 transition-all hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md">
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
      <div className="flex items-end justify-between gap-2">
        <span className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">{value}</span>
        {sparkline && sparkline.length > 1 && <Sparkline points={sparkline} />}
      </div>
      <div className="flex items-center gap-1.5 text-xs">
        {delta && (
          <span style={{ color: deltaColor }} className="font-medium flex items-center gap-0.5">
            <Icon
              name={delta.direction === 'up' ? 'trending-up' : delta.direction === 'down' ? 'trending-down' : 'arrow-right'}
              size={12}
            />
            {delta.value}
          </span>
        )}
        {caption && <span className="text-slate-400 dark:text-slate-500">{caption}</span>}
      </div>
    </div>
  );
}

function Sparkline({ points }: { points: number[] }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const width = 64, height = 24;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i / (points.length - 1)) * width} ${height - ((p - min) / range) * height}`).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={d} fill="none" stroke={isDark ? '#3987e5' : '#2a78d6'} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}