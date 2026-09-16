import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, type IconName } from '../../icons';
import type { AttentionItem } from '../../../lib/cloudAccounts/overview';

interface AttentionRequiredProps {
  items: AttentionItem[];
}

const EMPTY_STATE_ICON_SIZE = 15;
const ITEM_ICON_SIZE = 13;
const CRITICAL_SEVERITY = 'critical';

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function getItemKey(item: AttentionItem, index: number): string {
  const id = normalizeText(item.id);
  return id ? `attention-${id}` : `attention-fallback-${index}`;
}

function getActionLabel(item: AttentionItem): string {
  const label = normalizeText(item.action?.label);
  return label || 'View details';
}

function getActionPath(item: AttentionItem): string {
  return normalizeText(item.action?.to);
}

function getItemText(item: AttentionItem): string {
  const text = normalizeText(item.text);
  return text || 'Attention item requires review.';
}

function getIconName(item: AttentionItem): IconName {
  const icon = normalizeText(item.icon);

  // AttentionItem.icon is supplied by the overview domain model. Keep the
  // cast at this boundary rather than spreading unsafe casts through JSX.
  return icon as IconName;
}

/**
 * Spec §20 — prioritized, actionable problem list.
 *
 * Critical items are expected to be supplied first by the domain layer.
 * This component intentionally does not reorder the data so that backend/API
 * prioritization remains the single source of truth.
 *
 * Each item exposes one next action. Navigation is performed through
 * react-router rather than assigning window.location, preserving SPA
 * navigation behavior.
 *
 * When there are no items, a compact all-clear state is rendered.
 */
export function AttentionRequired({
  items,
}: AttentionRequiredProps) {
  const navigate = useNavigate();

  const safeItems = useMemo(
    () => (Array.isArray(items) ? items : []),
    [items],
  );

  if (safeItems.length === 0) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={[
          'flex items-center gap-2 rounded-xl border px-4 py-3 text-sm',
          'border-emerald-200 bg-emerald-50/60 text-emerald-700',
          'dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300',
        ].join(' ')}
      >
        <Icon
          name="shield-check"
          size={EMPTY_STATE_ICON_SIZE}
          aria-hidden="true"
        />
        <span>Nothing needs your attention right now.</span>
      </div>
    );
  }

  return (
    <section
      aria-labelledby="attention-required-title"
      className={[
        'rounded-xl border p-4',
        'border-amber-200 bg-amber-50/70',
        'dark:border-amber-900/60 dark:bg-amber-950/20',
      ].join(' ')}
    >
      <header className="mb-3 flex items-center gap-1.5">
        <Icon
          name="alert-triangle"
          size={14}
          aria-hidden="true"
        />

        <h3
          id="attention-required-title"
          className="text-sm font-semibold text-amber-800 dark:text-amber-300"
        >
          Attention Required
        </h3>

        <span
          aria-label={`${safeItems.length} attention ${
            safeItems.length === 1 ? 'item' : 'items'
          }`}
          className={[
            'ml-1 rounded-full px-1.5 text-[11px] font-medium',
            'bg-amber-200/70 text-amber-800',
            'dark:bg-amber-900/50 dark:text-amber-200',
          ].join(' ')}
        >
          {safeItems.length}
        </span>
      </header>

      <ul
        aria-label="Items requiring attention"
        className="flex flex-col divide-y divide-amber-100 dark:divide-amber-900/40"
      >
        {safeItems.map((item, index) => {
          const isCritical = item.severity === CRITICAL_SEVERITY;
          const actionLabel = getActionLabel(item);
          const actionPath = getActionPath(item);
          const itemText = getItemText(item);
          const iconName = getIconName(item);

          const severityClasses = isCritical
            ? [
                'bg-red-100 text-red-600',
                'dark:bg-red-950/50 dark:text-red-400',
              ].join(' ')
            : [
                'bg-amber-100 text-amber-600',
                'dark:bg-amber-950/50 dark:text-amber-400',
              ].join(' ');

          return (
            <li
              key={getItemKey(item, index)}
              className="flex items-center justify-between gap-3 py-2.5"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className={[
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
                    severityClasses,
                  ].join(' ')}
                >
                  <Icon name={iconName} size={ITEM_ICON_SIZE} />
                </span>

                <span
                  className="min-w-0 truncate text-sm text-slate-700 dark:text-slate-200"
                  title={itemText}
                >
                  {itemText}
                </span>
              </div>

              {actionPath ? (
                <button
                  type="button"
                  onClick={() => navigate(actionPath)}
                  aria-label={`${actionLabel}: ${itemText}`}
                  className={[
                    'shrink-0 rounded-md border bg-white px-2.5 py-1',
                    'text-xs font-medium text-slate-600',
                    'transition-colors',
                    'hover:border-brand-300 hover:text-brand-700',
                    'focus:outline-none focus-visible:ring-2',
                    'focus-visible:ring-brand-500 focus-visible:ring-offset-1',
                    'dark:border-slate-700 dark:bg-slate-900',
                    'dark:text-slate-300 dark:hover:border-brand-600',
                    'dark:hover:text-brand-300',
                    'dark:focus-visible:ring-offset-slate-900',
                  ].join(' ')}
                >
                  {actionLabel}
                </button>
              ) : (
                <span
                  aria-label="Action unavailable"
                  className={[
                    'shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium',
                    'border-slate-200 bg-slate-50 text-slate-400',
                    'dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-500',
                  ].join(' ')}
                >
                  {actionLabel}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
