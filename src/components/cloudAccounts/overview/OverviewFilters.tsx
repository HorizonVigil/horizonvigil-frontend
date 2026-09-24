import type { ReactNode } from 'react';
import { useCallback, useId, useMemo } from 'react';
import { Icon } from '../../icons';
import {
  PROVIDER_LABEL,
  PROVIDERS,
  type Provider,
} from '../../../lib/cloudAccounts/overview';

export type TimePreset = '7d' | '30d' | '90d';

export const TIME_DAYS: Readonly<Record<TimePreset, number>> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
} as const;

const TIME_LABEL: Readonly<Record<TimePreset, string>> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
} as const;

const REGIONS = [
  'all',
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'ca-central-1',
  'sa-east-1',
  'eu-west-1',
  'eu-west-2',
  'eu-central-1',
  'eu-north-1',
  'ap-south-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
  'ap-northeast-2',
] as const;

export type OverviewRegion = (typeof REGIONS)[number];

export interface OverviewFilterState {
  provider: Provider | null;
  region: string;
  time: TimePreset;
}

export const DEFAULT_OVERVIEW_FILTERS: OverviewFilterState = {
  provider: null,
  region: 'all',
  time: '30d',
} as const;

interface OverviewFiltersProps {
  value: OverviewFilterState;
  onChange: (next: OverviewFilterState) => void;
  updatedAt: number | null;
  onRefresh: () => void;
  refreshing: boolean;
}

interface SelectProps {
  id: string;
  label: string;
  value: string;
  active?: boolean;
  onChange: (value: string) => void;
  children: ReactNode;
}

const FILTER_GROUP_LABEL = 'Overview filters';
const UPDATED_LABEL = 'Last updated';

function isTimePreset(value: string): value is TimePreset {
  return value === '7d' || value === '30d' || value === '90d';
}

function isProvider(value: string): value is Provider {
  return (PROVIDERS as readonly string[]).includes(value);
}

function isValidTimestamp(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0
  );
}

function normalizeFilterState(
  value: OverviewFilterState,
): OverviewFilterState {
  const provider =
    value.provider === null || isProvider(String(value.provider))
      ? value.provider
      : null;

  const region =
    typeof value.region === 'string' && value.region.trim()
      ? value.region
      : DEFAULT_OVERVIEW_FILTERS.region;

  const time = isTimePreset(value.time)
    ? value.time
    : DEFAULT_OVERVIEW_FILTERS.time;

  return {
    provider,
    region,
    time,
  };
}

function filtersEqual(
  left: OverviewFilterState,
  right: OverviewFilterState,
): boolean {
  return (
    left.provider === right.provider &&
    left.region === right.region &&
    left.time === right.time
  );
}

function relativeTime(timestamp: number, now = Date.now()): string {
  if (!isValidTimestamp(timestamp)) {
    return '';
  }

  const deltaSeconds = Math.round((now - timestamp) / 1000);

  if (deltaSeconds < 0) {
    const futureSeconds = Math.abs(deltaSeconds);

    if (futureSeconds < 60) {
      return 'in less than a minute';
    }

    if (futureSeconds < 3600) {
      return `in ${Math.ceil(futureSeconds / 60)}m`;
    }

    return `in ${Math.ceil(futureSeconds / 3600)}h`;
  }

  if (deltaSeconds < 60) {
    return 'just now';
  }

  if (deltaSeconds < 3600) {
    return `${Math.floor(deltaSeconds / 60)}m ago`;
  }

  if (deltaSeconds < 86400) {
    return `${Math.floor(deltaSeconds / 3600)}h ago`;
  }

  return `${Math.floor(deltaSeconds / 86400)}d ago`;
}

/**
 * Spec §6 — global Overview filters.
 *
 * Provider filters the composed Overview view client-side.
 * Region and time range are passed to the resources dashboard query.
 *
 * Organization / folder / account filters require the aggregation API from
 * §39–40 and are intentionally outside this component's contract.
 *
 * The refresh control represents an explicit data refresh request supplied by
 * the parent. This component does not perform network requests itself.
 */
