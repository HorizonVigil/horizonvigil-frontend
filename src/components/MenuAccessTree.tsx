import { useState } from 'react';
import { NAV_MODULES, submenuKey } from '../lib/navConfig';
import { type MenuPermissionLevel, type MenuPermissionRow } from '../lib/api';
import { Icon } from './icons';

export const MENU_LEVELS: { value: MenuPermissionLevel; label: string }[] = [
  { value: 'none', label: 'No Access' },
  { value: 'read', label: 'Read' },
  { value: 'write', label: 'Write' },
  { value: 'admin', label: 'Admin' },
];

interface MenuAccessTreeProps {
  overrides: MenuPermissionRow[];
  /** Present in user mode (shows the role-derived default when there's no override). Absent in group mode (a group has no role of its own — no grant means no grant, not a default level). */
  effective?: Record<string, MenuPermissionLevel>;
  onLevelChange: (menuKey: string, level: MenuPermissionLevel) => void;
  onReset: (menuKey: string, overrideId: string) => void;
}

/**
 * Expandable menu/submenu access tree — each top-level module can be
 * expanded to reveal its own real (non-planned) children, each with its own
 * independent No Access/Read/Write/Admin grant. Shared between the per-user
 * and per-group Menu Access modals in UsersGroups.tsx; the only behavioral
 * difference between the two is whether `effective` is supplied.
 */
export function MenuAccessTree({ overrides, effective, onLevelChange, onReset }: MenuAccessTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const isGroupMode = !effective;

  function toggle(icon: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(icon)) next.delete(icon);
      else next.add(icon);
      return next;
    });
  }

  function renderRow(menuKey: string, label: string, indent: boolean) {
    const override = overrides.find((o) => o.menu_key === menuKey);
    const level = isGroupMode ? (override?.level ?? '') : (effective?.[menuKey] ?? 'read');
    return (
      <div key={menuKey} className={`flex items-center justify-between gap-2 text-xs py-0.5 ${indent ? 'pl-6' : ''}`}>
        <span className="text-slate-600 dark:text-slate-300 truncate">{label}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          {override && (
            <button
              onClick={() => onReset(menuKey, override.id)}
              title={isGroupMode ? 'Remove this group grant' : 'Revert to role default'}
              className="text-[10px] text-slate-400 hover:text-brand-600 dark:hover:text-brand-400"
            >
              reset
            </button>
          )}
          <select
            value={level}
            onChange={(e) => onLevelChange(menuKey, e.target.value as MenuPermissionLevel)}
            className={`rounded-md border px-1.5 py-1 text-[11px] ${override ? 'border-brand-300 dark:border-brand-700 text-brand-700 dark:text-brand-300' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'} bg-white dark:bg-slate-800`}
          >
            {isGroupMode && <option value="" disabled>No grant set — choose a level to add one</option>}
            {MENU_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </div>
      </div>
    );
  }

  return (
    <div className="max-h-96 overflow-y-auto flex flex-col">
      {NAV_MODULES.map((mod) => {
        const realChildren = mod.children.filter((c) => c.real);
        const isExpanded = expanded.has(mod.icon);
        return (
          <div key={mod.icon} className="border-b border-slate-50 dark:border-slate-800/60 last:border-0 py-0.5">
            <div className="flex items-center gap-1">
              {realChildren.length > 0 ? (
                <button
                  onClick={() => toggle(mod.icon)}
                  title={isExpanded ? 'Collapse submenus' : 'Expand submenus'}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 shrink-0 p-0.5"
                >
                  <Icon name={isExpanded ? 'chevron-down' : 'chevron-right'} size={12} />
                </button>
              ) : (
                <span className="w-[18px] shrink-0" />
              )}
              <div className="flex-1 min-w-0">{renderRow(mod.icon, mod.label, false)}</div>
            </div>
            {isExpanded && realChildren.map((child) => renderRow(submenuKey(mod.icon, child.label), child.label, true))}
          </div>
        );
      })}
    </div>
  );
}
