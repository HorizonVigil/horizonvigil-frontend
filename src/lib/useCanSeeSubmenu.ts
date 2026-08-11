import { useOrg } from './orgContext';
import { canSeeChild, submenuKey, type Role } from './navConfig';

/**
 * Submenu-level access check for use INSIDE a tabbed page (Cost Management,
 * Vulnerability Management, ...) whose "children" in navConfig.ts are tabs
 * on one route rather than separate URLs — the sidebar already hides
 * restricted tabs from the nav, but a route-level guard can't stop someone
 * clicking a tab button that's still rendered in the page itself, so each
 * such page needs its own check too.
 *
 * `childLabel` must match the child's `label` in navConfig.ts exactly (same
 * string that's hashed into the submenu key there).
 */
export function useCanSeeSubmenu(parentIcon: string, childLabel: string): boolean {
  const { currentOrg, menuPermissions } = useOrg();
  const role = (currentOrg?.myRole as Role) ?? 'owner';
  return canSeeChild({ label: childLabel, real: true }, role, parentIcon, menuPermissions);
}

/** Batch form — call once per page instead of once per tab, avoids re-deriving `role` on every check. */
export function useSubmenuAccess(parentIcon: string): (childLabel: string) => boolean {
  const { currentOrg, menuPermissions } = useOrg();
  const role = (currentOrg?.myRole as Role) ?? 'owner';
  return (childLabel: string) => canSeeChild({ label: childLabel, real: true }, role, parentIcon, menuPermissions);
}

export { submenuKey };
