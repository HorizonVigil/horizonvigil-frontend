import { useMemo } from 'react';
import { Icon } from '../../icons';
import { ProviderMark } from './ProviderMark';
import {
  PROVIDER_UNIT,
  PROVIDERS,
  type OverviewAggregate,
  type Provider,
} from '../../../lib/cloudAccounts/overview';

export interface ProviderCardsProps {
  agg: OverviewAggregate;
  activeFilter: Provider | null;
  onSelect: (provider: Provider | null) => void;
}

const MIN_HEALTH_PERCENT = 0;
const MAX_HEALTH_PERCENT = 100;

function normalizeNonNegative(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    return 0;
  }

  return value;
}

function normalizePercent(value: unknown): number | null {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value)
  ) {
    return null;
  }

  return Math.min(
    MAX_HEALTH_PERCENT,
    Math.max(MIN_HEALTH_PERCENT, value),
  );
}

function formatCount(value: unknown): string {
  return normalizeNonNegative(value).toLocaleString();
}

function providerHealthClass(
  healthPercent: number | null,
): string {
  if (healthPercent === null) {
    return 'text-slate-400 dark:text-slate-500';
  }

  if (healthPercent >= 90) {
    return 'text-emerald-600 dark:text-emerald-400';
  }

  if (healthPercent >= 60) {
    return 'text-amber-600 dark:text-amber-400';
  }

  return 'text-red-600 dark:text-red-400';
}

function providerStatusLabel(
  healthPercent: number | null,
): string {
  if (healthPercent === null) {
    return 'Health unavailable';
  }

  if (healthPercent >= 90) {
    return 'Healthy';
  }

  if (healthPercent >= 60) {
    return 'Warning';
  }

  return 'Critical';
}

function normalizeProviderUnit(
  provider: Provider,
): string {
  const value = PROVIDER_UNIT[provider];

  return typeof value === 'string' && value.trim()
    ? value
    : 'environments';
}

function Dot() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-current"
    />
  );
}

/**
 * Spec §7 + §44.2 — AWS / Azure / GCP / Total cards.
 *
 * Provider cards expose the aggregate data supplied by the Overview domain
 * layer. Selecting a provider updates the parent dashboard filter; selecting
 * the already-active provider clears that filter.
 *
 * This component is intentionally presentational:
 * - It does not calculate provider health.
 * - It does not perform navigation.
 * - It does not perform API requests.
 * - Server-side authorization remains authoritative.
 */
