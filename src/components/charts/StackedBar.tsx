import { useId, useMemo, useState } from 'react';
import { useTheme } from '../../lib/theme';
import {
  categoricalColor,
  categoryColor,
  CHROME,
  STATUS,
  pick,
} from './palette';

export interface StackSegment {
  label: string;
  value: number;
  /**
   * Locks the segment to the shared status palette.
   * Use when colour carries semantic meaning.
   */
  tone?: keyof typeof STATUS;
  /**
   * Locks the segment to a fixed resource-category colour.
   * Ignored when `tone` is set.
   */
  colorCategory?: string;
}

export interface StackRow {
  /** Left-hand label, such as a provider name. */
  label?: string;
  segments: StackSegment[];
  /** Optional right-hand annotation, such as "98%". */
  trailing?: string;
}

export interface StackedBarProps {
  rows: StackRow[];
  height?: number;
  showLegend?: boolean;
  valueFormatter?: (value: number) => string;
  onSegmentClick?: (label: string) => void;
}

interface LegendItem {
  label: string;
  color: string;
}

const DEFAULT_HEIGHT = 12;
const MIN_HEIGHT = 4;
const MAX_HEIGHT = 80;
const FALLBACK_HEIGHT = DEFAULT_HEIGHT;
const EMPTY_SEGMENT_VALUE = 0;

function normalizeHeight(height: number): number {
  if (!Number.isFinite(height)) return FALLBACK_HEIGHT;
  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, height));
}

function normalizeValue(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : EMPTY_SEGMENT_VALUE;
}

function normalizeLabel(label: string): string {
  return label.trim();
}

function colorFor(
  segment: StackSegment,
  index: number,
  isDark: boolean,
): string {
  if (segment.tone !== undefined) {
    return pick(STATUS[segment.tone], isDark);
  }

  const category = normalizeLabel(segment.colorCategory ?? '');
  if (category) {
    return categoryColor(category, isDark);
  }

  return categoricalColor(index, isDark);
}

function formatPercentage(value: number, total: number): string {
  if (total <= 0 || !Number.isFinite(total)) return '0.0';
  return ((value / total) * 100).toFixed(1);
}

/**
 * Horizontal full-width stacked bars.
 *
 * Each row is normalized independently to 100% so distributions are
 * visually comparable. Segment colours follow the shared HorizonVigil
 * palette. Semantic `tone` colours take precedence over `colorCategory`,
 * which takes precedence over the positional categorical palette.
 *
 * When `onSegmentClick` is supplied, positive-value segments become
 * keyboard-accessible buttons. Hover/focus highlighting is shared across
 * matching segment labels.
 */
