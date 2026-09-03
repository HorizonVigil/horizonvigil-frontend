/**
 * Shared types for the dynamic Overview engine.
 *
 * This file is deliberately runtime-import-free (only `import type`) so the
 * pure engine/registry-metadata layers that depend on it stay importable
 * from the vitest environment — anything in lib/api.ts's import chain throws
 * at module load when VITE_SUPABASE_URL is unset (see lib/featureFlags.ts's
 * own comment), and the engine + its tests must never pull that in.
 */
import type { FC } from 'react';
import type { Role } from '../navConfig';
import type { DateRangePreset } from '../filterContext';
import type { FolderRow, ProjectRow } from '../api';
import type { UnifiedAccountRow } from '../unifiedAccounts';

export type { Role };

/**
 * Granular, domain-scoped capabilities. Derived on the frontend from the
 * user's org role + per-module menu-permission level (see
 * lib/overview/capabilities.ts) — the backend exposes only the coarse
 * role + menu_permissions today, so this is the seam a real
 * `GET /permissions` endpoint would later replace.
 *
 * `.read`  → may see the data.
 * `.manage` / `.investigate` / `.optimize` / `.security` → may act on it in
 *   the normal case.
 * `.remediate` / `.execute` → may run a privileged/irreversible action.
 *
 * Widgets gate their *body* on `.read` and each *action button* on the
 * matching higher capability (issue §12: what a user can SEE and what they
 * can DO are separate axes).
 */
export type Capability =
  | 'cloud.read' | 'cloud.manage'
  | 'cost.read' | 'cost.manage' | 'cost.optimize'
  | 'infrastructure.read' | 'infrastructure.manage'
  | 'observability.read' | 'observability.investigate'
  | 'devops.read' | 'devops.manage'
  | 'terraform.read' | 'terraform.manage'
  | 'repository.read' | 'repository.security'
  | 'container.read' | 'container.security'
  | 'kubernetes.read' | 'kubernetes.manage' | 'kubernetes.security'
  | 'security.read' | 'security.investigate' | 'security.remediate'
  | 'incident.read' | 'incident.manage'
  | 'automation.read' | 'automation.execute';

export const ALL_CAPABILITIES: Capability[] = [
  'cloud.read', 'cloud.manage',
  'cost.read', 'cost.manage', 'cost.optimize',
  'infrastructure.read', 'infrastructure.manage',
  'observability.read', 'observability.investigate',
  'devops.read', 'devops.manage',
  'terraform.read', 'terraform.manage',
  'repository.read', 'repository.security',
  'container.read', 'container.security',
  'kubernetes.read', 'kubernetes.manage', 'kubernetes.security',
  'security.read', 'security.investigate', 'security.remediate',
  'incident.read', 'incident.manage',
  'automation.read', 'automation.execute',
];

/** Immutable view of a user's derived capability set. */
export interface Capabilities {
  has(c: Capability): boolean;
  hasAll(c: Capability[]): boolean;
  hasAny(c: Capability[]): boolean;
  list(): Capability[];
}

// ── Scope ──────────────────────────────────────────────────────────────────

/**
 * The user's effective data scope for this org session. `connectionIds` is
 * `'all'` for an unrestricted member, or the explicit allow-list (grant rows
 * ∩ connections the FilterProvider actually knows about) for a restricted
 * one. Widgets forward this to every query — the frontend never fetches a
 * superset and hides rows (issue §13); endpoints without a scope param are
 * flagged in the widget files as a backend follow-up.
 */
export interface EffectiveScope {
  orgId: string;
  orgName: string;
  folders: FolderRow[];
  projects: ProjectRow[];
  restricted: boolean;
  connectionIds: string[] | 'all';
  /** From the app-wide FilterBar / personalization defaults. */
  activeConnectionId?: string;
  activeProjectId?: string;
  activeEnvironment?: string;
  /** App-wide FilterBar region ('all' or a specific region). */
  region: string;
}

/** Stable react-query key fragment for a scope — so cache is per-scope. */
export function scopeQueryKey(scope: EffectiveScope): string {
  const conns = scope.connectionIds === 'all' ? 'all' : [...scope.connectionIds].sort().join(',');
  return [
    scope.orgId,
    scope.restricted ? `r:${conns}` : 'unrestricted',
    scope.activeConnectionId ?? '',
    scope.activeProjectId ?? '',
    scope.activeEnvironment ?? '',
  ].join('|');
}

// ── Context signals (issue §15 level 3) ────────────────────────────────────

