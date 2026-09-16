import type { CSSProperties, MouseEvent } from 'react';
import { useId, useMemo, useRef, useState } from 'react';

import { useTheme } from '../../lib/theme';
import { categoricalColor, CHROME, pick } from './palette';

export interface LinePoint {
  x: string;
  y: number;
}

export interface LineSeries {
  label: string;
  points: LinePoint[];
}

export interface LineChartProps {
  series: LineSeries[];
  height?: number;
  area?: boolean;
  valueFormatter?: (value: number) => string;
}

interface ChartSeries extends LineSeries {
  color: string;
  linePath: string;
  areaPath: string | null;
}

const DEFAULT_HEIGHT = 220;
const MIN_HEIGHT = 120;
const MAX_HEIGHT = 800;

const WIDTH = 640;

const PADDING = {
  top: 12,
  right: 12,
  bottom: 24,
  left: 12,
} as const;

const GRIDLINES = [0.25, 0.5, 0.75, 1] as const;

const DEFAULT_VALUE_FORMATTER = (value: number): string =>
  value.toLocaleString();

function normalizeValue(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function normalizeHeight(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_HEIGHT;
  }

  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, value));
}

function normalizeLabel(label: string, fallback: string): string {
  const normalized = label.trim();

  return normalized || fallback;
}

