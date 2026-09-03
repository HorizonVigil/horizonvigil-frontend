/**
 * "Add widgets" drawer — every widget the user is eligible for (module +
 * capability) but doesn't currently have on their Overview, grouped by
 * category. Adding one flips it on in preferences.
 */
import { useMemo } from 'react';
import { Drawer } from '../Drawer';
import { Icon } from '../icons';
import { CATEGORY_LABELS, WIDGET_CATEGORIES, type WidgetMeta } from '../../lib/overview/types';

export function AddWidgetsDrawer({
  open, onClose, eligible, shownIds, onAdd,
}: {
  open: boolean;
  onClose: () => void;
  eligible: WidgetMeta[];
  shownIds: Set<string>;
  onAdd: (id: string) => void;
}) {
  const groups = useMemo(() => {
    const available = eligible.filter((m) => !shownIds.has(m.id));
    return WIDGET_CATEGORIES
      .map((cat) => ({ cat, items: available.filter((m) => m.category === cat).sort((a, b) => a.title.localeCompare(b.title)) }))
      .filter((g) => g.items.length > 0);
  }, [eligible, shownIds]);

  return (
    <Drawer open={open} onClose={onClose} title="Add widgets" wide>
      {groups.length === 0 ? (
        <p className="text-sm text-slate-400 py-8 text-center">Every widget you have access to is already on your Overview.</p>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((g) => (
            <div key={g.cat}>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">{CATEGORY_LABELS[g.cat]}</h3>
              <ul className="flex flex-col gap-2">
                {g.items.map((m) => (
                  <li key={m.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{m.title}</span>
                        {!m.integrated && <span className="text-[10px] uppercase tracking-wide rounded px-1 bg-slate-100 dark:bg-slate-800 text-slate-400">data pending</span>}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{m.description}</p>
                    </div>
                    <button type="button" onClick={() => onAdd(m.id)}
                      className="shrink-0 inline-flex items-center gap-1 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                      <Icon name="plus" size={12} /> Add
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Drawer>
  );
}