export interface ContextSignals {
  criticalIncidents: number;
  investigatingIncidents: number;
  criticalVulns: number;
  openAttackPaths: number;
  costAnomalies: number;
  anomalyDollarImpact: number;
  failedDeployments: number;
  criticalAlerts: number;
  generatedAt: string;
}

export const EMPTY_SIGNALS: ContextSignals = {
  criticalIncidents: 0,
  investigatingIncidents: 0,
  criticalVulns: 0,
  openAttackPaths: 0,
  costAnomalies: 0,
  anomalyDollarImpact: 0,
  failedDeployments: 0,
  criticalAlerts: 0,
  generatedAt: '',
};

// ── Widgets ────────────────────────────────────────────────────────────────

export type WidgetCategory =
  | 'platform' | 'finops' | 'devops' | 'iac' | 'security' | 'observability' | 'operations';

export const WIDGET_CATEGORIES: WidgetCategory[] = [
  'platform', 'finops', 'devops', 'iac', 'security', 'observability', 'operations',
];

export const CATEGORY_LABELS: Record<WidgetCategory, string> = {
  platform: 'Platform',
  finops: 'FinOps',
  devops: 'DevOps',
  iac: 'Infrastructure / IaC',
  security: 'Security',
  observability: 'Observability',
  operations: 'Operations',
};

export type WidgetKind = 'kpi' | 'panel';

/** Grid size in the 12-column react-grid-layout: w 1→4 cols, 2→8, 3→12. h in row units (~34px). */
export interface WidgetSize { w: 1 | 2 | 3; h: number }

/** What a widget component receives. */
export interface WidgetRenderContext {
  scope: EffectiveScope;
  can: Capabilities;
  dateRange: DateRangePreset;
  region: string;
  /** Every connected account/subscription/project (for provider rollups, name lookups). */
  connections: UnifiedAccountRow[];
  navigate: (to: string) => void;
}

export type WidgetComponent = FC<{ ctx: WidgetRenderContext }>;

/**
 * Registry entry — everything except the React component. Kept separate from
 * the component map (components/overview/registry.tsx) so this list and the
 * engine that consumes it stay free of the lib/api.ts import chain and
 * therefore unit-testable.
 */
export interface WidgetMeta {
  id: string;
  title: string;
  description: string;
  category: WidgetCategory;
  kind: WidgetKind;
  /** navConfig module `icon`/menu_key this belongs to; `null` = always module-eligible (cross-cutting). */
  module: string | null;
  /** ALL of these capabilities required for the widget to be eligible. */
  requires: Capability[];
  /** …and at least one of these, when set. */
  anyOf?: Capability[];
  minRole?: Role;
  defaultSize: WidgetSize;
  minSize?: { w: number; h: number };
  /** Lower sorts nearer the top of the page. */
  basePriority: number;
  /** false → eligible but not shown until the user adds it from the drawer. */
  defaultEnabled?: boolean;
  /** false → the component renders an honest "not connected yet" body. */
  integrated: boolean;
  /** issue §15 level 3 — elevate this widget when a live signal warrants it. */
  contextBoost?: (s: ContextSignals) => { priority: number; reason: string } | null;
}

// ── Personalization (issue §15 level 2) ────────────────────────────────────

export interface WidgetLayoutRect { x: number; y: number; w: number; h: number }

export interface OverviewPreferences {
  /** react-grid-layout positions, keyed by widget id (single 'lg' breakpoint). */
  layout: Record<string, WidgetLayoutRect>;
  hidden: string[];
  favorites: string[];
  /** default-off widgets the user has turned on. */
  added: string[];
  kpiOrder: string[];
  kpiHidden: string[];
  defaults: {
    projectId?: string;
    environment?: string;
    dateRange?: DateRangePreset;
  };
  /** signalKey → dismissed-at epoch ms. */
  dismissedSignals: Record<string, number>;
}

export const DEFAULT_PREFERENCES: OverviewPreferences = {
  layout: {},
  hidden: [],
  favorites: [],
  added: [],
  kpiOrder: [],
  kpiHidden: [],
  defaults: {},
  dismissedSignals: {},
};

// ── Engine output (issue §14 shape) ───────────────────────────────────────

export interface ResolvedWidget {
  meta: WidgetMeta;
  layout: WidgetLayoutRect;
  priority: number;
  favorite: boolean;
  boostReason?: string;
}

export interface OverviewConfig {
  user: string;
  role: Role;
  scope: {
    orgId: string;
    folders: string[];
    projects: string[];
    restricted: boolean;
    connectionIds: string[] | 'all';
  };
  modules: string[];
  capabilities: Capability[];
  kpis: ResolvedWidget[];
  widgets: ResolvedWidget[];
  signals: ContextSignals;
}
