/**
 * Shared types for the dynamic Overview engine.
 *
 * This module is intentionally runtime-import-free. All external dependencies
 * are type-only so the pure engine/registry layers remain safe to import from
 * Vitest without initializing the application API/client stack.
 *
 * The runtime implementation lives in the consuming modules; this file owns
 * the shared contracts only.
 */
import type { FC } from 'react';
import type { Role } from '../navConfig';
import type { DateRangePreset } from '../filterContext';
import type { FolderRow, ProjectRow } from '../api';
import type { UnifiedAccountRow } from '../unifiedAccounts';

export type { Role };

/* ──────────────────────────────────────────────────────────────────────────
 * Capabilities
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Granular, domain-scoped capabilities.
 *
 * These are derived on the frontend from the user's org role and
 * per-module menu permissions. They control what the UI may expose; they are
 * NOT a backend authorization boundary.
 *
 * `.read`                       → may see the data.
 * `.manage` / `.investigate`   → may act on it in the normal case.
 * `.optimize` / `.security`    → domain-specific action permissions.
 * `.remediate` / `.execute`    → privileged/irreversible actions.
 */
export type Capability =
  | 'cloud.read'
  | 'cloud.manage'
  | 'cost.read'
  | 'cost.manage'
  | 'cost.optimize'
  | 'infrastructure.read'
  | 'infrastructure.manage'
  | 'observability.read'
  | 'observability.investigate'
  | 'devops.read'
  | 'devops.manage'
  | 'terraform.read'
  | 'terraform.manage'
  | 'repository.read'
  | 'repository.security'
  | 'container.read'
  | 'container.security'
  | 'kubernetes.read'
  | 'kubernetes.manage'
  | 'kubernetes.security'
  | 'security.read'
  | 'security.investigate'
  | 'security.remediate'
  | 'incident.read'
  | 'incident.manage'
  | 'automation.read'
  | 'automation.execute';

export const ALL_CAPABILITIES: readonly Capability[] = [
  'cloud.read',
  'cloud.manage',
  'cost.read',
  'cost.manage',
  'cost.optimize',
  'infrastructure.read',
  'infrastructure.manage',
  'observability.read',
  'observability.investigate',
  'devops.read',
  'devops.manage',
  'terraform.read',
  'terraform.manage',
  'repository.read',
  'repository.security',
  'container.read',
  'container.security',
  'kubernetes.read',
  'kubernetes.manage',
  'kubernetes.security',
  'security.read',
  'security.investigate',
  'security.remediate',
  'incident.read',
  'incident.manage',
  'automation.read',
  'automation.execute',
];

/** Immutable view of a user's derived capability set. */
export interface Capabilities {
  has(capability: Capability): boolean;
  hasAll(capabilities: readonly Capability[]): boolean;
  hasAny(capabilities: readonly Capability[]): boolean;
  list(): Capability[];
}

/* ──────────────────────────────────────────────────────────────────────────
 * Scope
 * ────────────────────────────────────────────────────────────────────────── */

export interface EffectiveScope {
  orgId: string;
  orgName: string;
  folders: FolderRow[];
  projects: ProjectRow[];
  restricted: boolean;
  /**
   * `'all'` means unrestricted for the current org scope.
   * Otherwise this is the explicit allow-list after scope + resource-grant
   * intersection.
   */
  connectionIds: string[] | 'all';

  /** App-wide FilterBar / personalization selections. */
  activeConnectionId?: string;
  activeProjectId?: string;
  activeEnvironment?: string;

  /** `'all'` or a concrete region. */
  region: string;
}

/**
 * Stable react-query key fragment for a scope.
 *
 * The connection allow-list is sorted so equivalent sets produce the same
 * cache key regardless of server/filter ordering.
 */
export function scopeQueryKey(scope: EffectiveScope): string {
  const normalizedOrgId = typeof scope.orgId === 'string'
    ? scope.orgId.trim()
    : '';

  const normalizedConnections =
    scope.connectionIds === 'all'
      ? 'all'
      : normalizeScopeIds(scope.connectionIds).sort().join(',');

  const activeConnectionId = normalizeOptionalId(scope.activeConnectionId);
  const activeProjectId = normalizeOptionalId(scope.activeProjectId);
  const activeEnvironment = normalizeOptionalId(scope.activeEnvironment);

  return [
    normalizedOrgId,
    scope.restricted ? `r:${normalizedConnections}` : 'unrestricted',
    activeConnectionId ?? '',
    activeProjectId ?? '',
    activeEnvironment ?? '',
    typeof scope.region === 'string' ? scope.region.trim() : '',
  ].join('|');
}

