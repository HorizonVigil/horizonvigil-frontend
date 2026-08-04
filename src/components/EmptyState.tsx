/**
 * A single reusable "nothing here yet" block, replacing the one-line gray
 * text every page previously hand-rolled inconsistently. Icon is a Unicode
 * glyph, matching navConfig.ts's existing icon convention rather than
 * pulling in an icon library this app has never depended on.
 */
export interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon = '○', title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <span aria-hidden="true" className="text-2xl text-slate-300 dark:text-slate-600">{icon}</span>
      <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{title}</p>
      {description && <p className="max-w-sm text-xs text-slate-400 dark:text-slate-500">{description}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-2 text-xs font-medium px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

/** Same layout, styled as an intentional roadmap notice rather than a bare "not built" wall — for capabilities that are genuinely planned, not yet live, so it reads as a deliberate scope statement instead of a dead end. */
export function RoadmapPanel({ icon = '◌', title, description }: { icon?: string; title: string; description: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
      <EmptyState icon={icon} title={title} description={description} />
    </div>
  );
}
