/**
 * Card chrome for one Overview widget: title bar (category dot, favorite
 * star, overflow menu), a widget-scoped error boundary so one broken widget
 * can't blank the page, and a drag handle in customize mode.
 */
import { Component, useState, type ErrorInfo, type ReactNode } from 'react';
import { NAV_MODULES } from '../../lib/navConfig';
import { Icon } from '../icons';
import { CATEGORY_LABELS, type ResolvedWidget, type WidgetRenderContext } from '../../lib/overview/types';
import { getWidgetComponent } from './registry';

const CATEGORY_DOT: Record<string, string> = {
  platform: 'bg-sky-500',
  finops: 'bg-emerald-500',
  devops: 'bg-violet-500',
  iac: 'bg-amber-500',
  security: 'bg-rose-500',
  observability: 'bg-cyan-500',
  operations: 'bg-blue-500',
};

export class WidgetErrorBoundary extends Component<{ title: string; children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Overview widget "${this.props.title}" crashed:`, error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex items-start gap-2 rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-300">
          <Icon name="alert-triangle" size={13} className="shrink-0 mt-0.5" />
          <span>This widget hit an error and was isolated. {this.state.error.message}</span>
        </div>
      );
    }
    return this.props.children;
  }
}

export function WidgetFrame({
  widget, ctx, customizing, isFavorite, onToggleFavorite, onHide, onResize,
}: {
  widget: ResolvedWidget;
  ctx: WidgetRenderContext;
  customizing: boolean;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onHide: () => void;
  onResize: (w: 1 | 2 | 3) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { meta } = widget;
  const Component = getWidgetComponent(meta.id);
  const moduleTo = meta.module ? NAV_MODULES.find((m) => m.icon === meta.module)?.to : undefined;

  return (
    <div className="h-full flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <div className={`flex items-center gap-2 px-3 py-2 border-b border-slate-100 dark:border-slate-800 ${customizing ? 'rgl-drag-handle cursor-move' : ''}`}>
        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${CATEGORY_DOT[meta.category] ?? 'bg-slate-400'}`} title={CATEGORY_LABELS[meta.category]} />
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate flex-1">{meta.title}</h3>
        {widget.boostReason && !customizing && (
          <span className="hidden sm:inline text-[10px] font-medium text-amber-600 dark:text-amber-400 truncate max-w-[45%]" title={widget.boostReason}>
            ↑ {widget.boostReason}
          </span>
        )}
        <button type="button" onClick={onToggleFavorite} aria-label={isFavorite ? 'Unfavorite' : 'Favorite'}
          className="shrink-0 text-slate-300 hover:text-amber-400 dark:text-slate-600">
          <Icon name={isFavorite ? 'star-filled' : 'star'} size={13} className={isFavorite ? 'text-amber-400' : undefined} />
        </button>
        <div className="relative shrink-0">
          <button type="button" onClick={() => setMenuOpen((o) => !o)} aria-label="Widget menu" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <Icon name="more" size={14} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-20 w-44 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1 text-xs">
                {moduleTo && (
                  <button type="button" onClick={() => { setMenuOpen(false); ctx.navigate(moduleTo); }}
                    className="w-full text-left px-3 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                    Open module →
                  </button>
                )}
                <button type="button" onClick={() => { setMenuOpen(false); onToggleFavorite(); }}
                  className="w-full text-left px-3 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                  {isFavorite ? 'Remove favorite' : 'Add to favorites'}
                </button>
                <div className="flex items-center gap-1 px-3 py-1.5 text-slate-400">
                  Size:
                  {([1, 2, 3] as const).map((w) => (
                    <button key={w} type="button" onClick={() => { setMenuOpen(false); onResize(w); }}
                      className="rounded border border-slate-200 dark:border-slate-700 px-1.5 hover:bg-slate-50 dark:hover:bg-slate-800">
                      {w === 1 ? 'S' : w === 2 ? 'M' : 'L'}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => { setMenuOpen(false); onHide(); }}
                  className="w-full text-left px-3 py-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30">
                  Hide widget
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-auto p-3">
        <WidgetErrorBoundary title={meta.title}>
          {Component ? <Component ctx={ctx} /> : <p className="text-xs text-slate-400">Widget unavailable.</p>}
        </WidgetErrorBoundary>
      </div>
    </div>
  );
}
