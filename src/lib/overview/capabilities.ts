/**
 * Maps an org role + effective menu permissions to the granular capabilities
 * used by the dynamic Overview/widget registry.
 *
 * IMPORTANT:
 * - This is a UI capability derivation helper, not an authorization boundary.
 * - The backend must enforce every protected action independently.
 * - An explicit module permission is authoritative for that module.
 * - Missing/null permissions are treated as "no overrides" for compatibility
 *   with navConfig.canSeeModule while permissions are loading.
 *
 * Keep this mapping centralized so a future `GET /permissions` response can
 * replace this derivation without changing widget consumers.
 */
import type { MenuPermissionLevel } from '../api';
import type { Role } from '../navConfig';
import type { Capability, Capabilities } from './types';
import { ALL_CAPABILITIES } from './types';

const ROLE_RANK: Readonly<Record<Role, number>> = {
  viewer: 0,
  editor: 1,
  billing_admin: 2,
  admin: 3,
  owner: 4,
};

type Level = 0 | 1 | 2 | 3; // none | read | write | admin

const LEVEL_RANK: Readonly<Record<MenuPermissionLevel, Level>> = {
  none: 0,
  read: 1,
  write: 2,
  admin: 3,
};

/**
 * These are the only modules that contribute domain capabilities.
 *
 * Other navigation entries (for example Overview, Reports, Users,
 * Organization, Settings, or billing-only navigation) do not grant a domain
 * capability from this mapper.
 */
type DomainModule =
  | 'cloud'
  | 'cost'
  | 'optimization'
  | 'resources'
  | 'security'
  | 'monitoring'
  | 'incidents'
  | 'automation'
  | 'containers'
  | 'alerts';

/**
 * Role defaults used when an explicit menu-permission entry is absent.
 *
 * billing_admin intentionally receives admin-level defaults only for
 * cost/optimization and read-level defaults elsewhere.
 */
function roleImpliedLevel(role: Role, mod: DomainModule): Level {
  switch (role) {
    case 'owner':
    case 'admin':
      return 3;
    case 'billing_admin':
      return mod === 'cost' || mod === 'optimization' ? 3 : 1;
    case 'editor':
      return 2;
    case 'viewer':
      return 1;
    default:
      // Role is a typed union at compile time. Keep a defensive fallback so
      // malformed runtime data cannot accidentally produce elevated access.
      return 0;
  }
}

/**
 * Resolves the effective module level.
 *
 * An explicit value is authoritative, including `none`.
 */
function effectiveLevel(
  role: Role,
  menuPermissions: Readonly<Record<string, MenuPermissionLevel>> | null | undefined,
  mod: DomainModule,
): Level {
  const override = menuPermissions?.[mod];

  if (override !== undefined) {
    return LEVEL_RANK[override] ?? 0;
  }

  return roleImpliedLevel(role, mod);
}

/**
 * Capability tiers are cumulative:
 * level 3 includes level 1 and level 2 capabilities.
 *
 * A missing tier is intentional: the module simply does not grant any
 * additional capability at that threshold.
 */
const MODULE_TIERS: Readonly<
  Record<DomainModule, Partial<Record<1 | 2 | 3, readonly Capability[]>>>
> = {
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
    1: ['automation.read'],
    // Execution is intentionally admin-tier only.
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

const DOMAIN_MODULES = Object.freeze(
  Object.keys(MODULE_TIERS) as DomainModule[],
);

function makeCapabilities(set: Set<Capability>): Capabilities {
  const frozenCapabilities = Object.freeze(new Set(set));

  return {
    has: (capability) => frozenCapabilities.has(capability),

    hasAll: (capabilities) =>
      capabilities.every((capability) => frozenCapabilities.has(capability)),

    hasAny: (capabilities) =>
      capabilities.length === 0 ||
      capabilities.some((capability) => frozenCapabilities.has(capability)),

    list: () => ALL_CAPABILITIES.filter((capability) => frozenCapabilities.has(capability)),
  };
}

/**
 * Derive the capabilities available to the current user.
 *
 * @param role
 *   The caller's effective role in the current organization.
 *
 * @param menuPermissions
 *   Effective per-module menu permissions. `null`/`undefined` means that no
 *   explicit overrides are currently available, matching navConfig behavior.
 *
 * NOTE:
 * This function should never be used to authorize a backend operation.
 * It only derives client-visible capability state.
 */
export function deriveCapabilities(
  role: Role,
  menuPermissions:
    | Readonly<Record<string, MenuPermissionLevel>>
    | null
    | undefined,
): Capabilities {
  const granted = new Set<Capability>();
  const levels = {} as Record<DomainModule, Level>;

  for (const mod of DOMAIN_MODULES) {
    const level = effectiveLevel(role, menuPermissions, mod);
    levels[mod] = level;

    const tiers = MODULE_TIERS[mod];

    for (const threshold of [1, 2, 3] as const) {
      if (level < threshold) continue;

      for (const capability of tiers[threshold] ?? []) {
        granted.add(capability);
      }
    }
  }

  /**
   * Terraform management requires both infrastructure management and the
   * security investigation/admin surface represented by the current model.
   *
   * Keep this derivation explicit rather than encoding it into unrelated
   * module tiers.
   */
  if (levels.resources >= 2 && levels.security >= 2) {
    granted.add('terraform.manage');
  }

  /**
   * Organization admins/owners retain automation execution even when the
   * Automation navigation module has no explicit override, matching the
   * current navConfig route gating behavior.
   */
  if (ROLE_RANK[role] >= ROLE_RANK.admin) {
    granted.add('automation.execute');
  }

  return makeCapabilities(granted);
}

/**
 * Full-access capability set for previews/tests and explicit "everything"
 * contexts.
 */
export function allCapabilities(): Capabilities {
  return makeCapabilities(new Set(ALL_CAPABILITIES));
}
