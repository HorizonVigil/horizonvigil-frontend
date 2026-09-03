/**
 * "Why am I seeing this?" — renders the engine's {@link OverviewConfig}
 * (issue §14 shape) so the composition is inspectable: which identity,
 * capabilities, modules and scope produced this exact set of widgets.
 */
import { Drawer } from '../Drawer';
import { CATEGORY_LABELS, type OverviewConfig } from '../../lib/overview/types';

export function WhyDrawer({ open, onClose, config }: { open: boolean; onClose: () => void; config: OverviewConfig }) {
  const json = JSON.stringify(
    {
      user: config.user,
      role: config.role,
      scope: config.scope,
      modules: config.modules,
      capabilities: config.capabilities,
      signals: config.signals,
      kpis: config.kpis.map((k) => ({ id: k.meta.id, priority: k.priority, boost: k.boostReason })),
      widgets: config.widgets.map((w) => ({ id: w.meta.id, category: w.meta.category, priority: w.priority, layout: w.layout, boost: w.boostReason })),
    },
    null,
    2,
  );

  return (
    <Drawer open={open} onClose={onClose} title="How this Overview was built" wide>
      <div className="flex flex-col gap-4 text-sm">
        <p className="text-slate-500 dark:text-slate-400">
          Your Overview is composed from your identity, not a fixed template:
          <span className="font-medium text-slate-700 dark:text-slate-200"> role → capabilities → enabled modules → scope → eligible widgets → live risk signals → your layout</span>.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <Stat label="Role" value={config.role} />
          <Stat label="Modules enabled" value={String(config.modules.length)} />
          <Stat label="Capabilities" value={String(config.capabilities.length)} />
          <Stat label="Scope" value={config.scope.restricted ? `${Array.isArray(config.scope.connectionIds) ? config.scope.connectionIds.length : 0} accounts` : 'Unrestricted'} />
          <Stat label="KPIs shown" value={String(config.kpis.length)} />
          <Stat label="Widgets shown" value={String(config.widgets.length)} />
        </div>

        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Widgets by category</h3>
          <ul className="flex flex-wrap gap-1.5">
            {Object.entries(config.widgets.reduce<Record<string, number>>((acc, w) => {
              acc[w.meta.category] = (acc[w.meta.category] ?? 0) + 1;
              return acc;
            }, {})).map(([cat, n]) => (
              <li key={cat} className="text-xs rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-slate-600 dark:text-slate-300">
                {CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS] ?? cat}: {n}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Dashboard config (JSON)</h3>
          <pre className="max-h-[45vh] overflow-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
{json}
          </pre>
        </div>
      </div>
    </Drawer>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-sm font-medium text-slate-800 dark:text-slate-100 capitalize truncate">{value}</div>
    </div>
  );
}
