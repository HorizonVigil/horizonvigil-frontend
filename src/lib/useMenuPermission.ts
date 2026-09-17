import { useOrg } from './orgContext';
import type { MenuPermissionLevel } from './navConfig';

/**
 * Same ranking the server uses (shared-lib `rbac.LEVEL_RANK`). Mirrored rather
 * than re-derived so a frontend check cannot disagree with the 403 the API
 * would return.
 */
const LEVEL_RANK: Record<MenuPermissionLevel, number> = {
  none: 0,
  read: 1,
  write: 2,
  admin: 3,
};

/**
 * Whether the current user holds at least `minLevel` on a module.
 *
 * WHY THIS IS SAFE TO ASK ON THE CLIENT
 *
 * `menuPermissions` is not a client-side guess: it is the server's own
 * `getEffectiveMenuPermissions()` output, already resolved through user
 * overrides, then group overrides, then the role default. Comparing it with
 * the same LEVEL_RANK the server compares makes the button agree with the
 * endpoint instead of merely hiding it.
 *
 * This is presentation, never authorisation. The server still enforces every
 * mutation; this only stops the product from OFFERING an action that it would
 * then refuse -- rule 8's "never display an action as available when the
 * current user cannot execute it".
 *
 * FAIL CLOSED
 *
 * `menuPermissions` is null when the permission lookup itself failed. A failed
 * lookup is not permission: it is an unknown, and this treats it as no
 * access, matching the same decision made for resource grants ("unknown
 * grants are represented as null, not unrestricted").
 */
export function useMenuPermission(
  moduleKey: string,
  minLevel: MenuPermissionLevel,
): boolean {
  const { menuPermissions } = useOrg();

  // Unknown, not permitted.
  if (!menuPermissions) return false;

  const level = menuPermissions[moduleKey] ?? 'none';

  return LEVEL_RANK[level] >= LEVEL_RANK[minLevel];
}
