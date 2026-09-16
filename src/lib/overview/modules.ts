/**
 * Resolves which HorizonVigil modules are enabled for the current user.
 *
 * Overview pipeline:
 *   identity → capabilities → modules → widget eligibility
 *
 * A widget whose `module` is not enabled is never eligible, regardless of its
 * capability requirements. This module deliberately reuses navConfig's
 * getVisibleModules so role thresholds, explicit menu-permission overrides,
 * cloud-only visibility, and other navigation-level rules stay centralized.
 *
 * IMPORTANT:
 * This is a UI eligibility helper, not an authorization boundary. Backend
 * APIs must enforce authorization independently.
 */
import type { MenuPermissionLevel } from '../api';
import { getVisibleModules, type Role } from '../navConfig';

type MenuPermissions =
  | Readonly<Record<string, MenuPermissionLevel>>
  | null
  | undefined;

/**
 * Return the visible navigation `icon` / `menu_key` identifiers as a fresh
 * Set. WidgetMeta.module uses the same identifiers.
 *
 * A new Set is returned for every call so callers cannot mutate shared state.
 */
export function getEnabledModules(
  role: Role,
  menuPermissions: MenuPermissions,
): Set<string> {
  const visibleModules = getVisibleModules(
    role,
    menuPermissions ?? null,
  );

  const enabled = new Set<string>();

  for (const module of visibleModules) {
    const icon = module?.icon;

    if (typeof icon !== 'string') {
      continue;
    }

    const normalizedIcon = icon.trim();

    if (normalizedIcon.length === 0) {
      continue;
    }

    enabled.add(normalizedIcon);
  }

  return enabled;
}
