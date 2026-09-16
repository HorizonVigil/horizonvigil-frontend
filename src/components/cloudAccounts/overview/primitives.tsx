import {
  Component,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../../icons';
import { useTheme } from '../../../lib/theme';
import { STATUS, pick } from '../../charts/palette';

export type Tone =
  | 'good'
  | 'warning'
  | 'serious'
  | 'critical'
  | 'neutral';

export interface SectionCardProps {
  title: string;
  icon?: IconName;
  to?: string;
  linkLabel?: string;
  onLinkClick?: () => void;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}

export interface MeterRowProps {
  label: string;
  percent: number | null;
  caption?: string;
  tone?: Tone;
}

export interface MiniStatProps {
  label: string;
  value: string;
  tone?: Tone;
}

export interface LockedSectionProps {
  title: string;
  reason: string;
}

export interface SectionErrorProps {
  label: string;
  onRetry?: () => void;
}

export interface SectionBoundaryProps {
  name: string;
  children: ReactNode;
}

interface SectionBoundaryState {
  error: Error | null;
}

const NEUTRAL_COLOR = {
  light: '#94a3b8',
  dark: '#475569',
} as const;

const METER_TRACK = {
  light: '#e2e8f0',
  dark: '#1e293b',
} as const;

const SECTION_ICON_SIZE = 14;
const METER_ICON_SIZE = 13;

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePercent(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return Math.min(100, Math.max(0, value));
}

function resolveTone(
  tone: Tone | undefined,
  percent: number | null,
): Tone {
  if (tone !== undefined) {
    return tone;
  }

  if (percent === null) {
    return 'neutral';
  }

  if (percent >= 95) {
    return 'good';
  }

  if (percent >= 80) {
    return 'warning';
  }

  if (percent >= 50) {
    return 'serious';
  }

  return 'critical';
}

function toneTextClass(tone: Tone): string {
  switch (tone) {
    case 'critical':
      return 'text-red-600 dark:text-red-400';

    case 'serious':
      return 'text-orange-600 dark:text-orange-400';

    case 'warning':
      return 'text-amber-600 dark:text-amber-400';

    case 'good':
      return 'text-emerald-600 dark:text-emerald-400';

    case 'neutral':
    default:
      return 'text-slate-900 dark:text-white';
  }
}

/**
 * Bordered dashboard section with a title row and an optional
 * navigation/action link.
 *
 * This component is intentionally presentational. Authorization, routing
 * decisions, and data loading remain responsibilities of the parent/domain
 * layer.
 */
export function SectionCard({
  title,
  icon,
  to,
  linkLabel,
  onLinkClick,
  right,
  children,
  className = '',
}: SectionCardProps) {
  const normalizedTitle = normalizeText(title);
  const headingId = `section-card-${createStableId(normalizedTitle)}`;

  const hasCustomRight = right !== undefined && right !== null;
  const hasLink = Boolean(to || onLinkClick);

  return (
    <section
      aria-labelledby={headingId}
      className={[
        'rounded-xl border bg-white p-4',
        'border-slate-200 dark:border-slate-800',
        'dark:bg-slate-900',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <header className="mb-3 flex items-center justify-between gap-3">
        <h3
          id={headingId}
          className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200"
        >
          {icon ? (
            <Icon
              name={icon}
              size={SECTION_ICON_SIZE}
              aria-hidden="true"
              className="shrink-0 text-slate-400 dark:text-slate-500"
            />
          ) : null}

          <span className="truncate">{normalizedTitle}</span>
        </h3>

        {hasCustomRight ? right : null}

        {!hasCustomRight && hasLink ? (
          to ? (
            <Link
              to={to}
              className={[
                'shrink-0 rounded-sm text-xs font-medium',
                'text-brand-600 dark:text-brand-400',
                'hover:underline',
                'focus:outline-none focus-visible:ring-2',
                'focus-visible:ring-brand-500',
              ].join(' ')}
            >
              {normalizeText(linkLabel) || 'View'}{' '}
              <span aria-hidden="true">→</span>
            </Link>
          ) : (
            <button
              type="button"
              onClick={onLinkClick}
              className={[
                'shrink-0 rounded-sm text-xs font-medium',
                'text-brand-600 dark:text-brand-400',
                'hover:underline',
                'focus:outline-none focus-visible:ring-2',
                'focus-visible:ring-brand-500',
              ].join(' ')}
            >
              {normalizeText(linkLabel) || 'View'}{' '}
              <span aria-hidden="true">→</span>
            </button>
          )
        ) : null}
      </header>

      {children}
    </section>
  );
}

/**
 * Labelled progress meter.
 *
 * Colour reinforces the value but does not carry the meaning alone.
 * Percentages are bounded to 0–100 before being used for layout.
 */
export function MeterRow({
  label,
  percent,
  caption,
  tone,
}: MeterRowProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const normalizedLabel =
    normalizeText(label) || 'Health signal';

  const normalizedPercent = normalizePercent(percent);
  const resolvedTone = resolveTone(
    tone,
    normalizedPercent,
  );

  const barColor =
    resolvedTone === 'neutral'
      ? pick(NEUTRAL_COLOR, isDark)
      : pick(STATUS[resolvedTone], isDark);

  const trackColor = pick(
    METER_TRACK,
    isDark,
  );

  const displayValue =
    normalizedPercent === null
      ? normalizeText(caption) || '—'
      : `${normalizedPercent}%`;

  return (
    <div
      className="grid min-w-0 grid-cols-[minmax(0,8rem)_minmax(0,1fr)_auto] items-center gap-2.5 text-xs"
      role="group"
      aria-label={`${normalizedLabel}: ${displayValue}`}
    >
      <span
        className="truncate text-slate-600 dark:text-slate-300"
        title={normalizedLabel}
      >
        {normalizedLabel}
      </span>

      <div
        className="h-2 min-w-0 overflow-hidden rounded-full"
        style={{ backgroundColor: trackColor }}
        role="progressbar"
        aria-label={normalizedLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={
          normalizedPercent === null
            ? undefined
            : normalizedPercent
        }
        aria-valuetext={displayValue}
      >
        <span
          aria-hidden="true"
          className="block h-full rounded-full transition-[width] duration-300"
          style={{
            width: `${normalizedPercent ?? 0}%`,
            backgroundColor: barColor,
          }}
        />
      </div>

      <span
        className={[
          'w-16 shrink-0 text-right font-medium tabular-nums',
          'text-slate-700 dark:text-slate-200',
        ].join(' ')}
      >
        {displayValue}
      </span>
    </div>
  );
}

/**
 * Small KPI figure used inside dashboard sections.
 */
export function MiniStat({
  label,
  value,
  tone,
}: MiniStatProps) {
  const normalizedLabel =
    normalizeText(label) || 'Metric';

  const normalizedValue =
    normalizeText(value) || '—';

  return (
    <div className="flex min-w-0 flex-col">
      <span
        className={[
          'truncate text-xl font-bold tabular-nums',
          toneTextClass(tone ?? 'neutral'),
        ].join(' ')}
        title={normalizedValue}
      >
        {normalizedValue}
      </span>

      <span
        className="truncate text-[11px] text-slate-400 dark:text-slate-500"
        title={normalizedLabel}
      >
        {normalizedLabel}
      </span>
    </div>
  );
}

/**
 * Permission-gated section placeholder.
 *
 * This is a presentation state only. Actual authorization must remain
 * enforced by the server/API layer.
 */
export function LockedSection({
  title,
  reason,
}: LockedSectionProps) {
  const normalizedTitle =
    normalizeText(title) || 'Restricted section';

  const normalizedReason =
    normalizeText(reason) ||
    'This section is not available for your role.';

  return (
    <SectionCard title={normalizedTitle}>
      <div
        role="status"
        className={[
          'flex items-center gap-2 py-3 text-xs',
          'text-slate-400 dark:text-slate-500',
        ].join(' ')}
      >
        <Icon
          name="lock"
          size={METER_ICON_SIZE}
          aria-hidden="true"
          className="shrink-0"
        />

        <span>{normalizedReason}</span>
      </div>
    </SectionCard>
  );
}

/**
 * Independent widget error.
 *
 * A section failure should not blank the entire dashboard.
 * The retry callback is supplied by the parent so the component does not
 * perform a hard browser reload or bypass the application's query/cache
 * layer.
 */
export function SectionError({
  label,
  onRetry,
}: SectionErrorProps) {
  const normalizedLabel =
    normalizeText(label) || 'this section';

  return (
    <div
      role="alert"
      className={[
        'flex items-start gap-2 rounded-md border px-3 py-2 text-xs',
        'border-amber-200 bg-amber-50 text-amber-700',
        'dark:border-amber-900/50 dark:bg-amber-950/30',
        'dark:text-amber-300',
      ].join(' ')}
    >
      <Icon
        name="alert-triangle"
        size={METER_ICON_SIZE}
        aria-hidden="true"
        className="mt-0.5 shrink-0"
      />

      <span>
        Couldn’t load {normalizedLabel}.
        {onRetry ? (
          <>
            {' '}
            <button
              type="button"
              onClick={onRetry}
              className={[
                'font-medium underline underline-offset-2',
                'focus:outline-none focus-visible:rounded-sm',
                'focus-visible:ring-2 focus-visible:ring-amber-600',
              ].join(' ')}
            >
              Retry
            </button>
          </>
        ) : null}
      </span>
    </div>
  );
}

/**
 * Isolates one Overview section.
 *
 * A render error in one widget results in a local fallback instead of taking
 * down the entire dashboard (Spec §33).
 *
 * IMPORTANT:
 * Error boundaries cannot recover automatically by simply rendering their
 * children again. The parent should change/remount the boundary when retrying
 * or use a query-level retry mechanism for data errors.
 */
export class SectionBoundary extends Component<
  SectionBoundaryProps,
  SectionBoundaryState
> {
  state: SectionBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(
    error: Error,
  ): SectionBoundaryState {
    return {
      error,
    };
  }

  componentDidCatch(
    error: Error,
    info: ErrorInfo,
  ): void {
    const name =
      normalizeText(this.props.name) ||
      'Unnamed section';

    // Keep diagnostics local to development unless the application has a
    // centralized telemetry integration. Do not expose stack traces to users.
    if (typeof console !== 'undefined') {
      console.error(
        `[Cloud Accounts Overview] "${name}" section failed to render:`,
        error,
        info.componentStack,
      );
    }
  }

  render(): ReactNode {
    const name =
      normalizeText(this.props.name) ||
      'This';

    if (this.state.error) {
      return (
        <div
          role="alert"
          aria-label={`${name} section unavailable`}
          className={[
            'flex items-center gap-2 rounded-xl border p-4 text-xs',
            'border-amber-200 bg-amber-50/60 text-amber-700',
            'dark:border-amber-900/50 dark:bg-amber-950/20',
            'dark:text-amber-300',
          ].join(' ')}
        >
          <Icon
            name="alert-triangle"
            size={METER_ICON_SIZE}
            aria-hidden="true"
            className="shrink-0"
          />

          <span>
            The {name} section couldn’t be shown.
          </span>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Produces a deterministic DOM-safe suffix from a section title.
 *
 * This is only used for accessibility IDs; it is not an authorization,
 * persistence, or identity mechanism.
 */
function createStableId(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

  return normalized || 'section';
}