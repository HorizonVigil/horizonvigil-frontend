import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { getVisibleModules, type Role } from '../lib/navConfig';
import { useOrg } from '../lib/orgContext';
import { Icon, NAV_ICON_MAP } from './icons';
import horizonvigilIcon from '../assets/brand/horizonvigil-icon.svg';

export function AppRail() {
  const [expanded, setExpanded] = useState<boolean>(false);
  const { currentOrg, menuPermissions } = useOrg();
  const role = (currentOrg?.myRole as Role) ?? 'owner';
  const visibleModules = getVisibleModules(role, menuPermissions);

  return (
    <>
      {/* Permanent spacer — the rail itself is `fixed` below so it can grow
          on hover without pushing Sidebar/main content sideways every time
          the mouse crosses it. Without this, expanding to w-64 reflowed the
          entire page layout on every hover. */}
      <div className="w-16 h-screen shrink-0" aria-hidden="true" />
      <aside
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        className={`${
          expanded ? 'w-64 shadow-xl' : 'w-16'
        } fixed left-0 top-0 z-30 h-screen flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-all duration-300`}
      >
        {/* Header */}
        <div className="h-16 flex items-center px-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <img src={horizonvigilIcon} alt="HorizonVigil" className="h-9 w-9 rounded-lg shrink-0 shadow-sm" />

          {expanded && (
            <span className="ml-3 text-lg font-semibold text-slate-900 dark:text-white whitespace-nowrap">
              HorizonVigil
            </span>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          <div className="flex flex-col gap-1">
            {visibleModules.map((mod) => (
              <NavLink
                key={mod.label}
                to={mod.to ?? '/overview'}
                title={mod.label}
                className={({ isActive }) =>
                  `flex items-center rounded-lg py-2 transition-colors ${
                    expanded
                      ? 'px-3 gap-3 justify-start'
                      : 'justify-center'
                  } ${
                    isActive
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`
                }
              >
                <span className="w-6 flex justify-center shrink-0">
                  <Icon name={NAV_ICON_MAP[mod.label] ?? 'overview'} size={18} />
                </span>

                {expanded && (
                  <span className="text-sm font-medium whitespace-nowrap">
                    {mod.label}
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        </nav>

        {/* Footer */}
        <div className="px-3 py-3 border-t border-slate-200 dark:border-slate-800">
          <div className={`flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500 ${expanded ? '' : 'justify-center'}`}>
            <Icon name="shield-check" size={14} />
            {expanded && <span className="truncate">SOC 2 · Production</span>}
          </div>
        </div>
      </aside>
    </>
  );
}