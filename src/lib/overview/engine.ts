/**
 * Overview Engine (issue §18).
 *
 * Pure transformation:
 *   resolved identity inputs
 *     → eligible
 *     → shown
 *     → prioritised
 *     → KPI/panel split
 *     → deterministic layout
 *
 * The returned OverviewConfig is also the contract shape that can later be
 * produced by a server-side GET /overview/config endpoint.
 *
 * IMPORTANT:
 * This module derives presentation eligibility only. Backend authorization
 * must independently enforce every protected operation.
 */
import type { Role } from '../navConfig';
import { REGISTRY_META } from './registryMeta';
import type {
  Capabilities,
  ContextSignals,
  EffectiveScope,
  OverviewConfig,
  OverviewPreferences,
  ResolvedWidget,
  WidgetLayoutRect,
  WidgetMeta,
} from './types';

const ROLE_RANK: Readonly<Record<Role, number>> = {
  viewer: 0,
  editor: 1,
  billing_admin: 2,
  admin: 3,
  owner: 4,
};

const GRID_COLS = 12;

/** Maximum number of KPI cards displayed in the strip. */
export const KPI_STRIP_LIMIT = 8;

export interface EngineInput {
  userId: string;
  role: Role;
  capabilities: Capabilities;
  enabledModules: ReadonlySet<string>;
  scope: EffectiveScope;
  preferences: OverviewPreferences;
  signals: ContextSignals;
}

/**
 * Widgets the current user is allowed to see.
 *
 * Eligibility requires all applicable constraints:
 * - module enabled;
 * - minimum role satisfied;
 * - every required capability present;
 * - at least one capability present when anyOf is declared.
 */
export function getEligibleMeta(input: {
  capabilities: Capabilities;
  enabledModules: ReadonlySet<string>;
  role: Role;
}): WidgetMeta[] {
  const { capabilities, enabledModules, role } = input;
  const roleRank = ROLE_RANK[role] ?? -1;

  return REGISTRY_META.filter((meta) => {
    if (meta.module !== null && !enabledModules.has(meta.module)) {
      return false;
    }

    if (
      meta.minRole &&
      roleRank < (ROLE_RANK[meta.minRole] ?? Number.POSITIVE_INFINITY)
    ) {
      return false;
    }

    if (!capabilities.hasAll(meta.requires)) {
      return false;
    }

    if (meta.anyOf && !capabilities.hasAny(meta.anyOf)) {
      return false;
    }

    return true;
  });
}

function isShown(
  meta: WidgetMeta,
  preferences: OverviewPreferences,
): boolean {
  const hidden =
    meta.kind === 'kpi'
      ? preferences.kpiHidden.includes(meta.id)
      : preferences.hidden.includes(meta.id);

  if (hidden) {
    return false;
  }

  if (meta.defaultEnabled === false) {
    return preferences.added.includes(meta.id);
  }

  return true;
}

function widgetsColumns(width: 1 | 2 | 3): number {
  return Math.min(width * 4, GRID_COLS);
}

function sanitizeLayoutRect(
  rect: WidgetLayoutRect,
): WidgetLayoutRect {
  const x = Number.isFinite(rect.x) ? rect.x : 0;
  const y = Number.isFinite(rect.y) ? rect.y : 0;
  const w = Number.isFinite(rect.w) ? rect.w : 1;
  const h = Number.isFinite(rect.h) ? rect.h : 1;

  return {
    x: Math.max(0, Math.min(GRID_COLS - 1, Math.trunc(x))),
    y: Math.max(0, Math.trunc(y)),
    w: Math.max(1, Math.min(GRID_COLS, Math.trunc(w))),
    h: Math.max(1, Math.trunc(h)),
  };
}

/**
 * Shelf-packs panels into a 12-column grid in priority order.
 *
 * This is intentionally deterministic. react-grid-layout may compact the
 * result later, but the engine always returns a valid starting arrangement.
 */
function autoPack(
  order: ReadonlyArray<{ id: string; w: number; h: number }>,
): Record<string, WidgetLayoutRect> {
  const out: Record<string, WidgetLayoutRect> = {};
  let x = 0;
  let y = 0;
  let rowH = 0;

  for (const item of order) {
    const w = Math.max(1, Math.min(GRID_COLS, Math.trunc(item.w)));
    const h = Math.max(1, Math.trunc(item.h));

    if (x > 0 && x + w > GRID_COLS) {
      y += rowH;
      x = 0;
      rowH = 0;
    }

    out[item.id] = {
      x,
      y,
      w,
      h,
    };

    x += w;
    rowH = Math.max(rowH, h);
  }

  return out;
}

