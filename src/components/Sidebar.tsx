import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Icon } from './icons';
import { ScopePicker } from './ScopePicker';

interface SidebarProps {
  /** Below `lg` (1024px) the sidebar is an off-canvas drawer, closed by
   * default — there's no width left to show it inline once AppRail's 64px
   * and this sidebar's 256px are both accounted for on a 768-1024px
   * viewport. `open`/`onClose` only matter below that breakpoint; at `lg`
   * and up the sidebar is always visible regardless of this prop. */
  open: boolean;
  onClose: () => void;
}

/**
 * The org / folder / project scope selector for every module, plus the
 * account footer. Module switching happens in AppRail; tab switching within
 * a module happens in that page's own tab bar. This panel used to also
 * render the module's tab list and an always-expanded folder tree — both
 * removed: the tab list was the page's own tab bar shown twice, and the
 * folder tree is now the single {@link ScopePicker} dropdown.
 */
export function Sidebar({ open, onClose }: SidebarProps) {
  const { signOut, user } = useAuth();
  const location = useLocation();

  // Below `lg` the drawer should get out of the way the moment navigation
  // actually happens (matches the standard off-canvas-drawer convention) --
  // harmless above `lg`, where `open` is ignored by the responsive classes
  // on the <aside> below anyway.
  useEffect(() => { onClose(); }, [location.pathname, onClose]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop — below `lg` only, and only while the drawer is open.
          Clicking it closes the drawer, same as Escape. */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={`w-64 shrink-0 h-screen flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900
          fixed top-0 z-40 transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full'}
          lg:static lg:z-auto lg:translate-x-0 lg:transition-none lg:sticky lg:top-0`}
      >
        <div className="px-4 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between gap-2 lg:hidden mb-3">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Menu</span>
            <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close menu">
              <Icon name="x" size={16} />
            </button>
          </div>
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1">Scope</span>
          <ScopePicker />
        </div>

        <div className="flex-1" />

        <div className="px-3 py-3 border-t border-slate-200 dark:border-slate-800 text-xs">
          <div className="truncate text-slate-500 dark:text-slate-400">{user?.email}</div>
          <button onClick={() => void signOut()} className="text-brand-600 dark:text-brand-400 hover:underline mt-1 flex items-center gap-1">
            <Icon name="log-out" size={12} />
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
