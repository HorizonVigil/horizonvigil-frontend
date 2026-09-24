import type { CSSProperties } from 'react';
import { useId, useState } from 'react';

import { useTheme } from '../../lib/theme';
import {
  categoricalColor,
  categoryColor,
  CHROME,
  STATUS,
  pick,
} from './palette';

export interface DonutSlice {
  label: string;
  value: number;
  colorCategory?: string;
  /**
   * Locks this slice to the shared severity/status tone palette.
   * Takes priority over `colorCategory`.
   */
  tone?: keyof typeof STATUS;
}

export interface DonutProps {
  data: DonutSlice[];
  size?: number;
  thickness?: number;
  centerLabel?: {
    value: string;
    caption: string;
  };
  showPercent?: boolean;
}

interface NormalizedSlice extends DonutSlice {
  value: number;
  index: number;
  fraction: number;
  startAngle: number;
  endAngle: number;
  color: string;
}

const DEFAULT_SIZE = 160;
const DEFAULT_THICKNESS = 24;
const MIN_SIZE = 32;
const MIN_THICKNESS = 1;

const START_ANGLE = -Math.PI / 2;
const FULL_CIRCLE = Math.PI * 2;

function normalizeNumber(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function normalizeSize(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_SIZE;
  }

  return Math.max(MIN_SIZE, value);
}

function normalizeThickness(size: number, thickness: number): number {
  if (!Number.isFinite(thickness)) {
    return Math.min(DEFAULT_THICKNESS, size / 2);
  }

  return Math.min(
    Math.max(MIN_THICKNESS, thickness),
    size / 2,
  );
}

function formatValue(value: number): string {
  return value.toLocaleString();
}

