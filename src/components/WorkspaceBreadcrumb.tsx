import { Link } from 'react-router-dom';

export interface Crumb { label: string; to?: string }

/** Drill-down path within a module workspace (e.g. Resources › Networking › VPC) —
 * distinct from Breadcrumb.tsx, which tracks Organization › Folder › Project scope. */
export function WorkspaceBreadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav className="text-xs text-slate-400 dark:text-slate-500" aria-label="Workspace breadcrumb">
      {items.map((item, i) => (
        <span key={i}>
          {i > 0 && <span className="mx-1">›</span>}
          {item.to && i !== items.length - 1 ? (
            <Link to={item.to} className="hover:text-slate-600 dark:hover:text-slate-300 hover:underline">{item.label}</Link>
          ) : (
            <span className={i === items.length - 1 ? 'text-slate-500 dark:text-slate-400' : ''}>{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