function buildLinePath(
  points: LinePoint[],
  xScale: (index: number) => number,
  yScale: (value: number) => number,
): string {
  return points
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'} ${xScale(index)} ${yScale(
          normalizeValue(point.y),
        )}`,
    )
    .join(' ');
}

function buildAreaPath(
  points: LinePoint[],
  xScale: (index: number) => number,
  yScale: (value: number) => number,
  baselineY: number,
): string | null {
  if (points.length === 0) {
    return null;
  }

  const linePath = buildLinePath(points, xScale, yScale);

  return [
    linePath,
    `L ${xScale(points.length - 1)} ${baselineY}`,
    `L ${xScale(0)} ${baselineY}`,
    'Z',
  ].join(' ');
}

/**
 * Single-axis multi-line/area chart with a responsive crosshair tooltip.
 *
 * The first non-empty series defines the shared x-axis.
 * Series with fewer points simply have no value at unavailable positions.
 *
 * `area` controls the optional filled area beneath each series.
 *
 * A legend is displayed automatically when two or more series exist.
 */
export function LineChart({
  series,
  height = DEFAULT_HEIGHT,
  area = true,
  valueFormatter = DEFAULT_VALUE_FORMATTER,
}: LineChartProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);

  const chartId = useId();

  const normalizedHeight = normalizeHeight(height);

  const plotW = WIDTH - PADDING.left - PADDING.right;
  const plotH = normalizedHeight - PADDING.top - PADDING.bottom;

  /**
   * The first non-empty series defines the shared x-axis.
   */
  const allXLabels = useMemo(() => {
    const source = series.find(
      (item) => item.points.length > 0,
    );

    return source?.points.map((point) => point.x) ?? [];
  }, [series]);

  /**
   * Normalize incoming values before any SVG geometry is generated.
   *
   * This prevents NaN/Infinity from producing invalid SVG coordinates.
   */
  const normalizedSeries = useMemo<ChartSeries[]>(
    () =>
      series.map((item, index) => ({
        label: normalizeLabel(
          item.label,
          `Series ${index + 1}`,
        ),
        points: item.points.map((point) => ({
          x: point.x,
          y: normalizeValue(point.y),
        })),
        color: categoricalColor(index, isDark),
        linePath: '',
        areaPath: null,
      })),
    [series, isDark],
  );

  const maxY = useMemo(
    () =>
      Math.max(
        1,
        ...normalizedSeries.flatMap((item) =>
          item.points.map((point) => point.y),
        ),
      ),
    [normalizedSeries],
  );

  const xScale = (index: number): number => {
    if (allXLabels.length <= 1) {
      return PADDING.left + plotW / 2;
    }

    return (
      PADDING.left +
      (index / (allXLabels.length - 1)) * plotW
    );
  };

  const yScale = (value: number): number => {
    const safeValue = Math.min(
      maxY,
      Math.max(0, normalizeValue(value)),
    );

    return (
      PADDING.top +
      plotH -
      (safeValue / maxY) * plotH
    );
  };

  const chartSeries = useMemo<ChartSeries[]>(
    () =>
      normalizedSeries.map((item) => ({
        ...item,
        linePath: buildLinePath(
          item.points,
          xScale,
          yScale,
        ),
        areaPath: area
          ? buildAreaPath(
              item.points,
              xScale,
              yScale,
              PADDING.top + plotH,
            )
          : null,
      })),
    [
      normalizedSeries,
      area,
      plotH,
      plotW,
      allXLabels.length,
      maxY,
    ],
  );

  const gridlineColor = pick(CHROME.gridline, isDark);
  const mutedInk = pick(CHROME.mutedInk, isDark);
  const surfaceColor = pick(CHROME.surface, isDark);

  const titleId = `${chartId}-title`;

  const hasData =
    allXLabels.length > 0 &&
    chartSeries.some((item) => item.points.length > 0);

  const hoveredLabel =
    hoverX !== null
      ? allXLabels[hoverX]
      : undefined;

  function handleMouseMove(
    event: MouseEvent<SVGRectElement>,
  ) {
    if (!hasData) {
      return;
    }

    const rect =
      event.currentTarget.getBoundingClientRect();

    if (rect.width <= 0) {
      return;
    }

    /*
     * The SVG uses a 640px viewBox but is responsive in the DOM.
     * Convert the browser coordinate into the viewBox coordinate so
     * hover selection remains accurate at every rendered width.
     */
    const relativeX =
      ((event.clientX - rect.left) / rect.width) * WIDTH;

    const rawIndex =
      allXLabels.length <= 1
        ? 0
        : Math.round(
            ((relativeX - PADDING.left) / plotW) *
              (allXLabels.length - 1),
          );

    const clampedIndex = Math.max(
      0,
      Math.min(
        allXLabels.length - 1,
        rawIndex,
      ),
    );

    setHoverX(clampedIndex);
  }

  function handleMouseLeave() {
    setHoverX(null);
  }

  const svgStyle: CSSProperties = {
    height: normalizedHeight,
  };

  return (
    <div
      ref={containerRef}
      className="w-full"
    >
      <svg
        viewBox={`0 0 ${WIDTH} ${normalizedHeight}`}
        className="w-full"
        style={svgStyle}
        role="img"
        aria-labelledby={titleId}
      >
        <title id={titleId}>
          Trend line chart
        </title>

        {GRIDLINES.map((fraction) => {
          const y =
            PADDING.top +
            plotH * (1 - fraction);

          return (
            <line
              key={fraction}
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={y}
              y2={y}
              stroke={gridlineColor}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              aria-hidden="true"
            />
          );
        })}

        {chartSeries.map((item, index) => (
          <g key={`${item.label}-${index}`}>
            {item.areaPath && (
              <path
                d={item.areaPath}
                fill={item.color}
                opacity={0.12}
                aria-hidden="true"
              />
            )}

            {item.linePath && (
              <path
                d={item.linePath}
                fill="none"
                stroke={item.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                aria-hidden="true"
              />
            )}
          </g>
        ))}

        {hoverX !== null && hasData && (
          <>
            <line
              x1={xScale(hoverX)}
              x2={xScale(hoverX)}
              y1={PADDING.top}
              y2={PADDING.top + plotH}
              stroke={mutedInk}
              strokeWidth={1}
              strokeDasharray="3,3"
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
              aria-hidden="true"
            />

            {chartSeries.map((item, index) => {
              const point = item.points[hoverX];

              if (!point) {
                return null;
              }

              return (
                <circle
                  key={`${item.label}-${index}`}
                  cx={xScale(hoverX)}
                  cy={yScale(point.y)}
                  r={4}
                  fill={item.color}
                  stroke={surfaceColor}
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                  aria-hidden="true"
                />
              );
            })}
          </>
        )}

        {hasData && (
          <rect
            x={PADDING.left}
            y={PADDING.top}
            width={plotW}
            height={plotH}
            fill="transparent"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            aria-hidden="true"
          />
        )}
      </svg>

      {!hasData && (
        <p
          className="px-1 text-sm text-slate-400 dark:text-slate-500"
          role="status"
          aria-live="polite"
        >
          No data yet.
        </p>
      )}

      {hoverX !== null &&
        hoveredLabel &&
        hasData && (
          <div
            className="-mt-1 mb-2 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs"
            role="status"
            aria-live="polite"
            aria-label={`Values for ${hoveredLabel}`}
          >
            <span className="tabular-nums text-slate-400 dark:text-slate-500">
              {hoveredLabel}
            </span>

            {chartSeries.map((item, index) => {
              const point =
                item.points[hoverX];

              if (!point) {
                return null;
              }

              return (
                <span
                  key={`${item.label}-${index}`}
                  className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300"
                >
                  <span
                    aria-hidden="true"
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{
                      backgroundColor: item.color,
                    }}
                  />

                  <span>{item.label}:</span>

                  <span className="font-medium tabular-nums text-slate-800 dark:text-slate-100">
                    {valueFormatter(point.y)}
                  </span>
                </span>
              );
            })}
          </div>
        )}

      {chartSeries.length > 1 &&
        hoverX === null && (
          <div
            className="mt-1 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs"
            aria-label="Chart legend"
          >
            {chartSeries.map((item, index) => (
              <span
                key={`${item.label}-${index}`}
                className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300"
              >
                <span
                  aria-hidden="true"
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor: item.color,
                  }}
                />

                <span>{item.label}</span>
              </span>
            ))}
          </div>
        )}
    </div>
  );
}