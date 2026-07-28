import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { NAV_MODULES } from '../lib/navConfig';

export function AppRail() {
  const [expanded, setExpanded] = useState(false);

  return (
    <aside
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      className={`${
        expanded ? 'w-64' : 'w-16'
      } shrink-0 h-screen sticky top-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-3 transition-all duration-300`}
    >
      <div className="h-10 flex items-center px-4 mb-3">
        <div className="h-9 w-9 flex items-center justify-center rounded-lg bg-brand-600 text-white font-bold text-sm shrink-0">
          C
        </div>

        {expanded && (
          <span className="ml-3 text-lg font-semibold text-slate-900 dark:text-white whitespace-nowrap">
            CloudOps360
          </span>
        )}
      </div>

      <nav className="flex flex-col gap-1 px-2 overflow-y-auto">
        {NAV_MODULES.map((mod) =>
          mod.to ? (
            <NavLink
              key={mod.label}
              to={mod.to}
              title={mod.label}
              className={({ isActive }) =>
                `flex items-center ${
                  expanded ? 'justify-start gap-3 px-3' : 'justify-center px-0'
                } rounded-lg py-2 transition-colors ${
                  isActive
                    ? 'bg-brand-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`
              }
            >
              <span className="text-lg w-6 flex justify-center shrink-0">
                {mod.icon}
              </span>

              {expanded && (
                <span className="text-sm font-medium whitespace-nowrap">
                  {mod.label}
                </span>
              )}
            </NavLink>
          ) : (
            <div
              key={mod.label}
              title={`${mod.label} — not built yet`}
              className={`flex items-center ${
                expanded ? 'justify-start gap-3 px-3' : 'justify-center px-0'
              } rounded-lg py-2 text-slate-300 dark:text-slate-700 cursor-default`}
            >
              <span className="text-lg w-6 flex justify-center shrink-0">
                {mod.icon}
              </span>

              {expanded && (
                <span className="text-sm font-medium whitespace-nowrap">
                  {mod.label}
                </span>
              )}
            </div>
          )
        )}
      </nav>
    </aside>
  );
}
