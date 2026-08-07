import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useOrg } from '../lib/orgContext';
import { useTheme } from '../lib/theme';
import { getEnvironmentLabel } from '../lib/environment';
import { CommandPalette } from './CommandPalette';

const ENV_STYLES: Record<string, string> = {
  prod: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
  test: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
  local: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
};

/**
 * Sits above Layout's <main> — org/module nav lives in AppRail+Sidebar,
 * this row is for cross-cutting, always-available actions: jump-to-anything,
 * real open-alert count, which environment you're looking at, and theme.
 * No fabricated data — the alert count is a real getActiveAlerts() call, and
 * degrades to nothing (not a fake "0") if it fails.
 */
export function TopBar() {
  const { theme, toggleTheme } = useTheme();
  const { currentOrg } = useOrg();
  const navigate = useNavigate();
  const env = getEnvironmentLabel();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [openAlertCount, setOpenAlertCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!currentOrg) { setOpenAlertCount(null); return; }
    api.getActiveAlerts({ limit: 1 })
      .then(res => { if (!cancelled) setOpenAlertCount(res.pagination.total); })
      .catch(() => { if (!cancelled) setOpenAlertCount(null); });
    return () => { cancelled = true; };
  }, [currentOrg]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isMeta = e.metaKey || e.ctrlKey;
      if (isMeta && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <>
      <div className="flex items-center justify-between gap-3 px-6 pt-3 pb-1">
        <button
          onClick={() => setPaletteOpen(true)}
          className="flex items-center gap-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-400 dark:text-slate-500 hover:border-slate-300 dark:hover:border-slate-600 hover:text-slate-500 dark:hover:text-slate-400 w-64"
          aria-label="Open command palette"
        >
          <span aria-hidden="true">⌘</span>
          <span className="flex-1 text-left">Jump to…</span>
          <kbd className="text-[10px] rounded border border-slate-200 dark:border-slate-700 px-1 py-0.5">⌘K</kbd>
        </button>

        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-medium uppercase tracking-wide rounded-full border px-2 py-0.5 ${ENV_STYLES[env]}`} title={`Connected to the ${env} environment`}>
            {env}
          </span>

          <button
            onClick={() => navigate('/alerts')}
            className="relative rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
            aria-label={openAlertCount ? `${openAlertCount} open alerts` : 'Alerts'}
            title={openAlertCount ? `${openAlertCount} open alert${openAlertCount === 1 ? '' : 's'}` : 'No open alerts'}
          >
            🔔
            {!!openAlertCount && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full bg-rose-600 text-white text-[10px] leading-4 text-center px-1 tabular-nums">
                {openAlertCount > 99 ? '99+' : openAlertCount}
              </span>
            )}
          </button>

          <button
            onClick={toggleTheme}
            className="text-xs rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {theme === 'dark' ? '☀ Light' : '☾ Dark'}
          </button>
        </div>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}
