import { useState } from 'react';
import { useTheme } from '../../lib/theme';
import { categoricalColor, categoryColor, CHROME, STATUS, pick } from './palette';

export interface DonutSlice {
  label: string;
  value: number;
  colorCategory?: string;
  /** Locks this slice to the shared severity/status tone palette (same tokens as Badge/StatCard) instead of the generic categorical order -- use for severity/remediation-style breakdowns where the color itself carries meaning (critical=red etc), not just a label to distinguish. Takes priority over colorCategory. */
  tone?: keyof typeof STATUS;
}

/**
 * Donut chart for identity/composition breakdowns (e.g. resources by category).
 * Pass `colorCategory` per slice to lock a fixed categorical slot (so "Compute"
 * is always the same color across every chart); otherwise slices are colored
 * by their position in the fixed 8-hue order.
 */
export function Donut({ data, size = 160, thickness = 24, centerLabel, showPercent = false }: { data: DonutSlice[]; size?: number; thickness?: number; centerLabel?: { value: string; caption: string }; showPercent?: boolean }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const radius = size / 2;
  const innerRadius = radius - thickness;
  const cx = radius;
  const cy = radius;

  let cumulative = 0;
  const segments = data.map((d, i) => {
    const fraction = total > 0 ? d.value / total : 0;
    const startAngle = cumulative * 2 * Math.PI - Math.PI / 2;
    cumulative += fraction;
    const endAngle = cumulative * 2 * Math.PI - Math.PI / 2;
    const color = d.tone ? pick(STATUS[d.tone], isDark) : d.colorCategory ? categoryColor(d.colorCategory, isDark) : categoricalColor(i, isDark);
    return { ...d, startAngle, endAngle, fraction, color, index: i };
  });
  // A single 100% segment sweeps exactly 2π, which makes its arc's start
  // and end points mathematically identical -- the SVG path degenerates to
  // nothing visible regardless of the large-arc-flag, rendering as a blank
  // ring with only the legend showing. Only ever possible for the one
  // segment carrying the entire total, so it's drawn as a plain filled
  // circle instead of an arc path in that one case.
  const soleSegment = segments.filter(s => s.value > 0).length === 1 ? segments.find(s => s.value > 0) : null;

  function arcPath(startAngle: number, endAngle: number): string {
    const x1 = cx + radius * Math.cos(startAngle), y1 = cy + radius * Math.sin(startAngle);
    const x2 = cx + radius * Math.cos(endAngle), y2 = cy + radius * Math.sin(endAngle);
    const ix1 = cx + innerRadius * Math.cos(endAngle), iy1 = cy + innerRadius * Math.sin(endAngle);
    const ix2 = cx + innerRadius * Math.cos(startAngle), iy2 = cy + innerRadius * Math.sin(startAngle);
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix2} ${iy2} Z`;
  }

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Distribution donut chart">
        {total === 0 ? (
          <circle cx={cx} cy={cy} r={radius - thickness / 2} fill="none" stroke={pick(CHROME.gridline, isDark)} strokeWidth={thickness} />
        ) : soleSegment ? (
          <circle
            cx={cx} cy={cy} r={radius - thickness / 2} fill="none" stroke={soleSegment.color} strokeWidth={thickness}
            onMouseEnter={() => setHoverIndex(soleSegment.index)} onMouseLeave={() => setHoverIndex(null)}
          >
            <title>{`${soleSegment.label}: ${soleSegment.value.toLocaleString()} (100%)`}</title>
          </circle>
        ) : (
          segments.map(seg => (
            <path
              key={seg.label}
              d={arcPath(seg.startAngle, seg.endAngle)}
              fill={seg.color}
              opacity={hoverIndex === null || hoverIndex === seg.index ? 1 : 0.35}
              stroke={pick(CHROME.surface, isDark)}
              strokeWidth={2}
              onMouseEnter={() => setHoverIndex(seg.index)}
              onMouseLeave={() => setHoverIndex(null)}
            >
              <title>{`${seg.label}: ${seg.value.toLocaleString()} (${(seg.fraction * 100).toFixed(1)}%)`}</title>
            </path>
          ))
        )}
        {centerLabel && (
          <>
            <text x={cx} y={cy - 4} textAnchor="middle" fontSize="20" fontWeight={700} fill={pick(CHROME.primaryInk, isDark)}>{centerLabel.value}</text>
            <text x={cx} y={cy + 16} textAnchor="middle" fontSize="10" fill={pick(CHROME.secondaryInk, isDark)}>{centerLabel.caption}</text>
          </>
        )}
      </svg>
      <ul className="flex flex-col gap-1.5 text-sm">
        {segments.map(seg => (
          <li key={seg.label} className="flex items-center gap-2 cursor-default" onMouseEnter={() => setHoverIndex(seg.index)} onMouseLeave={() => setHoverIndex(null)}>
            <span className="inline-block h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
            <span className="text-slate-600 dark:text-slate-300">{seg.label}</span>
            <span className="text-slate-400 dark:text-slate-500 tabular-nums">
              {seg.value.toLocaleString()}{showPercent && total > 0 ? ` (${(seg.fraction * 100).toFixed(1)}%)` : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