export function ProviderCards({
  agg,
  activeFilter,
  onSelect,
}: ProviderCardsProps) {
  const providerCards = useMemo(
    () =>
      PROVIDERS.map((provider) => {
        const providerData = agg.perProvider[provider];

        const total = normalizeNonNegative(
          providerData?.total,
        );
        const healthy = normalizeNonNegative(
          providerData?.healthy,
        );
        const warning = normalizeNonNegative(
          providerData?.warning,
        );
        const critical = normalizeNonNegative(
          providerData?.critical,
        );
        const unknown = normalizeNonNegative(
          providerData?.unknown,
        );
        const healthPercent = normalizePercent(
          providerData?.healthPercent,
        );

        return {
          provider,
          total,
          healthy,
          warning,
          critical,
          unknown,
          healthPercent,
          unit: normalizeProviderUnit(provider),
        };
      }),
    [agg],
  );

  const totalData = useMemo(
    () => ({
      total: normalizeNonNegative(agg.totals.total),
      healthy: normalizeNonNegative(agg.totals.healthy),
      critical: normalizeNonNegative(agg.totals.critical),
      healthPercent: normalizePercent(
        agg.totals.healthPercent,
      ),
    }),
    [agg],
  );

  return (
    <div
      className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      aria-label="Cloud provider overview"
    >
      {providerCards.map((card) => {
        const isActive = activeFilter === card.provider;
        const dimmed =
          activeFilter !== null && !isActive;

        const healthLabel =
          card.healthPercent === null
            ? providerStatusLabel(null)
            : `${providerStatusLabel(
                card.healthPercent,
              )}, ${card.healthPercent}%`;

        return (
          <button
            key={card.provider}
            type="button"
            onClick={() =>
              onSelect(
                isActive ? null : card.provider,
              )
            }
            aria-pressed={isActive}
            aria-label={`${card.provider}: ${formatCount(
              card.total,
            )} ${card.unit}. ${healthLabel}. ${
              isActive
                ? 'Selected. Activate to clear filter.'
                : 'Activate to filter the dashboard.'
            }`}
            className={[
              'min-w-0 rounded-xl border bg-white p-4 text-left',
              'transition-[border-color,box-shadow,opacity]',
              'focus:outline-none focus-visible:ring-2',
              'focus-visible:ring-brand-500 focus-visible:ring-offset-1',
              'dark:bg-slate-900 dark:focus-visible:ring-offset-slate-950',
              isActive
                ? [
                    'border-brand-400 ring-1 ring-brand-200',
                    'dark:border-brand-500 dark:ring-brand-800',
                  ].join(' ')
                : [
                    'border-slate-200 hover:border-brand-300',
                    'dark:border-slate-800 dark:hover:border-brand-700',
                  ].join(' '),
              dimmed ? 'opacity-55' : 'opacity-100',
            ].join(' ')}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span
                aria-hidden="true"
                className="shrink-0"
              >
                <ProviderMark
                  provider={card.provider}
                />
              </span>

              {card.healthPercent !== null ? (
                <span
                  className={[
                    'shrink-0 text-xs font-semibold tabular-nums',
                    providerHealthClass(
                      card.healthPercent,
                    ),
                  ].join(' ')}
                >
                  {card.healthPercent}%
                </span>
              ) : (
                <span className="shrink-0 text-xs font-medium text-slate-400 dark:text-slate-500">
                  —
                </span>
              )}
            </div>

            <div className="truncate text-2xl font-bold leading-tight tabular-nums text-slate-900 dark:text-white">
              {formatCount(card.total)}
            </div>

            <div className="mb-2 truncate text-xs text-slate-400 dark:text-slate-500">
              {card.unit}
            </div>

            <div
              className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]"
              aria-label={`${card.provider} status breakdown`}
            >
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <Dot />
                <span>{formatCount(card.healthy)}</span>
                <span className="sr-only">healthy</span>
              </span>

              {card.warning > 0 ? (
                <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                  <Dot />
                  <span>{formatCount(card.warning)}</span>
                  <span className="sr-only">warning</span>
                </span>
              ) : null}

              {card.critical > 0 ? (
                <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                  <Dot />
                  <span>{formatCount(card.critical)}</span>
                  <span className="sr-only">critical</span>
                </span>
              ) : null}

              {card.unknown > 0 ? (
                <span className="flex items-center gap-1 text-slate-400 dark:text-slate-500">
                  <Dot />
                  <span>{formatCount(card.unknown)}</span>
                  <span className="sr-only">unknown</span>
                </span>
              ) : null}
            </div>
          </button>
        );
      })}

      <div
        className={[
          'min-w-0 rounded-xl border p-4',
          'border-slate-200 bg-gradient-to-br from-brand-50 to-white',
          'dark:border-slate-800 dark:from-brand-950/40 dark:to-slate-900',
        ].join(' ')}
        role="group"
        aria-label="Total cloud environments"
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <span
            aria-hidden="true"
            className={[
              'flex h-[22px] w-[22px] shrink-0 items-center justify-center',
              'rounded-md bg-brand-100 dark:bg-brand-900/50',
            ].join(' ')}
          >
            <Icon
              name="cloud"
              size={14}
              aria-hidden="true"
              className="text-brand-600 dark:text-brand-300"
            />
          </span>

          {totalData.healthPercent !== null ? (
            <span className="shrink-0 text-xs font-semibold tabular-nums text-brand-700 dark:text-brand-300">
              {totalData.healthPercent}%
            </span>
          ) : (
            <span className="shrink-0 text-xs font-medium text-slate-400 dark:text-slate-500">
              —
            </span>
          )}
        </div>

        <div className="truncate text-2xl font-bold leading-tight tabular-nums text-slate-900 dark:text-white">
          {formatCount(totalData.total)}
        </div>

        <div className="mb-2 truncate text-xs text-slate-400 dark:text-slate-500">
          total environments
        </div>

        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]"
          aria-label="Total environment status breakdown"
        >
          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <Dot />
            <span>
              {formatCount(totalData.healthy)}
            </span>
            <span className="sr-only">
              healthy
            </span>
          </span>

          {totalData.critical > 0 ? (
            <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
              <Dot />
              <span>
                {formatCount(totalData.critical)}
              </span>
              <span className="sr-only">
                failed
              </span>
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}