/**
 * The draggable / resizable widget grid (issue §15 level 2 — user layout).
 *
 * react-grid-layout in a single 12-col breakpoint. Read-only until the user
 * enters Customize mode, where drag + resize become live and every change is
 * persisted to preferences (localStorage).
 */
import { useMemo } from 'react';
import RGL, { WidthProvider, type Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import type { OverviewConfig, WidgetLayoutRect, WidgetRenderContext } from '../../lib/overview/types';
import { WidgetFrame } from './WidgetFrame';

const GridLayout = WidthProvider(RGL);
const ROW_HEIGHT = 34;
const COLS = 12;

export function OverviewGrid({
  config, ctx, customizing, favorites, onLayoutChange, onToggleFavorite, onHide, onResize,
}: {
  config: OverviewConfig;
  ctx: WidgetRenderContext;
  customizing: boolean;
  favorites: Set<string>;
  onLayoutChange: (next: Record<string, WidgetLayoutRect>) => void;
  onToggleFavorite: (id: string) => void;
  onHide: (id: string) => void;
  onResize: (id: string, w: 1 | 2 | 3) => void;
}) {
  const layout: Layout[] = useMemo(
    () => config.widgets.map((w) => ({
      i: w.meta.id,
      x: Math.min(w.layout.x, COLS - 1),
      y: w.layout.y,
      w: Math.min(w.layout.w, COLS),
      h: w.layout.h,
      minW: w.meta.minSize?.w ?? Math.min(4, w.layout.w),
      minH: w.meta.minSize?.h ?? 3,
    })),
    [config.widgets],
  );

  return (
    <GridLayout
      className="-mx-1"
      layout={layout}
      cols={COLS}
      rowHeight={ROW_HEIGHT}
      margin={[12, 12]}
      isDraggable={customizing}
      isResizable={customizing}
      draggableHandle=".rgl-drag-handle"
      compactType="vertical"
      onLayoutChange={(next: Layout[]) => {
        if (!customizing) return;
        const map: Record<string, WidgetLayoutRect> = {};
        let changed = false;
        for (const l of next) {
          map[l.i] = { x: l.x, y: l.y, w: l.w, h: l.h };
          const prev = config.widgets.find((w) => w.meta.id === l.i)?.layout;
          if (!prev || prev.x !== l.x || prev.y !== l.y || prev.w !== l.w || prev.h !== l.h) changed = true;
        }
        if (changed) onLayoutChange(map);
      }}
    >
      {config.widgets.map((w) => (
        <div key={w.meta.id} className={customizing ? 'ring-1 ring-brand-300/60 dark:ring-brand-500/40 rounded-xl' : ''}>
          <WidgetFrame
            widget={w}
            ctx={ctx}
            customizing={customizing}
            isFavorite={favorites.has(w.meta.id)}
            onToggleFavorite={() => onToggleFavorite(w.meta.id)}
            onHide={() => onHide(w.meta.id)}
            onResize={(cols) => onResize(w.meta.id, cols)}
          />
        </div>
      ))}
    </GridLayout>
  );
}
