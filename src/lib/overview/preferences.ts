/**
 * Level-2 personalization (issue §15): per-user Overview preferences —
 * widget layout, hidden/added widgets, favorites, KPI order, and default
 * project / environment / date-range.
 *
 * Stored in `localStorage` keyed by user id (per-device; a server-side store
 * is a listed follow-up). Every read and write is wrapped in try/catch — a
 * private window, disabled storage, or a corrupt value must degrade to
 * "no preferences", never throw.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_PREFERENCES, type OverviewPreferences, type WidgetLayoutRect } from './types';
import type { DateRangePreset } from '../filterContext';

const KEY_PREFIX = 'horizonvigil.overview.v1.';

function storageKey(userId: string): string {
  return `${KEY_PREFIX}${userId || 'anon'}`;
}

/** Coerce an unknown parsed blob into a valid OverviewPreferences. */
export function normalizePreferences(raw: unknown): OverviewPreferences {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PREFERENCES };
  const r = raw as Record<string, unknown>;
  const strArray = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  const layout: Record<string, WidgetLayoutRect> = {};
  if (r.layout && typeof r.layout === 'object') {
    for (const [id, rect] of Object.entries(r.layout as Record<string, unknown>)) {
      const p = rect as Record<string, unknown>;
      if (['x', 'y', 'w', 'h'].every((k) => typeof p?.[k] === 'number')) {
        layout[id] = { x: p.x as number, y: p.y as number, w: p.w as number, h: p.h as number };
      }
    }
  }
  const d = (r.defaults ?? {}) as Record<string, unknown>;
  const dismissed: Record<string, number> = {};
  if (r.dismissedSignals && typeof r.dismissedSignals === 'object') {
    for (const [k, v] of Object.entries(r.dismissedSignals as Record<string, unknown>)) {
      if (typeof v === 'number') dismissed[k] = v;
    }
  }
  return {
    layout,
    hidden: strArray(r.hidden),
    favorites: strArray(r.favorites),
    added: strArray(r.added),
    kpiOrder: strArray(r.kpiOrder),
    kpiHidden: strArray(r.kpiHidden),
    defaults: {
      projectId: typeof d.projectId === 'string' ? d.projectId : undefined,
      environment: typeof d.environment === 'string' ? d.environment : undefined,
      dateRange: typeof d.dateRange === 'string' ? (d.dateRange as DateRangePreset) : undefined,
    },
    dismissedSignals: dismissed,
  };
}

function load(userId: string): OverviewPreferences {
  try {
    return normalizePreferences(JSON.parse(localStorage.getItem(storageKey(userId)) ?? 'null'));
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export interface UseOverviewPreferences {
  prefs: OverviewPreferences;
  setLayout: (layout: Record<string, WidgetLayoutRect>) => void;
  toggleHidden: (id: string, kind: 'kpi' | 'panel') => void;
  toggleFavorite: (id: string) => void;
  addWidget: (id: string) => void;
  removeWidget: (id: string, kind: 'kpi' | 'panel') => void;
  setKpiOrder: (order: string[]) => void;
  setDefaults: (d: Partial<OverviewPreferences['defaults']>) => void;
  dismissSignal: (key: string) => void;
  reset: () => void;
}

export function useOverviewPreferences(userId: string): UseOverviewPreferences {
  const [prefs, setPrefs] = useState<OverviewPreferences>(() => load(userId));
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reload when the identity changes (org switch, re-login).
  useEffect(() => { setPrefs(load(userId)); }, [userId]);

  // Debounced persistence — drag events fire dozens of layout updates.
  useEffect(() => {
    if (writeTimer.current) clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(() => {
      try { localStorage.setItem(storageKey(userId), JSON.stringify(prefs)); } catch { /* storage unavailable — keep in memory */ }
    }, 350);
    return () => { if (writeTimer.current) clearTimeout(writeTimer.current); };
  }, [prefs, userId]);

  const update = useCallback((fn: (p: OverviewPreferences) => OverviewPreferences) => {
    setPrefs((p) => fn(p));
  }, []);

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  return useMemo<UseOverviewPreferences>(() => ({
    prefs,
    setLayout: (layout) => update((p) => ({ ...p, layout })),
    toggleHidden: (id, kind) => update((p) => kind === 'kpi'
      ? { ...p, kpiHidden: toggle(p.kpiHidden, id) }
      : { ...p, hidden: toggle(p.hidden, id), added: p.added.filter((x) => x !== id) }),
    toggleFavorite: (id) => update((p) => ({ ...p, favorites: toggle(p.favorites, id) })),
    addWidget: (id) => update((p) => ({
      ...p,
      added: p.added.includes(id) ? p.added : [...p.added, id],
      hidden: p.hidden.filter((x) => x !== id),
      kpiHidden: p.kpiHidden.filter((x) => x !== id),
    })),
    removeWidget: (id, kind) => update((p) => kind === 'kpi'
      ? { ...p, kpiHidden: p.kpiHidden.includes(id) ? p.kpiHidden : [...p.kpiHidden, id], added: p.added.filter((x) => x !== id) }
      : { ...p, hidden: p.hidden.includes(id) ? p.hidden : [...p.hidden, id], added: p.added.filter((x) => x !== id) }),
    setKpiOrder: (order) => update((p) => ({ ...p, kpiOrder: order })),
    setDefaults: (dd) => update((p) => ({ ...p, defaults: { ...p.defaults, ...dd } })),
    dismissSignal: (key) => update((p) => ({ ...p, dismissedSignals: { ...p.dismissedSignals, [key]: Date.now() } })),
    reset: () => update(() => ({
      layout: {}, hidden: [], favorites: [], added: [], kpiOrder: [], kpiHidden: [], defaults: {}, dismissedSignals: {},
    })),
  }), [prefs, update]);
}
