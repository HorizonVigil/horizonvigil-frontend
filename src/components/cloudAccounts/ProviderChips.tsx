/**
 * Cloud Accounts — the shared "All clouds / AWS / Azure / GCP" chip row
 * (spec §6). Every tab that shows cloud accounts uses this so the provider
 * filter looks and behaves the same everywhere.
 *
 * - Interactive mode: pass `value` + `onChange` (`null` = all clouds).
 * - Status mode: pass `lockedTo` for tabs whose data source is one provider
 *   only — renders that provider active and the others disabled with a
 *   reason, no "All clouds", not clickable. Keeps the scope visible and
 *   consistent without pretending to be a filter it isn't.
 */
export type ProviderValue = 'aws' | 'azure' | 'gcp';

const CHIPS: { value: ProviderValue; label: string }[] = [
  { value: 'aws', label: 'AWS' },
  { value: 'azure', label: 'Azure' },
  { value: 'gcp', label: 'GCP' },
];

const chipClass = (active: boolean) =>
  `text-xs rounded-full px-2.5 py-1 border transition-colors ${
    active
      ? 'bg-brand-600 border-brand-600 text-white'
      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
  }`;

export function ProviderChips(
  props:
    | {
        value: ProviderValue | null;
        onChange: (next: ProviderValue | null) => void;
        counts?: Partial<Record<ProviderValue, number>>;
        unavailable?: ProviderValue[];
        unavailableReason?: string;
        lockedTo?: undefined;
        className?: string;
      }
    | {
        lockedTo: ProviderValue;
        lockedReason?: string;
        className?: string;
        value?: undefined;
        onChange?: undefined;
      },
) {
  const className = props.className ?? '';

  if (props.lockedTo) {
    const reason = props.lockedReason ?? 'Not available for the other providers on this tab yet';
    return (
      <div className={`flex items-center gap-1.5 flex-wrap ${className}`}>
        <span className="text-[11px] uppercase tracking-wide text-slate-400 mr-1">Cloud</span>
        {CHIPS.map((c) => {
          const active = c.value === props.lockedTo;
          return (
            <span
              key={c.value}
              title={active ? undefined : reason}
              className={`${chipClass(active)} ${active ? '' : 'opacity-40 cursor-not-allowed'}`}
            >
              {c.label}
            </span>
          );
        })}
      </div>
    );
  }

  const { value, onChange, counts, unavailable, unavailableReason = 'Not available for this provider yet' } = props;

  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${className}`}>
      <span className="text-[11px] uppercase tracking-wide text-slate-400 mr-1">Cloud</span>
      <button type="button" onClick={() => onChange(null)} className={chipClass(value === null)}>
        All clouds
      </button>
      {CHIPS.map((c) => {
        const count = counts?.[c.value];
        const isUnavailable = unavailable?.includes(c.value) ?? false;
        const disabled = isUnavailable || (counts != null && (count ?? 0) === 0);
        return (
          <button
            key={c.value}
            type="button"
            disabled={disabled}
            title={isUnavailable ? unavailableReason : undefined}
            onClick={() => onChange(c.value)}
            className={`${chipClass(value === c.value)} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            {c.label}
            {count != null && !isUnavailable && <span className="ml-1 tabular-nums opacity-70">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
