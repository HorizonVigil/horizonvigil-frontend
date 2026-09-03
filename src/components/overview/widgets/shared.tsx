/**
 * Shared building blocks for Overview widget components.
 *
 * Every widget is a small, self-fetching card: one scoped react-query call
 * via {@link useWidgetQuery}, then one of four render states — loading,
 * error, empty, or content — using the app's existing primitives
 * (chart-card, StatCard, EmptyState, Donut/BarChart/LineChart).
 *
 * `integrated: false` widgets skip the fetch entirely and render
 * {@link PendingBody}.
 */
import type { ReactNode } from 'react';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../../icons';
import { EmptyState } from '../../EmptyState';
import { Skeleton } from '../../Skeleton';

export { EmptyState } from '../../EmptyState';
import { friendlyErrorMessage } from '../../../lib/api';
import { scopeQueryKey, type Capability, type WidgetRenderContext } from '../../../lib/overview/types';

/** Standardised scoped query for a widget. Key = ['overview', <id>, <scope>, <dateRange>, <region>, ...extra]. */
export function useWidgetQuery<T>(
  id: string,
  ctx: WidgetRenderContext,
  queryFn: () => Promise<T>,
  opts?: { extraKey?: unknown[]; enabled?: boolean } & Partial<UseQueryOptions<T>>,
) {
  const { extraKey = [], enabled = true, ...rest } = opts ?? {};
  return useQuery<T>({
    queryKey: ['overview', id, scopeQueryKey(ctx.scope), ctx.dateRange, ctx.region, ...extraKey],
    queryFn,
    staleTime: 60_000,
    enabled: enabled && Boolean(ctx.scope.orgId),
    ...rest,
  });
}

export function WidgetLoading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2.5 py-1">
      <Skeleton className="h-7 w-24" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex justify-between gap-3">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-12" />
        </div>
      ))}
    </div>
  );
}

export function WidgetError({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
      <Icon name="alert-triangle" size={13} className="shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  );
}

/** Honest "capability/endpoint not wired yet" body for `integrated: false` widgets. */
export function PendingBody({ icon = 'layers', note, cta }: { icon?: IconName; note: string; cta?: { label: string; to: string } }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 px-4 py-8 text-center">
      <span className="h-9 w-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
        <Icon name={icon} size={16} className="text-slate-400 dark:text-slate-500" />
      </span>
      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs">{note}</p>
      {cta && (
        <Link to={cta.to} className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">
          {cta.label} →
        </Link>
      )}
    </div>
  );
}

/** Renders the standard loading / error / empty / content flow for a widget query. */
export function WidgetBody<T>({
  query,
  isEmpty,
  emptyIcon = 'inbox',
  emptyTitle,
  emptyDescription,
  errorLabel,
  children,
}: {
  query: { isLoading: boolean; isError: boolean; error: unknown; data: T | undefined };
  isEmpty: (data: T) => boolean;
  emptyIcon?: IconName;
  emptyTitle: string;
  emptyDescription?: string;
  errorLabel: string;
  children: (data: T) => ReactNode;
}) {
  if (query.isLoading) return <WidgetLoading />;
  if (query.isError || query.data === undefined) return <WidgetError message={friendlyErrorMessage(query.error, errorLabel)} />;
  if (isEmpty(query.data)) return <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />;
  return <>{children(query.data)}</>;
}

/** A compact KPI number for the KPI strip / kpi-kind widgets. */
export function KpiValue({
  label, value, caption, icon, tone, to, onClick,
}: {
  label: string; value: string; caption?: ReactNode; icon?: IconName;
  tone?: 'good' | 'warning' | 'serious' | 'critical' | 'neutral';
  to?: string; onClick?: () => void;
}) {
  const toneClass =
    tone === 'critical' ? 'text-red-600 dark:text-red-400'
    : tone === 'serious' ? 'text-orange-600 dark:text-orange-400'
    : tone === 'warning' ? 'text-amber-600 dark:text-amber-400'
    : tone === 'good' ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-slate-400 dark:text-slate-500';

  const inner = (
    <>
      <span className="exec-kpi-label flex items-center gap-1.5">
        {icon && <Icon name={icon} size={13} className="text-brand-500" />}
        {label}
      </span>
      <span className="exec-kpi-value">{value}</span>
      {caption != null && <span className={`text-xs font-medium ${toneClass}`}>{caption}</span>}
    </>
  );

  if (to || onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="exec-kpi-card text-left w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-xl"
      >
        {inner}
      </button>
    );
  }
  return <div className="exec-kpi-card">{inner}</div>;
}

/** A capability-gated action button (issue §12 — SEE vs DO). Renders nothing without the capability. */
export function WidgetAction({
  ctx, need, label, onClick, to, tone = 'default',
}: {
  ctx: WidgetRenderContext; need: Capability; label: string;
  onClick?: () => void; to?: string; tone?: 'default' | 'danger';
}) {
  if (!ctx.can.has(need)) return null;
  const cls = tone === 'danger'
    ? 'text-xs font-medium rounded-md border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 px-2 py-1 hover:bg-red-50 dark:hover:bg-red-950/30'
    : 'text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-800';
  if (to) return <Link to={to} className={cls}>{label}</Link>;
  return <button type="button" onClick={onClick} className={cls}>{label}</button>;
}

/** Small "N items · view all →" list footer. */
export function ViewAllLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="mt-2 inline-block text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">
      {label} →
    </Link>
  );
}

export function severityToneOf(sev: string): 'good' | 'warning' | 'serious' | 'critical' | 'neutral' {
  const s = sev.toLowerCase();
  if (s === 'critical') return 'critical';
  if (s === 'high') return 'serious';
  if (s === 'medium') return 'warning';
  if (s === 'low') return 'good';
  return 'neutral';
}
