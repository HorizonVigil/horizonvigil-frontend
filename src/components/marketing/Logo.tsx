import { Link } from 'react-router-dom';

/** Same brand mark as AppRail's in-app sidebar (h-9 w-9, bg-brand-600, "C") — the marketing site and the product should read as one thing, not two. */
export function Logo({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="flex items-center gap-2.5 shrink-0">
      <div className="h-9 w-9 rounded-lg bg-brand-600 text-white flex items-center justify-center font-bold text-sm">C</div>
      <span className="text-lg font-semibold text-slate-900 dark:text-white whitespace-nowrap">CloudOps360</span>
    </Link>
  );
}
