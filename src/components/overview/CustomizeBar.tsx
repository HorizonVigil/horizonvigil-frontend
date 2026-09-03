/**
 * Sticky control bar shown while the Overview is in Customize mode — reset,
 * done, and the "sticky defaults" (default project / environment) that
 * pre-scope the Overview on future visits (issue §15 level 2).
 */
import { Icon } from '../icons';
import type { EffectiveScope, OverviewPreferences } from '../../lib/overview/types';

const ENVIRONMENTS = ['production', 'staging', 'dev', 'sandbox', 'qa', 'security', 'dr', 'legacy'];

export function CustomizeBar({
  scope, defaults, onSetDefault, onReset, onDone,
}: {
  scope: EffectiveScope;
  defaults: OverviewPreferences['defaults'];
  onSetDefault: (d: Partial<OverviewPreferences['defaults']>) => void;
  onReset: () => void;
  onDone: () => void;
}) {
  return (
    <div className="sticky top-0 z-20 mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-brand-200 dark:border-brand-900/60 bg-brand-50/80 dark:bg-brand-950/40 px-3 py-2 backdrop-blur">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-brand-700 dark:text-brand-300">
        <Icon name="sliders" size={13} /> Customizing — drag to reorder, drag a corner to resize
      </span>

      <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
        Default project
        <select
          value={defaults.projectId ?? ''}
          onChange={(e) => onSetDefault({ projectId: e.target.value || undefined })}
          className="text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-1"
        >
          <option value="">All projects</option>
          {scope.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>

      <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
        Default environment
        <select
          value={defaults.environment ?? ''}
          onChange={(e) => onSetDefault({ environment: e.target.value || undefined })}
          className="text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-1"
        >
          <option value="">All environments</option>
          {ENVIRONMENTS.map((env) => <option key={env} value={env}>{env}</option>)}
        </select>
      </label>

      <div className="ml-auto flex items-center gap-2">
        <button type="button" onClick={onReset} className="text-xs font-medium text-slate-600 dark:text-slate-300 hover:underline">
          Reset layout
        </button>
        <button type="button" onClick={onDone} className="text-xs font-medium rounded-md bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5">
          Done
        </button>
      </div>
    </div>
  );
}