function formatPercentage(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

function getArcPath(
  startAngle: number,
  endAngle: number,
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
): string {
  const x1 = cx + outerRadius * Math.cos(startAngle);
  const y1 = cy + outerRadius * Math.sin(startAngle);

  const x2 = cx + outerRadius * Math.cos(endAngle);
  const y2 = cy + outerRadius * Math.sin(endAngle);

  const ix1 = cx + innerRadius * Math.cos(endAngle);
  const iy1 = cy + innerRadius * Math.sin(endAngle);

  const ix2 = cx + innerRadius * Math.cos(startAngle);
  const iy2 = cy + innerRadius * Math.sin(startAngle);

  const largeArcFlag = endAngle - startAngle > Math.PI ? 1 : 0;

  return [
    `M ${x1} ${y1}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
    `L ${ix1} ${iy1}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${ix2} ${iy2}`,
    'Z',
  ].join(' ');
}

/**
 * Donut chart for identity/composition breakdowns.
 *
 * Examples:
 * - resources by category
 * - cloud spend by service
 * - findings by severity
 * - remediation status
 *
 * `colorCategory` provides stable categorical colors across charts.
 * `tone` takes priority when the color itself represents semantic severity
 * or status.
 *
 * When `onBarClick`-style interaction is required in the future, this
 * component should expose an explicit callback rather than making SVG
 * segments interactive implicitly.
 */
export function Donut({
  data,
  size = DEFAULT_SIZE,
  thickness = DEFAULT_THICKNESS,
  centerLabel,
  showPercent = false,
}: DonutProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const chartId = useId();
  const normalizedSize = normalizeSize(size);
  const normalizedThickness = normalizeThickness(
    normalizedSize,
    thickness,
  );

  const radius = normalizedSize / 2;
  const innerRadius = radius - normalizedThickness;
  const cx = radius;
  const cy = radius;

  const normalizedData = data.map((slice) => ({
    ...slice,
    value: normalizeNumber(slice.value),
  }));

  const total = normalizedData.reduce(
    (sum, slice) => sum + slice.value,
    0,
  );

  let cumulative = 0;

  const segments: NormalizedSlice[] = normalizedData.map(
    (slice, index) => {
      const fraction = total > 0 ? slice.value / total : 0;

      const startAngle =
        cumulative * FULL_CIRCLE + START_ANGLE;

      cumulative += fraction;

      const endAngle =
        cumulative * FULL_CIRCLE + START_ANGLE;

      const color = slice.tone
        ? pick(STATUS[slice.tone], isDark)
        : slice.colorCategory
          ? categoryColor(slice.colorCategory, isDark)
          : categoricalColor(index, isDark);

      return {
        ...slice,
        index,
        fraction,
        startAngle,
        endAngle,
        color,
      };
    },
  );

  const positiveSegments = segments.filter(
    (segment) => segment.value > 0,
  );

  const soleSegment =
    positiveSegments.length === 1 && total > 0
      ? positiveSegments[0]
      : null;

  const hasData = total > 0;

  const legendId = `${chartId}-legend`;
  const chartLabel = centerLabel
    ? `${centerLabel.value} ${centerLabel.caption}`
    : 'Distribution donut chart';

  const chartStyle: CSSProperties = {
    width: normalizedSize,
    height: normalizedSize,
    flexShrink: 0,
  };

  function handleMouseEnter(index: number) {
    setHoverIndex(index);
  }

  function handleMouseLeave() {
    setHoverIndex(null);
  }

  return (
    <div
      className="flex items-center gap-4"
      aria-label={chartLabel}
    >
      <svg
        width={normalizedSize}
        height={normalizedSize}
        viewBox={`0 0 ${normalizedSize} ${normalizedSize}`}
        role="img"
        aria-labelledby={`${chartId}-title`}
        style={chartStyle}
      >
        <title id={`${chartId}-title`}>{chartLabel}</title>

        {!hasData ? (
          <circle
            cx={cx}
            cy={cy}
            r={radius - normalizedThickness / 2}
            fill="none"
            stroke={pick(CHROME.gridline, isDark)}
            strokeWidth={normalizedThickness}
            aria-hidden="true"
          />
        ) : soleSegment ? (
          <circle
            cx={cx}
            cy={cy}
            r={radius - normalizedThickness / 2}
            fill="none"
            stroke={soleSegment.color}
            strokeWidth={normalizedThickness}
            opacity={
              hoverIndex === null ||
              hoverIndex === soleSegment.index
                ? 1
                : 0.35
            }
            onMouseEnter={() =>
              handleMouseEnter(soleSegment.index)
            }
            onMouseLeave={handleMouseLeave}
          >
            <title>
              {`${soleSegment.label}: ${formatValue(
                soleSegment.value,
              )} (100%)`}
            </title>
          </circle>
        ) : (
          segments.map((segment) => (
            <path
              key={`${segment.label}-${segment.index}`}
              d={getArcPath(
                segment.startAngle,
                segment.endAngle,
                cx,
                cy,
                radius,
                innerRadius,
              )}
              fill={segment.color}
              opacity={
                hoverIndex === null ||
                hoverIndex === segment.index
                  ? 1
                  : 0.35
              }
              stroke={pick(CHROME.surface, isDark)}
              strokeWidth={2}
              strokeLinejoin="round"
              onMouseEnter={() =>
                handleMouseEnter(segment.index)
              }
              onMouseLeave={handleMouseLeave}
            >
              <title>
                {`${segment.label}: ${formatValue(
                  segment.value,
                )} (${formatPercentage(segment.fraction)})`}
              </title>
            </path>
          ))
        )}

        {centerLabel && (
          <g
            aria-hidden="true"
            pointerEvents="none"
          >
            <text
              x={cx}
              y={cy - 4}
              textAnchor="middle"
              fontSize="20"
              fontWeight={700}
              fill={pick(CHROME.primaryInk, isDark)}
            >
              {centerLabel.value}
            </text>

            <text
              x={cx}
              y={cy + 16}
              textAnchor="middle"
              fontSize="10"
              fill={pick(CHROME.secondaryInk, isDark)}
            >
              {centerLabel.caption}
            </text>
          </g>
        )}
      </svg>

      <ul
        id={legendId}
        className="flex flex-col gap-1.5 text-sm"
        aria-label="Chart legend"
      >
        {segments.map((segment) => {
          const isHovered = hoverIndex === segment.index;

          return (
            <li
              key={`${segment.label}-${segment.index}`}
              className={[
                'flex items-center gap-2 cursor-default rounded-sm',
                'transition-opacity duration-150',
                hoverIndex !== null && !isHovered
                  ? 'opacity-50'
                  : 'opacity-100',
              ].join(' ')}
              onMouseEnter={() =>
                handleMouseEnter(segment.index)
              }
              onMouseLeave={handleMouseLeave}
            >
              <span
                aria-hidden="true"
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{
                  backgroundColor: segment.color,
                }}
              />

              <span
                className="min-w-0 truncate text-slate-600 dark:text-slate-300"
                title={segment.label}
              >
                {segment.label}
              </span>

              <span className="shrink-0 tabular-nums text-slate-400 dark:text-slate-500">
                {formatValue(segment.value)}
                {showPercent && hasData
                  ? ` (${formatPercentage(segment.fraction)})`
                  : ''}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}