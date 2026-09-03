/**
 * The Overview Engine (issue §18).
 *
 * Pure. Given the resolved identity inputs — role, capabilities, enabled
 * modules, scope, saved personalization and the current context signals — it
 * produces an {@link OverviewConfig}: the ordered, positioned set of KPIs and
 * widgets to render. That object is exactly the issue §14 shape and is the
 * reference for a future server-side `GET /overview/config`.
 *
 * Pipeline:
 *   eligible (module + capability + role)
 *     → shown (minus hidden, plus opted-in default-off)
 *     → prioritised (base weight − context boost − favorite bump)
 *     → split KPI / panel, sorted
 *     → auto-packed 12-col grid, then per-widget saved-layout overrides
 */
import type { Role } from '../navConfig';
import { REGISTRY_META } from './registryMeta';
import type {
  Capabilities, ContextSignals, EffectiveScope, OverviewConfig,
  OverviewPreferences, ResolvedWidget, WidgetLayoutRect, WidgetMeta,
} from './types';

const ROLE_RANK: Record<Role, number> = { viewer: 0, editor: 1, billing_admin: 2, admin: 3, owner: 4 };

const GRID_COLS = 12;
/** How many KPI cards the strip shows before the rest move to "Add widgets". */
export const KPI_STRIP_LIMIT = 8;

export interface EngineInput {
  userId: string;
  role: Role;
  capabilities: Capabilities;
  enabledModules: Set<string>;
  scope: EffectiveScope;
  preferences: OverviewPreferences;
  signals: ContextSignals;
}

/** Widgets the user is *allowed* to see — module enabled, role met, capabilities held. */
export function getEligibleMeta(input: {
  capabilities: Capabilities;
  enabledModules: Set<string>;
  role: Role;
}): WidgetMeta[] {
  const { capabilities, enabledModules, role } = input;
  return REGISTRY_META.filter((m) => {
    if (m.module !== null && !enabledModules.has(m.module)) return false;
    if (m.minRole && ROLE_RANK[role] < ROLE_RANK[m.minRole]) return false;
    if (!capabilities.hasAll(m.requires)) return false;
    if (m.anyOf && !capabilities.hasAny(m.anyOf)) return false;
    return true;
  });
}

function isShown(m: WidgetMeta, prefs: OverviewPreferences): boolean {
  if (m.kind === 'kpi') {
    if (prefs.kpiHidden.includes(m.id)) return false;
  } else if (prefs.hidden.includes(m.id)) {
    return false;
  }
  if (m.defaultEnabled === false) return prefs.added.includes(m.id);
  return true;
}

function widgetsColumns(w: 1 | 2 | 3): number {
  return w * 4; // 1→4, 2→8, 3→12
}

/** Shelf-pack panels into a 12-col grid in priority order — a sane starting layout; react-grid-layout compacts from here. */
function autoPack(order: { id: string; w: number; h: number }[]): Record<string, WidgetLayoutRect> {
  const out: Record<string, WidgetLayoutRect> = {};
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const item of order) {
    const w = Math.min(item.w, GRID_COLS);
    if (x + w > GRID_COLS) {
      y += rowH;
      x = 0;
      rowH = 0;
    }
    out[item.id] = { x, y, w, h: item.h };
    x += w;
    rowH = Math.max(rowH, item.h);
  }
  return out;
}

function resolvePriority(
  m: WidgetMeta,
  signals: ContextSignals,
  favorite: boolean,
): { priority: number; boostReason?: string } {
  let priority = m.basePriority;
  let boostReason: string | undefined;
  const boost = m.contextBoost?.(signals) ?? null;
  if (boost) {
    priority -= boost.priority;
    boostReason = boost.reason;
  }
  if (favorite) priority -= 1000;
  return { priority, boostReason };
}

export function buildOverviewConfig(input: EngineInput): OverviewConfig {
  const { userId, role, capabilities, enabledModules, scope, preferences, signals } = input;
  const favorites = new Set(preferences.favorites);

  const eligible = getEligibleMeta({ capabilities, enabledModules, role });
  const shown = eligible.filter((m) => isShown(m, preferences));

  const resolve = (m: WidgetMeta): ResolvedWidget => {
    const favorite = favorites.has(m.id);
    const { priority, boostReason } = resolvePriority(m, signals, favorite);
    return { meta: m, layout: { x: 0, y: 0, w: widgetsColumns(m.defaultSize.w), h: m.defaultSize.h }, priority, favorite, boostReason };
  };

  const bySort = (a: ResolvedWidget, b: ResolvedWidget) =>
    a.priority - b.priority ||
    a.meta.basePriority - b.meta.basePriority ||
    a.meta.title.localeCompare(b.meta.title);

  // KPIs — honour an explicit user order first, then priority.
  const kpis = shown.filter((m) => m.kind === 'kpi').map(resolve).sort((a, b) => {
    const ia = preferences.kpiOrder.indexOf(a.meta.id);
    const ib = preferences.kpiOrder.indexOf(b.meta.id);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    return bySort(a, b);
  });

  // Panels — priority order, then packed, then saved-layout overrides.
  const panels = shown.filter((m) => m.kind === 'panel').map(resolve).sort(bySort);
  const packed = autoPack(panels.map((p) => ({ id: p.meta.id, w: p.layout.w, h: p.layout.h })));
  for (const p of panels) {
    const saved = preferences.layout[p.meta.id];
    p.layout = saved ? { ...saved } : packed[p.meta.id];
  }

  return {
    user: userId,
    role,
    scope: {
      orgId: scope.orgId,
      folders: scope.folders.map((f) => f.id),
      projects: scope.projects.map((p) => p.id),
      restricted: scope.restricted,
      connectionIds: scope.connectionIds,
    },
    modules: [...enabledModules].sort(),
    capabilities: capabilities.list(),
    kpis,
    widgets: panels,
    signals,
  };
}
