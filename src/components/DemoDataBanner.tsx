import { Icon } from './icons';
import { useDemoData } from '../lib/demoData/context';

/**
 * Renders on any screen currently showing lib/demoData/seed.ts output --
 * deliberately loud (amber, dashed border) and distinct from the app's
 * normal chrome, so simulated numbers can never be mistaken for a real
 * customer's data. Also the off-switch, so turning demo mode off is always
 * one click away from wherever it's visible.
 */
export function DemoDataBanner() {
  const { toggle } = useDemoData();

  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-dashed border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
      <span className="flex items-center gap-2">
        <Icon name="sparkles" size={13} className="shrink-0" />
        Showing simulated enterprise-scale data for UI demonstration — not connected to real accounts.
      </span>
      <button
        type="button"
        onClick={toggle}
        className="shrink-0 rounded-md border border-amber-300 dark:border-amber-800 px-2 py-1 font-medium hover:bg-amber-100 dark:hover:bg-amber-900/40"
      >
        Turn off demo data
      </button>
    </div>
  );
}

/** Small pill for a page header's controls row -- toggles demo mode on when
 * it's off, so there's a way IN to the demo, not just a way out via the banner. */
export function DemoDataToggle() {
  const { enabled, toggle } = useDemoData();

  return (
    <button
      type="button"
      onClick={toggle}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
        enabled
          ? 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300'
          : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
      }`}
      title="Preview this screen with simulated enterprise-scale data"
    >
      <Icon name="sparkles" size={13} />
      {enabled ? 'Demo data on' : 'Preview demo data'}
    </button>
  );
}
