import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { NAV_MODULES } from '../lib/navConfig';

export function AppRail() {
  const [expanded, setExpanded] = useState<boolean>(false);

  return (
    <aside
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      className={`${
        expanded ? 'w-64' : 'w-16'
      } h-screen sticky top-0 shrink-0 flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-all duration-300`}
    >
      {/* Header */}
      <div className="h-16 flex items-center px-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="h-9 w-9 rounded-lg bg-brand-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
          C
        </div>

        {expanded && (
          <span className="ml-3 text-lg font-semibold text-slate-900 dark:text-white whitespace-nowrap">
            CloudOps360
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <div className="flex flex-col gap-1">
          {NAV_MODULES.map((mod) =>
            mod.to ? (
              <NavLink
                key={mod.label}
                to={mod.to}
                title={mod.label}
                className={({ isActive }) =>
                  `flex items-center rounded-lg py-2 transition-colors ${
                    expanded
                      ? 'px-3 gap-3 justify-start'
                      : 'justify-center'
                  } ${
                    isActive
                      ? 'bg-brand-600 text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`
                }
              >
                <span className="w-6 text-lg flex justify-center shrink-0">
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
                title={`${mod.label} - not built yet`}
                className={`flex items-center rounded-lg py-2 text-slate-300 dark:text-slate-700 ${
                  expanded
                    ? 'px-3 gap-3 justify-start'
                    : 'justify-center'
                }`}
              >
                <span className="w-6 text-lg flex justify-center shrink-0">
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
        </div>
      </nav>
    </aside>
  );
}
