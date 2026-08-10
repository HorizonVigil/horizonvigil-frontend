import { Icon, type IconName } from './icons';

/**
 * A single reusable "nothing here yet" block, replacing the one-line gray
 * text every page previously hand-rolled inconsistently. Uses the
 * professional SVG icon system for a polished, enterprise look.
 */
export interface EmptyStateProps {
  icon?: IconName;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon = 'inbox', title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <span className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-1">
        <Icon name={icon} size={22} className="text-slate-400 dark:text-slate-500" />
      </span>
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

/** Same layout, styled as a deliberate product capability notice rather than a bare "not built" wall — for capabilities that are part of the roadmap, so it reads as a mature scope statement instead of a dead end. */
export function RoadmapPanel({ icon = 'layers', title, description }: { icon?: IconName; title: string; description: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
      <EmptyState icon={icon} title={title} description={description} />
    </div>
  );
}