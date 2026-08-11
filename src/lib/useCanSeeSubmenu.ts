import { useOrg } from './orgContext';
import { canSeeChild, findNavChild, submenuKey, type Role } from './navConfig';

/**
 * Submenu-level access check for use INSIDE a tabbed page (Cost Management,
 * Vulnerability Management, ...) whose "children" in navConfig.ts are tabs
 * on one route rather than separate URLs — the sidebar already hides
 * restricted tabs from the nav, but a route-level guard can't stop someone
 * clicking a tab button that's still rendered in the page itself, so each
 * such page needs its own check too.
 *
 * `childLabel` must match the child's `label` in navConfig.ts exactly (same
 * string that's hashed into the submenu key there). Looks up the real
 * NavChild (via findNavChild) so a tab's own minRole/roles is enforced here
 * too, not just an explicit admin override -- a label-only synthetic child
 * has no minRole of its own, so a role-restricted tab (e.g. Cost
 * Management's Budgets, editor+) would otherwise be reachable by anyone via
 * a direct `?tab=Budgets` URL even though the sidebar correctly hides it.
 * Tabs with no matching navConfig entry (e.g. Cost Optimization's default
 * "Overview" tab, which isn't in its own sidebar list) fall back to a
 * role-less child, i.e. visible to all -- same as an unrestricted sidebar
 * item would be.
 */
export function useCanSeeSubmenu(parentIcon: string, childLabel: string): boolean {
  const { currentOrg, menuPermissions } = useOrg();
  const role = (currentOrg?.myRole as Role) ?? 'owner';
  const child = findNavChild(parentIcon, childLabel) ?? { label: childLabel, real: true };
  return canSeeChild(child, role, parentIcon, menuPermissions);
}

/** Batch form — call once per page instead of once per tab, avoids re-deriving `role` on every check. */
export function useSubmenuAccess(parentIcon: string): (childLabel: string) => boolean {
  const { currentOrg, menuPermissions } = useOrg();
  const role = (currentOrg?.myRole as Role) ?? 'owner';
  return (childLabel: string) => {
    const child = findNavChild(parentIcon, childLabel) ?? { label: childLabel, real: true };
    return canSeeChild(child, role, parentIcon, menuPermissions);
  };
}

export { submenuKey };