function normalizeOptionalId(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeScopeIds(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (typeof value !== 'string') continue;

    const normalized = value.trim();

    if (!normalized || seen.has(normalized)) continue;

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Context signals — issue §15 level 3
 * ────────────────────────────────────────────────────────────────────────── */

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

export const EMPTY_SIGNALS: ContextSignals = Object.freeze({
  criticalIncidents: 0,
  investigatingIncidents: 0,
  criticalVulns: 0,
  openAttackPaths: 0,
  costAnomalies: 0,
  anomalyDollarImpact: 0,
  failedDeployments: 0,
  criticalAlerts: 0,
  generatedAt: '',
});

/* ──────────────────────────────────────────────────────────────────────────
 * Widgets
 * ────────────────────────────────────────────────────────────────────────── */

export type WidgetCategory =
  | 'platform'
  | 'finops'
  | 'devops'
  | 'iac'
  | 'security'
  | 'observability'
  | 'operations';

export const WIDGET_CATEGORIES: readonly WidgetCategory[] = [
  'platform',
  'finops',
  'devops',
  'iac',
  'security',
  'observability',
  'operations',
];

export const CATEGORY_LABELS: Readonly<Record<WidgetCategory, string>> = {
  platform: 'Platform',
  finops: 'FinOps',
  devops: 'DevOps',
  iac: 'Infrastructure / IaC',
  security: 'Security',
  observability: 'Observability',
  operations: 'Operations',
};

export type WidgetKind = 'kpi' | 'panel';

/**
 * Grid size for react-grid-layout:
 *   w 1 → 4 columns
 *   w 2 → 8 columns
 *   w 3 → 12 columns
 *
 * h is expressed in layout row units.
 */
export interface WidgetSize {
  w: 1 | 2 | 3;
  h: number;
}

export interface WidgetRenderContext {
  scope: EffectiveScope;
  can: Capabilities;
  dateRange: DateRangePreset;
  region: string;
  /** Connected account/subscription/project rows available to the widget. */
  connections: UnifiedAccountRow[];
  navigate: (to: string) => void;
}

export type WidgetComponent = FC<{
  ctx: WidgetRenderContext;
}>;

/**
 * Registry entry — everything except the React component.
 *
 * Component implementations live in components/overview/registry.tsx. The
 * two registries are matched by id and should be validated at load/test time.
 */
export interface WidgetMeta {
  id: string;
  title: string;
  description: string;
  category: WidgetCategory;
  kind: WidgetKind;

  /** navConfig module icon/menu_key; null = cross-cutting widget. */
  module: string | null;

  /** Every listed capability is required. */
  requires: Capability[];

  /** At least one listed capability is additionally required when present. */
  anyOf?: Capability[];

  minRole?: Role;

  defaultSize: WidgetSize;

  /** Optional react-grid-layout lower bound. */
  minSize?: {
    w: number;
    h: number;
  };

  /** Lower value sorts nearer the top of the page. */
  basePriority: number;

  /** false = eligible but initially hidden until explicitly added. */
  defaultEnabled?: boolean;

  /** false = render an honest "not connected yet" / unavailable state. */
  integrated: boolean;

  /** Issue §15 level 3 — contextual priority boost. */
  contextBoost?: (
    signals: ContextSignals,
  ) => {
    priority: number;
    reason: string;
  } | null;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Personalization — issue §15 level 2
 * ────────────────────────────────────────────────────────────────────────── */

export interface WidgetLayoutRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OverviewPreferences {
  /** react-grid-layout positions, keyed by widget id. */
  layout: Record<string, WidgetLayoutRect>;

  hidden: string[];

  favorites: string[];

  /** Default-off widgets explicitly added by the user. */
  added: string[];

  kpiOrder: string[];

  kpiHidden: string[];

  defaults: {
    projectId?: string;
    environment?: string;
    dateRange?: DateRangePreset;
  };

  /** signalKey → dismissed-at epoch milliseconds. */
  dismissedSignals: Record<string, number>;
}

/**
 * Do not mutate this object.
 *
 * Consumers that need editable preferences should create their own copy
 * rather than modifying DEFAULT_PREFERENCES directly.
 */
export const DEFAULT_PREFERENCES: Readonly<OverviewPreferences> =
  Object.freeze({
    layout: {},
    hidden: [],
    favorites: [],
    added: [],
    kpiOrder: [],
    kpiHidden: [],
    defaults: {},
    dismissedSignals: {},
  });

/* ──────────────────────────────────────────────────────────────────────────
 * Engine output — issue §14 shape
 * ────────────────────────────────────────────────────────────────────────── */

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
