/**
 * Cloud Accounts — shared "All clouds / AWS / Azure / GCP" chip row (spec §6).
 *
 * Interactive mode:
 *   - `value` + `onChange`
 *   - `null` means all clouds
 *   - provider chips can expose scoped counts and unavailable states
 *
 * Locked/status mode:
 *   - `lockedTo` identifies the single provider represented by the data source
 *   - no "All clouds" option is shown
 *   - other providers are visibly disabled and non-interactive
 *
 * This component owns presentation and interaction semantics only. It does not
 * perform data fetching, authorization, or provider capability detection.
 */

export type ProviderValue = 'aws' | 'azure' | 'gcp';

type ProviderChip = {
  value: ProviderValue;
  label: string;
};

type ProviderCounts = Partial<Record<ProviderValue, number>>;

interface InteractiveProviderChipsProps {
  value: ProviderValue | null;
  onChange: (next: ProviderValue | null) => void;
  counts?: ProviderCounts;
  unavailable?: readonly ProviderValue[];
  unavailableReason?: string;
  lockedTo?: undefined;
  className?: string;
  ariaLabel?: string;
}

interface LockedProviderChipsProps {
  lockedTo: ProviderValue;
  lockedReason?: string;
  className?: string;
  ariaLabel?: string;
  value?: undefined;
  onChange?: undefined;
}

export type ProviderChipsProps =
  | InteractiveProviderChipsProps
  | LockedProviderChipsProps;

const CHIPS: readonly ProviderChip[] = [
  { value: 'aws', label: 'AWS' },
  { value: 'azure', label: 'Azure' },
  { value: 'gcp', label: 'GCP' },
] as const;

const DEFAULT_UNAVAILABLE_REASON =
  'Not available for this provider yet';

const DEFAULT_LOCKED_REASON =
  'Not available for the other providers on this tab yet';

function isProviderValue(value: unknown): value is ProviderValue {
  return value === 'aws' || value === 'azure' || value === 'gcp';
}

function normalizeCount(value: unknown): number | null {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    return null;
  }

  return Math.floor(value);
}

function normalizeReason(
  value: string | undefined,
  fallback: string,
): string {
  const normalized = value?.trim();
  return normalized || fallback;
}

function chipClass(active: boolean): string {
  return [
    'inline-flex items-center justify-center',
    'rounded-full border px-2.5 py-1',
    'text-xs font-medium leading-4',
    'transition-colors',
    'select-none',
    'focus:outline-none',
    'focus-visible:ring-2',
    'focus-visible:ring-brand-500',
    'focus-visible:ring-offset-1',
    'dark:focus-visible:ring-offset-slate-950',
    active
      ? [
          'border-brand-600 bg-brand-600 text-white',
          'dark:border-brand-500 dark:bg-brand-500',
        ].join(' ')
      : [
          'border-slate-200 text-slate-600',
          'hover:bg-slate-50',
          'dark:border-slate-700 dark:text-slate-300',
          'dark:hover:bg-slate-800',
        ].join(' '),
  ].join(' ');
}

function disabledChipClass(): string {
  return [
    'cursor-not-allowed',
    'opacity-40',
    'hover:bg-transparent',
    'dark:hover:bg-transparent',
  ].join(' ');
}

function providerLabel(provider: ProviderValue): string {
  switch (provider) {
    case 'aws':
      return 'AWS';
    case 'azure':
      return 'Azure';
    case 'gcp':
      return 'GCP';
    default:
      return provider;
  }
}

/**
 * Shared provider filter/status control used throughout Cloud Accounts.
 */
export function ProviderChips(props: ProviderChipsProps) {
  const className = props.className?.trim() ?? '';
  const ariaLabel =
    props.ariaLabel?.trim() || 'Cloud provider filter';

  if ('lockedTo' in props && props.lockedTo !== undefined) {
    const lockedTo = isProviderValue(props.lockedTo)
      ? props.lockedTo
      : 'aws';

    const reason = normalizeReason(
      props.lockedReason,
      DEFAULT_LOCKED_REASON,
    );

    return (
      <div
        role="group"
        aria-label={ariaLabel}
        className={[
          'flex flex-wrap items-center gap-1.5',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <span
          aria-hidden="true"
          className="mr-1 text-[11px] uppercase tracking-wide text-slate-400"
        >
          Cloud
        </span>

        {CHIPS.map((chip) => {
          const active = chip.value === lockedTo;

          return (
            <span
              key={chip.value}
              aria-current={active ? 'true' : undefined}
              aria-disabled={active ? undefined : 'true'}
              title={active ? undefined : reason}
              className={[
                chipClass(active),
                !active ? disabledChipClass() : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {chip.label}
            </span>
          );
        })}

        <span className="sr-only">
          {`This tab is limited to ${providerLabel(lockedTo)}. ${reason}`}
        </span>
      </div>
    );
  }

  const {
    value,
    onChange,
    counts,
    unavailable = [],
    unavailableReason,
  } = props;

  const normalizedUnavailable = new Set(
    unavailable.filter(isProviderValue),
  );

  const normalizedUnavailableReason = normalizeReason(
    unavailableReason,
    DEFAULT_UNAVAILABLE_REASON,
  );

  const hasCounts = counts !== undefined;

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={[
        'flex flex-wrap items-center gap-1.5',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span
        aria-hidden="true"
        className="mr-1 text-[11px] uppercase tracking-wide text-slate-400"
      >
        Cloud
      </span>

      <button
        type="button"
        aria-pressed={value === null}
        onClick={() => onChange(null)}
        className={chipClass(value === null)}
      >
        All clouds
      </button>

      {CHIPS.map((chip) => {
        const count = normalizeCount(counts?.[chip.value]);
        const unavailableForProvider = normalizedUnavailable.has(
          chip.value,
        );

        /*
         * A provider with a known zero count is disabled only when counts are
         * explicitly supplied. Without counts, the component must not infer
         * that a provider is unavailable.
         */
        const zeroCount = hasCounts && count === 0;
        const disabled = unavailableForProvider || zeroCount;
        const active = value === chip.value;

        const disabledReason = unavailableForProvider
          ? normalizedUnavailableReason
          : zeroCount
            ? `No ${chip.label} environments are available in the current scope`
            : undefined;

        return (
          <button
            key={chip.value}
            type="button"
            aria-pressed={active}
            aria-disabled={disabled ? 'true' : undefined}
            disabled={disabled}
            title={disabledReason}
            onClick={() => onChange(chip.value)}
            className={[
              chipClass(active),
              disabled ? disabledChipClass() : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span>{chip.label}</span>

            {count !== null && !unavailableForProvider ? (
              <span
                aria-label={`${count} ${chip.label} environment${count === 1 ? '' : 's'}`}
                className="ml-1 tabular-nums opacity-70"
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
