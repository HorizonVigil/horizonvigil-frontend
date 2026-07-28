import { NavLink } from 'react-router-dom';
import { NAV_MODULES } from '../lib/navConfig';

/**
 * The persistent, always-visible switcher between the 15 domain apps — AWS
 * Console / Azure Portal / Datadog's service rail. This is the ONLY nav
 * element that shows all 15 at once; picking one takes you into that domain
 * and Sidebar.tsx then shows only that domain's own sub-nav, never the other
 * 14's. Clicking a module you're already inside just re-lands on its own
 * dashboard (mod.to) — a cheap, obvious "take me home" affordance.
 */
export function AppRail() {
  return (
    <aside className="w-14 shrink-0 h-screen sticky top-0 flex flex-col items-center gap-1 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-3">
      <div className="h-9 w-9 flex items-center justify-center rounded-lg bg-brand-600 text-white font-bold text-sm mb-2 shrink-0" title="CloudOps360">C</div>
      <nav className="flex-1 flex flex-col items-center gap-1 overflow-y-auto w-full px-1.5">
        {NAV_MODULES.map(mod => (
          mod.to ? (
            <NavLink
              key={mod.label}
              to={mod.to}
              title={mod.label}
              className={({ isActive }) =>
                `w-10 h-10 shrink-0 flex items-center justify-center rounded-lg text-base transition-colors ${
                  isActive
                    ? 'bg-brand-600 text-white'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`
              }
            >
              <span aria-hidden="true">{mod.icon}</span>
              <span className="sr-only">{mod.label}</span>
            </NavLink>
          ) : (
            <div
              key={mod.label}
              title={`${mod.label} — not built yet`}
              className="w-10 h-10 shrink-0 flex items-center justify-center rounded-lg text-base text-slate-300 dark:text-slate-700 cursor-default"
            >
              <span aria-hidden="true">{mod.icon}</span>
            </div>
          )
        ))}
      </nav>
    </aside>
  );
}
