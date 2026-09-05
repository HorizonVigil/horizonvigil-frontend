import { StatCard, type StatCardProps } from '../StatCard';

/**
 * StatCard itself has no onClick -- most of the Overview's KPI/Scan Health
 * cards need to be, so this is the one `<button>` wrapper every one of them
 * shares instead of copy-pasting the wrapper markup 9+ times. `disabled`
 * renders the card inert (no hover state, no cursor pointer, reduced
 * opacity) with `disabledReason` as a title-attribute tooltip -- for KPIs
 * like Exploitable/SLA Breached that have no real destination because the
 * underlying field doesn't exist yet, so a fake click target would be worse
 * than none.
 */
export function ClickableStatCard({
  onClick,
  disabled,
  disabledReason,
  ...statCardProps
}: StatCardProps & { onClick?: () => void; disabled?: boolean; disabledReason?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      title={disabled ? disabledReason : undefined}
      className={`text-left w-full rounded-xl ${disabled || !onClick ? 'opacity-60 cursor-default' : 'cursor-pointer'}`}
    >
      <StatCard {...statCardProps} />
    </button>
  );
}
