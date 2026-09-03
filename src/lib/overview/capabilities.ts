/**
 * Derives a granular {@link Capability} set from the user's org role and
 * effective per-module menu permissions.
 *
 * The backend today exposes only:
 *   - a coarse org role (viewer < editor < billing_admin < admin < owner), and
 *   - a per-module menu-permission level (none | read | write | admin),
 *     keyed by the module's navConfig `icon` / menu_key.
 *
 * The dynamic Overview needs finer distinctions than that — "can see the
 * security score" vs "can run remediation", "can read cost" vs "can execute
 * an optimization". This module maps the coarse inputs onto the granular
 * capability vocabulary the widget registry gates on. It is intentionally the
 * ONLY place that mapping lives, so swapping in a real `GET /permissions`
 * endpoint later is a one-function change.
 *
 * Precedence mirrors navConfig's `canSeeModule`: an explicit menu-permission
 * entry fully determines that module's effective level; with no entry we fall
 * back to a level implied by the role.
 */
import type { MenuPermissionLevel } from '../api';
import type { Role } from '../navConfig';
import type { Capability, Capabilities } from './types';
import { ALL_CAPABILITIES } from './types';

const ROLE_RANK: Record<Role, number> = {
  viewer: 0,
  editor: 1,
  billing_admin: 2,
  admin: 3,
  owner: 4,
};

type Level = 0 | 1 | 2 | 3; // none | read | write | admin

const LEVEL_RANK: Record<MenuPermissionLevel, Level> = {
  none: 0,
  read: 1,
  write: 2,
  admin: 3,
};

/**
 * The menu_keys (navConfig module `icon`s) this mapping reasons about.
 * Modules not listed here (overview, dashboard, issues, reports, users,
 * organization, settings, credit-card) grant no domain capability.
 */
type DomainModule =
  | 'cloud' | 'cost' | 'optimization' | 'resources' | 'security'
  | 'monitoring' | 'incidents' | 'automation' | 'containers' | 'alerts';

/**
 * Level a role implies for a module when there is no explicit override.
 * billing_admin is finance-forward: admin on cost/optimization, read elsewhere.
 */
function roleImpliedLevel(role: Role, mod: DomainModule): Level {
  if (role === 'owner' || role === 'admin') return 3;
  if (role === 'billing_admin') return mod === 'cost' || mod === 'optimization' ? 3 : 1;
  if (role === 'editor') return 2;
  return 1; // viewer
}

function effectiveLevel(
  role: Role,
  menuPermissions: Record<string, MenuPermissionLevel> | null | undefined,
  mod: DomainModule,
): Level {
  const override = menuPermissions?.[mod];
  if (override) return LEVEL_RANK[override];
  return roleImpliedLevel(role, mod);
}

/** Capabilities unlocked at each level threshold for a module. Cumulative: level 3 also grants level 1 & 2 rows. */
const MODULE_TIERS: Record<DomainModule, Partial<Record<1 | 2 | 3, Capability[]>>> = {
  cloud: {
    1: ['cloud.read'],
    2: ['cloud.manage'],
  },
  cost: {
    1: ['cost.read'],
    2: ['cost.manage'],
    3: ['cost.optimize'],
  },
  optimization: {
    1: ['cost.read'],
    2: ['cost.optimize'],
  },
  resources: {
    1: ['infrastructure.read', 'terraform.read'],
    2: ['infrastructure.manage'],
  },
  security: {
    1: ['security.read', 'repository.read', 'container.read'],
    2: ['security.investigate', 'repository.security', 'container.security'],
    3: ['security.remediate', 'kubernetes.security'],
  },
  monitoring: {
    1: ['observability.read', 'devops.read'],
    2: ['observability.investigate', 'devops.manage'],
  },
  incidents: {
    1: ['incident.read'],
    2: ['incident.manage'],
  },
  automation: {
    // execute is a privileged, often-irreversible action — admin tier only,
    // same as security.remediate. An editor who genuinely needs it gets an
    // explicit `automation: 'admin'` menu override.
    1: ['automation.read'],
    3: ['automation.execute'],
  },
  containers: {
    1: ['kubernetes.read', 'container.read'],
    2: ['kubernetes.manage'],
    3: ['kubernetes.security'],
  },
  alerts: {
    1: ['observability.read'],
    2: ['observability.investigate'],
  },
};

const DOMAIN_MODULES = Object.keys(MODULE_TIERS) as DomainModule[];

function makeCapabilities(set: Set<Capability>): Capabilities {
  return {
    has: (c) => set.has(c),
    hasAll: (cs) => cs.every((c) => set.has(c)),
    hasAny: (cs) => cs.length === 0 || cs.some((c) => set.has(c)),
    list: () => ALL_CAPABILITIES.filter((c) => set.has(c)),
  };
}

/**
 * @param role            the caller's role in the current org (`currentOrg.myRole`).
 * @param menuPermissions the effective per-module override map from
 *                        `useOrg().menuPermissions` (null while still loading —
 *                        treated as "no overrides", same as navConfig does).
 */
export function deriveCapabilities(
  role: Role,
  menuPermissions: Record<string, MenuPermissionLevel> | null | undefined,
): Capabilities {
  const granted = new Set<Capability>();
  const levels = {} as Record<DomainModule, Level>;

  for (const mod of DOMAIN_MODULES) {
    const level = effectiveLevel(role, menuPermissions, mod);
    levels[mod] = level;
    const tiers = MODULE_TIERS[mod];
    for (const threshold of [1, 2, 3] as const) {
      if (level >= threshold) for (const c of tiers[threshold] ?? []) granted.add(c);
    }
  }

  // Cross-module derivations that need more than one module's level.
  if (levels.resources >= 2 && levels.security >= 2) granted.add('terraform.manage');
  // An org admin/owner can always run automation, even with no explicit
  // Automation module grant — mirrors navConfig's admin-gated Automation route.
  if (ROLE_RANK[role] >= ROLE_RANK.admin) granted.add('automation.execute');

  return makeCapabilities(granted);
}

/** The full-access capability set — for previews, tests, and the "everything" fallback. */
export function allCapabilities(): Capabilities {
  return makeCapabilities(new Set(ALL_CAPABILITIES));
}