export function StackedBar({
  rows,
  height = DEFAULT_HEIGHT,
  showLegend = true,
  valueFormatter = (value: number) => value.toLocaleString(),
  onSegmentClick,
}: StackedBarProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const chartId = useId();

  const normalizedHeight = normalizeHeight(height);

  const legend = useMemo<LegendItem[]>(() => {
    const items: LegendItem[] = [];
    const seen = new Set<string>();

    rows.forEach((row) => {
      row.segments.forEach((segment, index) => {
        const label = normalizeLabel(segment.label);
        if (!label || seen.has(label)) return;

        seen.add(label);
        items.push({
          label,
          color: colorFor(segment, index, isDark),
        });
      });
    });

    return items;
  }, [rows, isDark]);

  const hasLabels = useMemo(
    () =>
      rows.some(
        (row) => typeof row.label === 'string' && normalizeLabel(row.label),
      ),
    [rows],
  );

  const hasVisibleSegments = useMemo(
    () =>
      rows.some((row) =>
        row.segments.some((segment) => normalizeValue(segment.value) > 0),
      ),
    [rows],
  );

  if (rows.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-md py-4 text-xs text-slate-500 dark:text-slate-400"
        role="status"
        aria-live="polite"
      >
        No data available
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-2.5"
      role="group"
      aria-label="Stacked bar chart"
    >
      {rows.map((row, rowIndex) => {
        const normalizedSegments = row.segments.map((segment) => ({
          ...segment,
          label: normalizeLabel(segment.label),
          value: normalizeValue(segment.value),
        }));

        const total = normalizedSegments.reduce(
          (sum, segment) => sum + segment.value,
          0,
        );

        const rowLabel = normalizeLabel(row.label ?? '');
        const rowId = `${chartId}-row-${rowIndex}`;

        return (
          <div
            key={`${rowLabel || 'row'}-${rowIndex}`}
            className={
              hasLabels
                ? 'grid min-w-0 grid-cols-[minmax(0,5rem)_minmax(0,1fr)_auto] items-center gap-2 text-xs'
                : 'flex min-w-0 items-center gap-2 text-xs'
            }
          >
            {hasLabels ? (
              <span
                id={rowLabel ? rowId : undefined}
                className="truncate text-slate-600 dark:text-slate-300"
                title={rowLabel || undefined}
              >
                {rowLabel || '—'}
              </span>
            ) : null}

            <div
              className="flex min-w-0 w-full overflow-hidden rounded-full"
              style={{
                height: normalizedHeight,
                backgroundColor: pick(CHROME.gridline, isDark),
              }}
              role="img"
              aria-label={
                rowLabel
                  ? `${rowLabel} stacked distribution`
                  : 'Stacked distribution'
              }
              aria-describedby={rowLabel ? rowId : undefined}
            >
              {total > 0
                ? normalizedSegments.map((segment, segmentIndex) => {
                    if (segment.value <= 0 || !segment.label) return null;

                    const color = colorFor(
                      segment,
                      segmentIndex,
                      isDark,
                    );
                    const percentage = (segment.value / total) * 100;
                    const dim =
                      activeLabel !== null &&
                      activeLabel !== segment.label;
                    const isClickable = Boolean(onSegmentClick);
                    const title = `${segment.label}: ${valueFormatter(
                      segment.value,
                    )} (${formatPercentage(segment.value, total)}%)`;

                    const commonProps = {
                      key: `${rowIndex}-${segment.label}-${segmentIndex}`,
                      title,
                      onMouseEnter: () => setActiveLabel(segment.label),
                      onMouseLeave: () => setActiveLabel(null),
                      onFocus: () => setActiveLabel(segment.label),
                      onBlur: () => setActiveLabel(null),
                      className:
                        'h-full min-w-0 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white dark:focus-visible:ring-slate-950',
                      style: {
                        width: `${percentage}%`,
                        backgroundColor: color,
                        opacity: dim ? 0.35 : 1,
                      },
                      'aria-label': title,
                    };

                    if (isClickable) {
                      return (
                        <button
                          {...commonProps}
                          type="button"
                          onClick={() => onSegmentClick?.(segment.label)}
                          aria-describedby={rowLabel ? rowId : undefined}
                        />
                      );
                    }

                    return (
                      <span
                        {...commonProps}
                        role="img"
                      />
                    );
                  })
                : null}
            </div>

            {row.trailing != null ? (
              <span className="whitespace-nowrap tabular-nums font-medium text-slate-700 dark:text-slate-200">
                {row.trailing}
              </span>
            ) : null}
          </div>
        );
      })}

      {showLegend && legend.length > 0 ? (
        <div
          className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5 text-xs"
          aria-label="Chart legend"
        >
          {legend.map((item) => {
            const dim =
              activeLabel !== null && activeLabel !== item.label;

            return (
              <span
                key={item.label}
                className="flex items-center gap-1.5 transition-opacity"
                style={{ opacity: dim ? 0.5 : 1 }}
                onMouseEnter={() => setActiveLabel(item.label)}
                onMouseLeave={() => setActiveLabel(null)}
              >
                <span
                  aria-hidden="true"
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-slate-500 dark:text-slate-400">
                  {item.label}
                </span>
              </span>
            );
          })}
        </div>
      ) : null}

      {!hasVisibleSegments ? (
        <span className="sr-only" role="status">
          All values are zero.
        </span>
      ) : null}
    </div>
  );
}
