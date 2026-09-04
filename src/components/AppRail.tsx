import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { getVisibleModules, type Role } from '../lib/navConfig';
import { useOrg } from '../lib/orgContext';
import { Icon, NAV_ICON_MAP } from './icons';
import horizonvigilIcon from '../assets/brand/horizonvigil-icon.svg';

/** Fixed display order for AppRail's section dividers — purely cosmetic,
 * unrelated to NAV_MODULES' own array order or to RBAC. A module with no
 * `section` (shouldn't happen once every module is tagged, but stays safe
 * if one is ever added without one) falls into its own untitled bucket at
 * the end rather than being dropped. */
const SECTION_ORDER = ['Get Started', 'Cloud Operations', 'Security', 'Platform'];

/** Buckets modules by `section` in SECTION_ORDER, preserving each module's
 * relative order within its bucket — never reorders NAV_MODULES itself. */
function groupBySection(modules: ReturnType<typeof getVisibleModules>) {
  const buckets = new Map<string, typeof modules>();
  for (const mod of modules) {
    const key = mod.section ?? '';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(mod);
  }
  const order = [...SECTION_ORDER, ...[...buckets.keys()].filter(k => k && !SECTION_ORDER.includes(k)), ''];
  return order.filter(k => buckets.has(k)).map(k => ({ section: k, modules: buckets.get(k)! }));
}

export function AppRail() {
  const [expanded, setExpanded] = useState<boolean>(false);
  const { currentOrg, menuPermissions } = useOrg();
  const role = (currentOrg?.myRole as Role) ?? 'owner';
  const visibleModules = getVisibleModules(role, menuPermissions);
  const sections = groupBySection(visibleModules);

  // In-flow flex child (not `fixed`): growing on hover reflows the page, so
  // `<main>` slides right to make room. `sticky top-0` keeps it in view while
  // the page scrolls.
  return (
    <aside
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      className={`${
        expanded ? 'w-64 shadow-xl' : 'w-16'
      } sticky top-0 z-30 h-screen shrink-0 flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-all duration-300`}
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
            {sections.map(({ section, modules }, i) => (
              <div key={section || '_untitled'} className={i > 0 ? 'mt-3' : ''}>
                {i > 0 && (
                  expanded ? (
                    section && (
                      <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 whitespace-nowrap">
                        {section}
                      </div>
                    )
                  ) : (
                    <div className="mx-3 mb-1 border-t border-slate-200 dark:border-slate-800" aria-hidden="true" />
                  )
                )}
                <div className="flex flex-col gap-1">
                  {modules.map((mod) => (
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
              </div>
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
  );
}