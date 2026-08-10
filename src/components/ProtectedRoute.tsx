import { Navigate, useLocation } from 'react-router-dom';
import { useOrg } from '../lib/orgContext';
import { useAuth } from '../lib/auth';
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
  const { currentOrg, menuPermissions } = useOrg();
  const location = useLocation();
  const role = (currentOrg?.myRole as Role) ?? 'owner';

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

/** Redirects to /login if not authenticated (used for any protected route). */
export function RequireAuthRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />;
  return <>{children}</>;
}
