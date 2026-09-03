/**
 * Which HorizonVigil modules are enabled for the current user — the third
 * gate in the Overview pipeline (identity → capabilities → **modules** →
 * widget eligibility). A widget whose `module` is not enabled is never shown,
 * regardless of capability, so the Overview can't surface a Kubernetes widget
 * for an org that has the Clusters module switched off, etc.
 *
 * Thin reuse of navConfig's `getVisibleModules`, which already folds together
 * role thresholds, explicit menu-permission overrides, and the billing
 * feature flag. Returns the set of module `icon`s (menu_keys), matching
 * `WidgetMeta.module`.
 */
import type { MenuPermissionLevel } from '../api';
import { getVisibleModules, type Role } from '../navConfig';

export function getEnabledModules(
  role: Role,
  menuPermissions: Record<string, MenuPermissionLevel> | null | undefined,
): Set<string> {
  return new Set(getVisibleModules(role, menuPermissions ?? null).map((m) => m.icon));
}
