import { useOrg } from '../lib/orgContext';
import { NAV_MODULES, canSeeModule as canSeeNavModule, type Role } from '../lib/navConfig';
import { AccessDenied } from './AccessDenied';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Module label this route belongs to (e.g. 'Users & Groups'). If the user's role/permissions can't see this module, route is blocked. */
  module?: string;
  /** Minimum role required to access this route. */
  minRole?: Role;
}

/**
 * Route-level guard. Checks whether the user's role/effective menu
 * permission can access the given module, or meets the minimum role
 * requirement. If not, shows AccessDenied. This complements the dynamic
 * menu — users can't reach unauthorized pages by typing the URL directly.
 */
export function ProtectedRoute({ children, module, minRole }: ProtectedRouteProps) {
  const { currentOrg, menuPermissions, isLoading } = useOrg();
  const role = currentOrg?.myRole as Role | undefined;

  /*
   * THIS GUARD USED TO FAIL OPEN.
   *
   * The role was read as `(currentOrg?.myRole as Role) ?? 'owner'`, so an
   * unknown organisation resolved to the HIGHEST privilege in the system.
   * Unknown is not owner: `currentOrg` is null while the org bootstrap is in
   * flight AND whenever that bootstrap fails, and in both states every
   * module-gated route rendered as though an owner had asked for it.
   *
   * The three states are now distinct:
   *   loading  -> decide nothing, render nothing
   *   no org   -> cannot establish a role, so deny
   *   known    -> evaluate the real role
   *
   * Rendering nothing while loading matters: denying during the in-flight
   * window would flash "Access denied" at legitimate users on every reload.
   */
  if (isLoading) return null;

  if (!role) return <AccessDenied />;

  // If a module is specified, check if the user can see that module
  // (role-based minRole/roles, or an explicit menu_permissions override).
  if (module) {
    const mod = NAV_MODULES.find((m) => m.label === module);
    if (!mod || !canSeeNavModule(mod, role, menuPermissions)) {
      return <AccessDenied />;
    }
  }

  // If a minimum role is specified, enforce it.
  if (minRole) {
    const ROLE_RANK: Record<Role, number> = { viewer: 0, editor: 1, billing_admin: 2, admin: 3, owner: 4 };
    if (ROLE_RANK[role] < ROLE_RANK[minRole]) {
      return <AccessDenied />;
    }
  }

  return <>{children}</>;
}

/*
 * `RequireAuthRoute` used to live here, documented as "used for any protected
 * route". Nothing imported it. Authentication is actually enforced by
 * RequireAuth / RequireOrg (src/pages/auth/RequireAuth.tsx), which App.tsx
 * wraps the authenticated route tree in.
 *
 * It was removed rather than wired up: a second, unused implementation of an
 * auth guard whose comment claims it is in use is worse than no implementation
 * at all, because it invites the reader to believe a route is protected by it.
 */
