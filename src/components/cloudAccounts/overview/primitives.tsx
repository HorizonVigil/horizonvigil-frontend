import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../../icons';
import { useTheme } from '../../../lib/theme';
import { STATUS, pick } from '../../charts/palette';

type Tone = 'good' | 'warning' | 'serious' | 'critical' | 'neutral';

/** Bordered dashboard section with a title row and an optional "→ elsewhere" link. */
export function SectionCard({
  title,
  icon,
  to,
  linkLabel,
  onLinkClick,
  right,
  children,
  className = '',
}: {
  title: string;
  icon?: IconName;
  to?: string;
  linkLabel?: string;
  onLinkClick?: () => void;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 ${className}`}>
      <header className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
          {icon && <Icon name={icon} size={14} className="text-slate-400 dark:text-slate-500" />}
          {title}
        </h3>
        {right}
        {!right && (to || onLinkClick) && (
          to ? (
            <Link to={to} className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline shrink-0">
              {linkLabel ?? 'View'} →
            </Link>
          ) : (
            <button type="button" onClick={onLinkClick} className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline shrink-0">
              {linkLabel ?? 'View'} →
            </button>
          )
        )}
      </header>
      {children}
    </section>
  );
}

/** A labelled progress meter: "Permissions ▸▸▸▸▸░░ 82%". Colour reinforces, never carries meaning alone. */
export function MeterRow({
  label,
  percent,
  caption,
  tone,
}: {
  label: string;
  percent: number | null;
  caption?: string;
  tone?: Tone;
}) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const resolvedTone: Tone =
    tone ?? (percent === null ? 'neutral' : percent >= 95 ? 'good' : percent >= 80 ? 'warning' : percent >= 50 ? 'serious' : 'critical');
  const barColor = resolvedTone === 'neutral' ? pick({ light: '#94a3b8', dark: '#475569' }, isDark) : pick(STATUS[resolvedTone], isDark);
  const track = pick({ light: '#e2e8f0', dark: '#1e293b' }, isDark);

  return (
    <div className="grid grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-2.5 text-xs">
      <span className="truncate text-slate-600 dark:text-slate-300" title={label}>{label}</span>
      <span className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: track }}>
        <span className="block h-full rounded-full" style={{ width: `${percent ?? 0}%`, backgroundColor: barColor }} />
      </span>
      <span className="tabular-nums font-medium text-slate-700 dark:text-slate-200 w-16 text-right">
        {percent === null ? (caption ?? '—') : `${percent}%`}
      </span>
    </div>
  );
}

/** Small KPI figure used inside sections (not the top StatCard strip). */
export function MiniStat({ label, value, tone }: { label: string; value: string; tone?: Tone }) {
  const toneClass =
    tone === 'critical' ? 'text-red-600 dark:text-red-400'
    : tone === 'serious' ? 'text-orange-600 dark:text-orange-400'
    : tone === 'warning' ? 'text-amber-600 dark:text-amber-400'
    : tone === 'good' ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-slate-900 dark:text-white';
  return (
    <div className="flex flex-col">
      <span className={`text-xl font-bold tabular-nums ${toneClass}`}>{value}</span>
      <span className="text-[11px] text-slate-400 dark:text-slate-500">{label}</span>
    </div>
  );
}

/** "Not available for your role" placeholder used when a permission-gated section is intentionally shown but locked. */
export function LockedSection({ title, reason }: { title: string; reason: string }) {
  return (
    <SectionCard title={title}>
      <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500 py-3">
        <Icon name="lock" size={13} />
        {reason}
      </div>
    </SectionCard>
  );
}

/** Independent widget error — one section failing must not blank the dashboard (spec §33). */
export function SectionError({ label }: { label: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
      <Icon name="alert-triangle" size={13} className="shrink-0 mt-0.5" />
      <span>Couldn’t load {label}. <button type="button" onClick={() => window.location.reload()} className="underline">Retry</button></span>
    </div>
  );
}

/**
 * Isolates one Overview section — a render error in a single widget shows a
 * small inline notice instead of taking down the whole dashboard (spec §33).
 */
export class SectionBoundary extends Component<{ name: string; children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[Cloud Accounts Overview] "${this.props.name}" section failed to render:`, error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/20 p-4 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
          <Icon name="alert-triangle" size={13} className="shrink-0" />
          The {this.props.name} section couldn’t be shown.
        </div>
      );
    }
    return this.props.children;
  }
}
