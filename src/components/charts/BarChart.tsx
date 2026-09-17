import type { CSSProperties, ReactNode } from 'react';
import { useTheme } from '../../lib/theme';
import { CHROME, SEQUENTIAL_BLUE, pick } from './palette';

export interface BarDatum {
  label: string;
  value: number;
}

export interface BarChartProps {
  data: BarDatum[];
  valueFormatter?: (value: number) => string;
  height?: number;
  onBarClick?: (label: string) => void;
}

const DEFAULT_VALUE_FORMATTER = (value: number): string =>
  value.toLocaleString();

const MIN_BAR_PERCENTAGE = 0;
const MAX_BAR_PERCENTAGE = 100;
const MIN_MAX_VALUE = 1;

/**
 * Returns a safe numeric value for chart calculations.
 *
 * Charts should never generate invalid CSS such as:
 * `width: NaN%` or `width: Infinity%`.
 */
function normalizeValue(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

/**
 * Converts a value into a bounded percentage suitable for a CSS width.
 */
function getBarPercentage(value: number, max: number): number {
  if (max <= 0 || !Number.isFinite(max)) {
    return 0;
  }

  const percentage = (normalizeValue(value) / max) * 100;

  return Math.min(
    MAX_BAR_PERCENTAGE,
    Math.max(MIN_BAR_PERCENTAGE, percentage),
  );
}

/**
 * Horizontal bar chart for magnitude ranking / top-N tables.
 *
 * The chart uses a single sequential hue because color does not encode
 * identity between rows. Rows become keyboard-accessible click targets when
 * `onBarClick` is supplied.
 */
export function BarChart({
  data,
  valueFormatter = DEFAULT_VALUE_FORMATTER,
  height,
  onBarClick,
}: BarChartProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const normalizedData = data.map((datum) => ({
    ...datum,
    value: normalizeValue(datum.value),
  }));

  const max = Math.max(
    MIN_MAX_VALUE,
    ...normalizedData.map((datum) => datum.value),
  );

  const barColor = SEQUENTIAL_BLUE[3];
  const trackColor = pick(CHROME.gridline, isDark);

  const containerStyle: CSSProperties | undefined =
    height !== undefined
      ? {
          height,
          overflowY: 'auto',
        }
      : undefined;

  const rowClassName =
    'grid grid-cols-[minmax(0,7rem)_1fr_4rem] items-center gap-2 text-xs';

  if (data.length === 0) {
    return (
      <div
        className="flex min-h-10 items-center"
        style={containerStyle}
        role="status"
        aria-live="polite"
      >
        <p className="text-sm text-slate-400 dark:text-slate-500">
          No data yet.
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-2.5"
      style={containerStyle}
      role="list"
      aria-label="Bar chart"
    >
      {normalizedData.map((datum, index) => {
        const percentage = getBarPercentage(datum.value, max);
        const rowKey = `${datum.label}-${index}`;

        const content: ReactNode = (
          <>
            <span
              className="min-w-0 truncate text-left text-slate-600 dark:text-slate-300"
              title={datum.label}
            >
              {datum.label}
            </span>

            <div
              className="h-2.5 min-w-0 overflow-hidden rounded-full"
              style={{ backgroundColor: trackColor }}
              role="presentation"
            >
              <div
                className="h-full rounded-full transition-[width] duration-200"
                style={{
                  width: `${percentage}%`,
                  backgroundColor: barColor,
                }}
                role="presentation"
              />
            </div>

            <span className="w-16 text-right font-medium tabular-nums text-slate-800 dark:text-slate-100">
              {valueFormatter(datum.value)}
            </span>
          </>
        );

        if (onBarClick) {
          return (
            <button
              key={rowKey}
              type="button"
              role="listitem"
              onClick={() => onBarClick(datum.label)}
              aria-label={`${datum.label}: ${valueFormatter(datum.value)}`}
              className={[
                rowClassName,
                'w-full rounded-md text-left',
                'transition-opacity hover:opacity-80',
                'focus-visible:outline-none focus-visible:ring-2',
                'focus-visible:ring-brand-600 focus-visible:ring-offset-2',
                'dark:focus-visible:ring-offset-slate-950',
              ].join(' ')}
            >
              {content}
            </button>
          );
        }

        return (
          <div
            key={rowKey}
            role="listitem"
            className={rowClassName}
          >
            {content}
          </div>
        );
      })}
    </div>
  );
}