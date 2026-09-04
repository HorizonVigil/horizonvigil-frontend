import { useNavigate } from 'react-router-dom';
import { Icon, type IconName } from '../../icons';
import type { AttentionItem } from '../../../lib/cloudAccounts/overview';

/**
 * Spec §20 — the prioritised, actionable problem list. Critical items first,
 * each with a single next action. Rendered only when there's something to
 * show; a clean environment gets a small "all clear" line instead.
 */
export function AttentionRequired({ items }: { items: AttentionItem[] }) {
  const navigate = useNavigate();

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/20 px-4 py-3 flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
        <Icon name="shield-check" size={15} />
        Nothing needs your attention right now.
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/20 p-4">
      <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-3 flex items-center gap-1.5">
        <Icon name="alert-triangle" size={14} /> Attention Required
        <span className="ml-1 rounded-full bg-amber-200/70 dark:bg-amber-900/50 px-1.5 text-[11px] font-medium">{items.length}</span>
      </h3>
      <ul className="flex flex-col divide-y divide-amber-100 dark:divide-amber-900/40">
        {items.map((it) => (
          <li key={it.id} className="flex items-center justify-between gap-3 py-2.5">
            <span className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-200">
              <span className={`h-6 w-6 rounded-md flex items-center justify-center shrink-0 ${
                it.severity === 'critical'
                  ? 'bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400'
                  : 'bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400'
              }`}>
                <Icon name={it.icon as IconName} size={13} />
              </span>
              {it.text}
            </span>
            <button
              type="button"
              onClick={() => navigate(it.action.to)}
              className="shrink-0 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-slate-600 dark:text-slate-300 hover:border-brand-300 dark:hover:border-brand-600"
            >
              {it.action.label}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
