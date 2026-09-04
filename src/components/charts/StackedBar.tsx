import { useState } from 'react';
import { useTheme } from '../../lib/theme';
import { categoricalColor, categoryColor, CHROME, STATUS, pick } from './palette';

export interface StackSegment {
  label: string;
  value: number;
  /** Locks the segment to the shared status palette (critical=red etc.) — use where the colour carries meaning. */
  tone?: keyof typeof STATUS;
  /** Locks the segment to a fixed categorical slot (so "Compute" is always the same hue). Ignored when `tone` is set. */
  colorCategory?: string;
}

export interface StackRow {
  /** Left-hand label for the row (e.g. a provider name). Omit for a single unlabelled bar. */
  label?: string;
  segments: StackSegment[];
  /** Optional right-hand annotation (e.g. "98%"). */
  trailing?: string;
}

function colorFor(seg: StackSegment, i: number, isDark: boolean): string {
  if (seg.tone) return pick(STATUS[seg.tone], isDark);
  if (seg.colorCategory) return categoryColor(seg.colorCategory, isDark);
  return categoricalColor(i, isDark);
}

/**
 * Horizontal 100%-width stacked bar(s) — health/status distribution, provider
 * composition, sync-status breakdown. One row per {@link StackRow}; every row
 * normalises to the same full width so rows are visually comparable. Segments
 * are click-through when `onSegmentClick` is given. A shared legend is derived
 * from the union of segment labels across all rows.
 */
export function StackedBar({
  rows,
  height = 12,
  showLegend = true,
  valueFormatter = (v: number) => v.toLocaleString(),
  onSegmentClick,
}: {
  rows: StackRow[];
  height?: number;
  showLegend?: boolean;
  valueFormatter?: (v: number) => string;
  onSegmentClick?: (label: string) => void;
}) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [hover, setHover] = useState<string | null>(null);

  const legend: { label: string; color: string }[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    row.segments.forEach((seg, i) => {
      if (seen.has(seg.label)) return;
      seen.add(seg.label);
      legend.push({ label: seg.label, color: colorFor(seg, i, isDark) });
    });
  }

  const hasLabels = rows.some((r) => r.label);

  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((row, ri) => {
        const total = row.segments.reduce((s, seg) => s + seg.value, 0);
        return (
          <div
            key={row.label ?? ri}
            className={hasLabels ? 'grid items-center gap-2 text-xs grid-cols-[minmax(0,5rem)_1fr_auto]' : 'flex items-center gap-2 text-xs'}
          >
            {hasLabels && <span className="truncate text-slate-600 dark:text-slate-300" title={row.label}>{row.label}</span>}
            <div className="flex w-full overflow-hidden rounded-full" style={{ height, backgroundColor: pick(CHROME.gridline, isDark) }}>
              {total === 0 ? null : row.segments.map((seg, i) => {
                if (seg.value <= 0) return null;
                const color = colorFor(seg, i, isDark);
                const pct = (seg.value / total) * 100;
                const dim = hover !== null && hover !== seg.label;
                return (
                  <button
                    key={seg.label}
                    type="button"
                    disabled={!onSegmentClick}
                    onClick={onSegmentClick ? () => onSegmentClick(seg.label) : undefined}
                    onMouseEnter={() => setHover(seg.label)}
                    onMouseLeave={() => setHover(null)}
                    className={onSegmentClick ? 'h-full cursor-pointer transition-opacity' : 'h-full transition-opacity'}
                    style={{ width: `${pct}%`, backgroundColor: color, opacity: dim ? 0.35 : 1 }}
                    title={`${seg.label}: ${valueFormatter(seg.value)} (${pct.toFixed(1)}%)`}
                  />
                );
              })}
            </div>
            {row.trailing != null && (
              <span className="tabular-nums font-medium text-slate-700 dark:text-slate-200">{row.trailing}</span>
            )}
          </div>
        );
      })}

      {showLegend && legend.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs pt-0.5">
          {legend.map((l) => (
            <span
              key={l.label}
              className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400"
              onMouseEnter={() => setHover(l.label)}
              onMouseLeave={() => setHover(null)}
            >
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />
              {l.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
