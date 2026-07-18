import { useState, useMemo, useRef } from 'react';
import { useTheme } from '../../lib/theme';
import { categoricalColor, CHROME, pick } from './palette';

export interface LineSeries { label: string; points: { x: string; y: number }[] }

/** Single-axis multi-line/area chart with a crosshair tooltip and a legend (required once ≥2 series). */
export function LineChart({ series, height = 220, area = true, valueFormatter = (v: number) => v.toLocaleString() }: { series: LineSeries[]; height?: number; area?: boolean; valueFormatter?: (v: number) => string }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const width = 640;
  const padding = { top: 12, right: 12, bottom: 24, left: 12 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const allXLabels = series[0]?.points.map(p => p.x) ?? [];
  const maxY = Math.max(1, ...series.flatMap(s => s.points.map(p => p.y)));

  const xScale = (i: number) => padding.left + (allXLabels.length <= 1 ? plotW / 2 : (i / (allXLabels.length - 1)) * plotW);
  const yScale = (v: number) => padding.top + plotH - (v / maxY) * plotH;

  const linePaths = useMemo(() => series.map((s, si) => {
    const d = s.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(p.y)}`).join(' ');
    const areaD = area ? `${d} L ${xScale(s.points.length - 1)} ${padding.top + plotH} L ${xScale(0)} ${padding.top + plotH} Z` : null;
    return { color: categoricalColor(si, isDark), d, areaD, label: s.label };
  }), [series, isDark, area]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleMouseMove(e: React.MouseEvent<SVGRectElement>) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const relX = ((e.clientX - rect.left) / rect.width) * width;
    const idx = Math.round(((relX - padding.left) / plotW) * (allXLabels.length - 1));
    setHoverX(Math.max(0, Math.min(allXLabels.length - 1, idx)));
  }

  const gridlineColor = pick(CHROME.gridline, isDark);
  const mutedInk = pick(CHROME.mutedInk, isDark);

  return (
    <div ref={containerRef} className="w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }} role="img" aria-label="Trend line chart">
        {[0.25, 0.5, 0.75, 1].map(f => (
          <line key={f} x1={padding.left} x2={width - padding.right} y1={padding.top + plotH * (1 - f)} y2={padding.top + plotH * (1 - f)} stroke={gridlineColor} strokeWidth={1} />
        ))}
        {linePaths.map(lp => (
          <g key={lp.label}>
            {lp.areaD && <path d={lp.areaD} fill={lp.color} opacity={0.12} />}
            <path d={lp.d} fill="none" stroke={lp.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          </g>
        ))}
        {hoverX !== null && (
          <line x1={xScale(hoverX)} x2={xScale(hoverX)} y1={padding.top} y2={padding.top + plotH} stroke={mutedInk} strokeWidth={1} strokeDasharray="3,3" />
        )}
        {hoverX !== null && series.map((s, si) => {
          const p = s.points[hoverX];
          if (!p) return null;
          return <circle key={s.label} cx={xScale(hoverX)} cy={yScale(p.y)} r={4} fill={categoricalColor(si, isDark)} stroke={pick(CHROME.surface, isDark)} strokeWidth={2} />;
        })}
        <rect x={padding.left} y={padding.top} width={plotW} height={plotH} fill="transparent" onMouseMove={handleMouseMove} onMouseLeave={() => setHoverX(null)} />
      </svg>
      {hoverX !== null && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs -mt-1 mb-2 px-1">
          <span className="text-slate-400 dark:text-slate-500 tabular-nums">{allXLabels[hoverX]}</span>
          {series.map((s, si) => (
            <span key={s.label} className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: categoricalColor(si, isDark) }} />
              {s.label}: <span className="tabular-nums font-medium text-slate-800 dark:text-slate-100">{valueFormatter(s.points[hoverX]?.y ?? 0)}</span>
            </span>
          ))}
        </div>
      )}
      {series.length > 1 && hoverX === null && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mt-1 px-1">
          {series.map((s, si) => (
            <span key={s.label} className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: categoricalColor(si, isDark) }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