export function OverviewFilters({
  value,
  onChange,
  updatedAt,
  onRefresh,
  refreshing,
}: OverviewFiltersProps) {
  const ids = useId();

  const normalizedValue = useMemo(
    () => normalizeFilterState(value),
    [value],
  );

  const dirty = useMemo(
    () =>
      !filtersEqual(
        normalizedValue,
        DEFAULT_OVERVIEW_FILTERS,
      ),
    [normalizedValue],
  );

  const updatedLabel = useMemo(() => {
    if (!isValidTimestamp(updatedAt)) {
      return null;
    }

    const relative = relativeTime(updatedAt);

    return relative ? `${UPDATED_LABEL} ${relative}` : null;
  }, [updatedAt]);

  const setFilter = useCallback(
    <K extends keyof OverviewFilterState>(
      key: K,
      nextValue: OverviewFilterState[K],
    ) => {
      const next = {
        ...normalizedValue,
        [key]: nextValue,
      } as OverviewFilterState;

      onChange(normalizeFilterState(next));
    },
    [normalizedValue, onChange],
  );

  const handleProviderChange = useCallback(
    (nextValue: string) => {
      if (nextValue === 'all') {
        setFilter('provider', null);
        return;
      }

      if (isProvider(nextValue)) {
        setFilter('provider', nextValue);
      }
    },
    [setFilter],
  );

  const handleTimeChange = useCallback(
    (nextValue: string) => {
      if (isTimePreset(nextValue)) {
        setFilter('time', nextValue);
      }
    },
    [setFilter],
  );

  const handleRegionChange = useCallback(
    (nextValue: string) => {
      if (nextValue === 'all' || nextValue.trim() !== '') {
        setFilter('region', nextValue);
      }
    },
    [setFilter],
  );

  const handleClear = useCallback(() => {
    onChange({
      ...DEFAULT_OVERVIEW_FILTERS,
    });
  }, [onChange]);

  return (
    <div
      className="flex flex-wrap items-end justify-between gap-3"
      aria-label={FILTER_GROUP_LABEL}
    >
      <div className="flex flex-wrap items-end gap-2">
        <Select
          id={`${ids}-provider`}
          label="Cloud"
          value={normalizedValue.provider ?? 'all'}
          active={normalizedValue.provider !== null}
          onChange={handleProviderChange}
        >
          <option value="all">All providers</option>

          {PROVIDERS.map((provider) => (
            <option
              key={provider}
              value={provider}
            >
              {PROVIDER_LABEL[provider]}
            </option>
          ))}
        </Select>

        <Select
          id={`${ids}-region`}
          label="Region"
          value={normalizedValue.region}
          active={normalizedValue.region !== 'all'}
          onChange={handleRegionChange}
        >
          {REGIONS.map((region) => (
            <option
              key={region}
              value={region}
            >
              {region === 'all'
                ? 'All regions'
                : region}
            </option>
          ))}
        </Select>

        <Select
          id={`${ids}-time`}
          label="Time"
          value={normalizedValue.time}
          active={normalizedValue.time !== '30d'}
          onChange={handleTimeChange}
        >
          {(Object.keys(TIME_LABEL) as TimePreset[]).map(
            (preset) => (
              <option
                key={preset}
                value={preset}
              >
                {TIME_LABEL[preset]}
              </option>
            ),
          )}
        </Select>

        {dirty ? (
          <button
            type="button"
            onClick={handleClear}
            className={[
              'pb-1.5 text-xs text-slate-500',
              'transition-colors hover:text-slate-700 hover:underline',
              'focus:outline-none focus-visible:rounded-sm',
              'focus-visible:ring-2 focus-visible:ring-brand-500',
              'dark:text-slate-400 dark:hover:text-slate-200',
            ].join(' ')}
          >
            Clear
          </button>
        ) : null}
      </div>

      <div className="flex items-center gap-2 pb-0.5">
        {updatedLabel ? (
          <span
            className="whitespace-nowrap text-[11px] text-slate-400 dark:text-slate-500"
            role="status"
            aria-live="polite"
          >
            {updatedLabel}
          </span>
        ) : null}

        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label={
            refreshing
              ? 'Refreshing overview data'
              : 'Refresh overview data'
          }
          aria-busy={refreshing}
          className={[
            'flex items-center gap-1.5 rounded-md border px-2 py-1.5',
            'text-xs font-medium transition-colors',
            'border-slate-200 text-slate-600',
            'hover:border-brand-300 hover:text-brand-700',
            'focus:outline-none focus-visible:ring-2',
            'focus-visible:ring-brand-500 focus-visible:ring-offset-1',
            'disabled:cursor-not-allowed disabled:opacity-60',
            'dark:border-slate-700 dark:text-slate-300',
            'dark:hover:border-brand-600 dark:hover:text-brand-300',
            'dark:focus-visible:ring-offset-slate-900',
          ].join(' ')}
        >
          <Icon
            name="refresh-cw"
            size={12}
            aria-hidden="true"
            className={refreshing ? 'animate-spin' : undefined}
          />

          <span>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </span>
        </button>
      </div>
    </div>
  );
}

function Select({
  id,
  label,
  value,
  active = false,
  onChange,
  children,
}: SelectProps) {
  return (
    <label
      htmlFor={id}
      className="flex flex-col gap-1"
    >
      <span className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </span>

      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={[
          'rounded-md border bg-white px-2 py-1.5 text-sm',
          'text-slate-700 transition-colors',
          'focus:outline-none focus-visible:ring-2',
          'focus-visible:ring-brand-500',
          'dark:bg-slate-900 dark:text-slate-200',
          active
            ? [
                'border-brand-400 ring-1 ring-brand-200',
                'dark:border-brand-500 dark:ring-brand-800',
              ].join(' ')
            : [
                'border-slate-200',
                'dark:border-slate-700',
              ].join(' '),
        ].join(' ')}
      >
        {children}
      </select>
    </label>
  );
}