function resolvePriority(
  meta: WidgetMeta,
  signals: ContextSignals,
  favorite: boolean,
): { priority: number; boostReason?: string } {
  let priority = Number.isFinite(meta.basePriority)
    ? meta.basePriority
    : Number.MAX_SAFE_INTEGER;

  const boost = meta.contextBoost?.(signals) ?? null;

  if (boost && Number.isFinite(boost.priority) && boost.priority > 0) {
    priority -= boost.priority;
  }

  // Favorite is a strong presentation preference, not an authorization
  // bypass. Keep it numerically dominant while retaining the original order
  // as a secondary deterministic tie-breaker.
  if (favorite) {
    priority -= 1000;
  }

  return {
    priority,
    boostReason: boost?.reason,
  };
}

function compareResolvedWidgets(
  a: ResolvedWidget,
  b: ResolvedWidget,
): number {
  return (
    a.priority - b.priority ||
    a.meta.basePriority - b.meta.basePriority ||
    a.meta.id.localeCompare(b.meta.id) ||
    a.meta.title.localeCompare(b.meta.title)
  );
}

function createResolvedWidget(
  meta: WidgetMeta,
  preferences: OverviewPreferences,
  signals: ContextSignals,
): ResolvedWidget {
  const favorite = preferences.favorites.includes(meta.id);
  const { priority, boostReason } = resolvePriority(
    meta,
    signals,
    favorite,
  );

  return {
    meta,
    layout: {
      x: 0,
      y: 0,
      w: widgetsColumns(meta.defaultSize.w),
      h: meta.defaultSize.h,
    },
    priority,
    favorite,
    boostReason,
  };
}

/**
 * Applies an explicit KPI order without making unspecified KPIs outrank one
 * another unpredictably. Duplicates in the saved order are harmless.
 */
function compareKpis(
  preferences: OverviewPreferences,
): (a: ResolvedWidget, b: ResolvedWidget) => number {
  const order = new Map<string, number>();

  for (let index = 0; index < preferences.kpiOrder.length; index += 1) {
    const id = preferences.kpiOrder[index];
    if (!order.has(id)) {
      order.set(id, index);
    }
  }

  return (a, b) => {
    const aIndex = order.get(a.meta.id);
    const bIndex = order.get(b.meta.id);

    if (aIndex !== undefined || bIndex !== undefined) {
      if (aIndex === undefined) return 1;
      if (bIndex === undefined) return -1;
      if (aIndex !== bIndex) return aIndex - bIndex;
    }

    return compareResolvedWidgets(a, b);
  };
}

function normalizeScope(scope: EffectiveScope): OverviewConfig['scope'] {
  return {
    orgId: scope.orgId,
    folders: scope.folders.map((folder) => folder.id),
    projects: scope.projects.map((project) => project.id),
    restricted: Boolean(scope.restricted),
    connectionIds:
      scope.connectionIds === 'all'
        ? 'all'
        : [...scope.connectionIds].filter(Boolean),
  };
}

export function buildOverviewConfig(
  input: EngineInput,
): OverviewConfig {
  const {
    userId,
    role,
    capabilities,
    enabledModules,
    scope,
    preferences,
    signals,
  } = input;

  const eligible = getEligibleMeta({
    capabilities,
    enabledModules,
    role,
  });

  const shown = eligible.filter((meta) =>
    isShown(meta, preferences),
  );

  const kpis = shown
    .filter((meta) => meta.kind === 'kpi')
    .map((meta) => createResolvedWidget(meta, preferences, signals))
    .sort(compareKpis(preferences));

  const panels = shown
    .filter((meta) => meta.kind === 'panel')
    .map((meta) => createResolvedWidget(meta, preferences, signals))
    .sort(compareResolvedWidgets);

  const packed = autoPack(
    panels.map((panel) => ({
      id: panel.meta.id,
      w: panel.layout.w,
      h: panel.layout.h,
    })),
  );

  for (const panel of panels) {
    const saved = preferences.layout[panel.meta.id];

    panel.layout = saved
      ? sanitizeLayoutRect(saved)
      : packed[panel.meta.id];
  }

  return {
    user: userId,
    role,
    scope: normalizeScope(scope),
    modules: [...enabledModules].sort(),
    capabilities: capabilities.list(),
    kpis: kpis.slice(0, KPI_STRIP_LIMIT),
    widgets: panels,
    signals,
  };
}
