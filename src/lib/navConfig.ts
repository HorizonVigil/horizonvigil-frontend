/**
 * Full information architecture (16 modules — Issues added as a
 * cross-cutting triage view alongside the original 15). Every module and sub-item below
 * is real product scope, not aspiration copy — but not everything listed has
 * a feature behind it yet. `to` present + `real: true` means the item
 * genuinely opens the thing it describes (often a section of a bigger page,
 * not its own URL — several sub-items can share one `to`). `real: false`
 * renders disabled with a "Soon" tag instead of a dead or fake link, per the
 * "never build placeholder pages" rule — the label is honest about what's
 * planned, the disabled state is honest about what isn't built yet.
 *
 * Several modules render as an in-page tabbed workspace (CloudAccounts.tsx,
 * VulnerabilityManagement.tsx, Clusters.tsx, Alerts.tsx, CostOptimization.tsx,
 * Automation.tsx, CustomDashboards.tsx) rather than one flat view — for those,
 * `to` carries a `?tab=<value>` query string matching that page's own
 * `useTabParam` tab identifier (see lib/useTabParam.ts), so a sidebar click
 * actually switches to the right section instead of just re-landing on
 * whatever tab happened to be open. The tab identifier's exact spelling must
 * match the target page's TABS array/Tab type — they're not derived from
 * each other, keep them in sync by hand if either changes.
 *
 * Re-classify an item by flipping `real` once its feature ships — this file
 * is the single source of truth for both the sidebar and (eventually) any
 * per-module breadcrumb/quick-nav that wants the same list.
 *
 * ── Dynamic menu permissions ─────────────────────────────────────────────
 * Each module and child can carry a `minRole` (or `roles`) field. When set,
 * the module/child is only visible to users whose org role meets the
 * threshold. `getVisibleModules(role)` returns the filtered list — the
 * navigation layer (AppRail, Sidebar, CommandPalette) calls this instead of
 * importing NAV_MODULES directly.
 *
 * Role hierarchy (higher = more access):
 *   viewer < editor < billing_admin < admin < owner
 *
 * `roles` = explicit allow-list (e.g. ['admin','owner'])
 * `minRole` = minimum role required (e.g. 'editor' means editor+)
 */

import { isBillingEnabled } from './featureFlags';

export type Role = 'viewer' | 'editor' | 'billing_admin' | 'admin' | 'owner';

const ROLE_RANK: Record<Role, number> = {
  viewer: 0,
  editor: 1,
  billing_admin: 2,
  admin: 3,
  owner: 4,
};

/**
 * RBAC Phase 2 — menu-level permissions. `MenuPermissionLevel` and the
 * per-module effective-permission map (fetched once per org session, see
 * lib/orgContext.tsx) let an admin grant or restrict one specific module
 * independent of a user's overall org role — e.g. a viewer with Write on
 * Cloud Accounts, or an editor with No Access to Vulnerability Management.
 * A module's `icon` string doubles as its menu_key (see icons.tsx's own
 * comment: "icon names map 1:1 to navConfig module keys"). When the
 * permissions map has no entry for a module (the common case — nobody has
 * an explicit override), visibility falls back to the existing
 * minRole/roles check below, unchanged from before this existed.
 */
export type MenuPermissionLevel = 'none' | 'read' | 'write' | 'admin';

export interface NavChild {
  label: string;
  to?: string;
  /** Opens the floating chat assistant instead of navigating — used for the
   * per-module "AI Copilot" entries, which are one real assistant (grounded
   * in your own data, see ChatWidget.tsx) rather than a separate page per module. */
  action?: 'open-chat';
  real: boolean;
  /** Minimum role required to see this item. */
  minRole?: Role;
  /** Explicit list of roles allowed to see this item. */
  roles?: Role[];
}

export interface NavModule {
  label: string;
  icon: string;
  to?: string; // present when the module itself has a real landing page
  children: NavChild[];
  /** Minimum role required to see this module. */
  minRole?: Role;
  /** Explicit list of roles allowed to see this module. */
  roles?: Role[];
}

const OVERVIEW = '/overview';
const ACCOUNTS = '/cloud-accounts';
const RESOURCES = '/resources';
const COST = '/cost-management';
const OPT = '/cost-optimization';
const VULN = '/vulnerability-management';
const EKS_CONSOLE = '/clusters/aws';
const GKE_CONSOLE = '/clusters/gcp';
const AKS_CONSOLE = '/clusters/azure';
const MON = '/monitoring';
const ALERTS = '/alerts';
const ISSUES = '/issues';
const REPORTS = '/reports';
const USERS = '/users-groups';
const ORG = '/organization';
const SETTINGS = '/settings';
const DASHBOARDS = '/custom-dashboards';
const AUTOMATION = '/automation';
const SUBSCRIPTION = '/subscription';

/** `${base}?tab=<value>`, URL-encoded — the query-string half of the sidebar/in-page-tab link between navConfig and a tabbed page's useTabParam. */
function tabLink(base: string, tab: string): string {
  return `${base}?tab=${encodeURIComponent(tab)}`;
}

export const NAV_MODULES: NavModule[] = [
  {
    label: 'Overview',
    icon: 'overview',
    to: OVERVIEW,
    children: [
      { label: 'Executive Dashboard', to: `${OVERVIEW}#executive-dashboard`, real: true },
      { label: 'Activity Timeline', to: `${OVERVIEW}#activity-timeline`, real: true },
      { label: 'Quick Actions', to: `${OVERVIEW}#quick-actions`, real: true },
      { label: 'Favorites', to: `${OVERVIEW}#favorites`, real: true },
    ],
  },
  {
    label: 'Cloud Accounts',
    icon: 'cloud',
    to: ACCOUNTS,
    children: [
      { label: 'Dashboard', to: ACCOUNTS, real: true },
      { label: 'Account Inventory', to: tabLink(ACCOUNTS, 'Inventory'), real: true },
      { label: 'Account Onboarding', to: tabLink(ACCOUNTS, 'Onboarding'), real: true, minRole: 'editor' },
      { label: 'Organizations', to: tabLink(ACCOUNTS, 'Organizations'), real: true },
      { label: 'Regions', to: tabLink(ACCOUNTS, 'Regions'), real: true },
      { label: 'Sync Center', to: tabLink(ACCOUNTS, 'Sync Center'), real: true, minRole: 'editor' },
      { label: 'Reports', to: tabLink(ACCOUNTS, 'Reports'), real: true },
      { label: 'Settings', real: false, minRole: 'admin' },
    ],
  },
  {
    label: 'Resources',
    icon: 'resources',
    to: RESOURCES,
    children: [
      { label: 'Resource Inventory', to: RESOURCES, real: true },
      { label: 'Global Search', to: tabLink(`${RESOURCES}/all`, 'Global Search'), real: true },
      { label: 'Dependency Graph', to: `${RESOURCES}/all`, real: true },
      { label: 'Resource Relationships', to: tabLink(`${RESOURCES}/all`, 'Resource Relationships'), real: true },
      { label: 'Tags Explorer', to: tabLink(`${RESOURCES}/all`, 'Tags Explorer'), real: true },
      { label: 'Resource Timeline', to: tabLink(`${RESOURCES}/all`, 'Resource Timeline'), real: true },
      { label: 'Bulk Operations', to: `${RESOURCES}/all?bulk=1`, real: true, minRole: 'editor' },
    ],
  },
  {
    label: 'Custom Dashboards',
    icon: 'dashboard',
    to: DASHBOARDS,
    children: [
      { label: 'My Dashboards', to: DASHBOARDS, real: true },
      { label: 'Shared Dashboards', to: tabLink(DASHBOARDS, 'shared'), real: true },
      { label: 'Dashboard Templates', to: tabLink(DASHBOARDS, 'templates'), real: true },
      { label: 'Widget Library', to: tabLink(DASHBOARDS, 'widgets'), real: true },
    ],
  },
  {
    label: 'Cost Management',
    icon: 'cost',
    to: COST,
    children: [
      { label: 'Cost Explorer', to: COST, real: true },
      { label: 'Cost Analytics', to: tabLink(COST, 'Cost Analytics'), real: true },
      { label: 'Forecast', to: tabLink(COST, 'Forecast'), real: true },
      { label: 'Budgets', to: tabLink(COST, 'Budgets'), real: true, minRole: 'editor' },
      { label: 'Cost Allocation', to: tabLink(COST, 'Cost Allocation'), real: true },
      { label: 'Chargeback', to: tabLink(COST, 'Chargeback'), real: true },
      { label: 'Showback', to: tabLink(COST, 'Showback'), real: true },
      { label: 'Cost Reports', to: tabLink(COST, 'Cost Reports'), real: true },
    ],
  },
  {
    label: 'Cost Optimization',
    icon: 'optimization',
    to: OPT,
    children: [
      { label: 'Savings Opportunities', to: tabLink(OPT, 'Recommendations'), real: true },
      { label: 'Rightsizing', to: tabLink(OPT, 'Rightsizing'), real: true },
      { label: 'Idle Resources', to: tabLink(OPT, 'Idle Resources'), real: true },
      { label: 'Reserved Instances', to: tabLink(OPT, 'Reserved Instances'), real: true },
      { label: 'Savings Plans', to: tabLink(OPT, 'Savings Plans'), real: true },
      { label: 'Cost Anomalies', to: tabLink(OPT, 'Cost Anomalies'), real: true },
      { label: 'Optimization History', to: tabLink(OPT, 'History'), real: true },
    ],
  },
  {
    label: 'Vulnerability Management',
    icon: 'security',
    to: VULN,
    children: [
      { label: 'Security Hub', to: VULN, real: true },
      { label: 'GuardDuty', to: tabLink(VULN, 'GuardDuty'), real: true },
      { label: 'Inspector', to: tabLink(VULN, 'Inspector'), real: true },
      { label: 'IAM Access Analyzer', to: tabLink(VULN, 'IAM Access Analyzer'), real: true },
      { label: 'AWS Config', to: tabLink(VULN, 'AWS Config'), real: true },
      { label: 'Container Images', to: tabLink(VULN, 'Container Images'), real: true },
      { label: 'Security Findings', to: tabLink(VULN, 'Security Findings'), real: true },
      { label: 'Compliance', to: tabLink(VULN, 'Compliance'), real: true },
      { label: 'Trusted Advisor', to: tabLink(VULN, 'Trusted Advisor'), real: true },
      { label: 'Scanners', to: tabLink(VULN, 'Scanners'), real: true },
    ],
  },
  {
    label: 'Clusters',
    icon: 'containers',
    to: EKS_CONSOLE,
    children: [
      { label: 'AWS EKS', to: EKS_CONSOLE, real: true },
      { label: 'GCP GKE', to: GKE_CONSOLE, real: true },
      // Unlike EKS/GKE, there's no Azure connector, schema support, or
      // scanner behind this yet (see AksConsole.tsx) -- `to` stays set so the
      // console is still reachable (it renders an honest RoadmapPanel, not a
      // dead link), but `real: false` marks it as not-yet-built, consistent
      // with every other planned-but-unbuilt item in this file.
      { label: 'Azure AKS', to: AKS_CONSOLE, real: false },
    ],
  },
  {
    label: 'Monitoring',
    icon: 'monitoring',
    to: MON,
    children: [
      { label: 'CloudWatch', to: MON, real: true },
      { label: 'Metrics', to: tabLink(MON, 'Metrics'), real: true },
      { label: 'Logs', to: tabLink(MON, 'Logs'), real: true },
      { label: 'Traces', to: tabLink(MON, 'Traces'), real: true },
      { label: 'Dashboards', to: tabLink(MON, 'Dashboards'), real: true },
      { label: 'Health', to: tabLink(MON, 'Health'), real: true },
      { label: 'Service Map', to: tabLink(MON, 'Service Map'), real: true },
      { label: 'Performance', to: tabLink(MON, 'Performance'), real: true },
    ],
  },
  {
    label: 'Alerts',
    icon: 'alerts',
    to: ALERTS,
    children: [
      { label: 'Active Alerts', to: ALERTS, real: true },
      { label: 'Alert Rules', to: tabLink(ALERTS, 'rules'), real: true, minRole: 'editor' },
      { label: 'Notification Channels', to: tabLink(ALERTS, 'channels'), real: true, minRole: 'editor' },
      { label: 'Escalation Policies', to: tabLink(ALERTS, 'escalations'), real: true, minRole: 'editor' },
      { label: 'Alert History', to: tabLink(ALERTS, 'history'), real: true },
      { label: 'Maintenance Windows', to: tabLink(ALERTS, 'maintenance'), real: true, minRole: 'editor' },
    ],
  },
  {
    label: 'Issues',
    icon: 'issues',
    to: ISSUES,
    children: [
      { label: 'All Issues', to: ISSUES, real: true },
    ],
  },
  {
    label: 'Reports',
    icon: 'reports',
    to: REPORTS,
    children: [
      { label: 'Executive Reports', to: REPORTS, real: true },
      { label: 'Cost Reports', to: tabLink(REPORTS, 'Cost Reports'), real: true },
      { label: 'Security Reports', to: tabLink(REPORTS, 'Security Reports'), real: true },
      { label: 'Compliance Reports', to: tabLink(REPORTS, 'Compliance Reports'), real: true },
      { label: 'Inventory Reports', to: tabLink(REPORTS, 'Inventory Reports'), real: true },
      { label: 'Savings Reports', to: tabLink(REPORTS, 'Savings Reports'), real: true },
      { label: 'Scheduled Reports', to: tabLink(REPORTS, 'Scheduled Reports'), real: true, minRole: 'editor' },
      { label: 'Export Center', to: tabLink(REPORTS, 'Export Center'), real: true },
    ],
  },
  {
    label: 'Users & Groups',
    icon: 'users',
    to: USERS,
    minRole: 'admin',
    children: [
      { label: 'Users', to: USERS, real: true },
      { label: 'Groups', to: tabLink(USERS, 'Groups'), real: true },
      { label: 'Roles & Permissions', to: tabLink(USERS, 'Roles & Permissions'), real: true },
      { label: 'Project Access', to: tabLink(USERS, 'Project Access'), real: true },
      { label: 'API Keys', to: tabLink(USERS, 'API Keys'), real: true, minRole: 'admin' },
      { label: 'Audit Logs', to: tabLink(USERS, 'Audit Logs'), real: true },
    ],
  },
  {
    label: 'Organization Management',
    icon: 'organization',
    to: ORG,
    minRole: 'admin',
    children: [
      { label: 'Organizations', to: ORG, real: true },
      { label: 'Folders', to: tabLink(ORG, 'Folders'), real: true, minRole: 'editor' },
      { label: 'Projects', to: tabLink(ORG, 'Projects'), real: true, minRole: 'editor' },
      { label: 'Environments', to: tabLink(ORG, 'Environments'), real: true },
      { label: 'Business Units', to: tabLink(ORG, 'Business Units'), real: true, minRole: 'editor' },
      { label: 'Cost Centers', to: tabLink(ORG, 'Cost Centers'), real: true, minRole: 'editor' },
      { label: 'Tags', to: tabLink(ORG, 'Tags'), real: true },
      { label: 'Ownership', to: tabLink(ORG, 'Ownership'), real: true },
    ],
  },
  {
    label: 'Automation',
    icon: 'automation',
    to: AUTOMATION,
    minRole: 'editor',
    children: [
      { label: 'Runbooks', to: AUTOMATION, real: true },
      { label: 'Workflows', to: tabLink(AUTOMATION, 'workflows'), real: true },
      { label: 'Scheduled Jobs', to: tabLink(AUTOMATION, 'scheduled'), real: true },
      { label: 'Remediation', to: tabLink(AUTOMATION, 'remediation'), real: true, minRole: 'editor' },
      { label: 'Webhooks', to: tabLink(AUTOMATION, 'webhooks'), real: true },
      { label: 'Integrations', to: tabLink(AUTOMATION, 'integrations'), real: true },
      { label: 'Execution History', to: tabLink(AUTOMATION, 'history'), real: true },
    ],
  },
  {
    label: 'Settings',
    icon: 'settings',
    to: SETTINGS,
    minRole: 'editor',
    children: [
      { label: 'Profile', to: SETTINGS, real: true },
      { label: 'Cloud Integrations', to: tabLink(SETTINGS, 'Cloud Integrations'), real: true, minRole: 'editor' },
      { label: 'Billing', to: tabLink(SETTINGS, 'Billing'), real: true, roles: ['billing_admin', 'admin', 'owner'] },
      { label: 'Notifications', to: tabLink(SETTINGS, 'Notifications'), real: true },
      { label: 'Credentials', to: tabLink(SETTINGS, 'Credentials'), real: true, minRole: 'admin' },
      { label: 'RBAC', to: tabLink(SETTINGS, 'RBAC'), real: true, minRole: 'admin' },
      { label: 'System Settings', to: tabLink(SETTINGS, 'System Settings'), real: true, minRole: 'admin' },
      { label: 'Recommendation Rules', to: tabLink(SETTINGS, 'Recommendation Rules'), real: true, minRole: 'editor' },
      { label: 'Git Integration', to: tabLink(SETTINGS, 'Git Integration'), real: true, minRole: 'editor' },
      { label: 'Branding', to: tabLink(SETTINGS, 'Branding'), real: true, minRole: 'admin' },
      { label: 'License', to: tabLink(SETTINGS, 'License'), real: true, roles: ['billing_admin', 'admin', 'owner'] },
    ],
  },
  ...(isBillingEnabled() ? [{
    label: 'Subscription',
    icon: 'credit-card',
    to: SUBSCRIPTION,
    roles: ['billing_admin', 'admin', 'owner'] as Role[],
    children: [
      { label: 'Plans', to: SUBSCRIPTION, real: true },
      { label: 'Usage', to: tabLink(SUBSCRIPTION, 'Usage'), real: true },
      { label: 'Invoices', to: tabLink(SUBSCRIPTION, 'Invoices'), real: true },
      { label: 'Referrals', to: tabLink(SUBSCRIPTION, 'Referrals'), real: true },
    ],
  }] : []),
];

/**
 * Checks whether a role meets a module/child's permission requirement.
 * - If neither `minRole` nor `roles` is set, item is visible to all.
 * - `minRole` = minimum role threshold (e.g. 'editor' means editor+).
 * - `roles` = explicit allow-list.
 */
export function canSee(item: { minRole?: Role; roles?: Role[] }, role: Role): boolean {
  if (item.roles) return item.roles.includes(role);
  if (item.minRole) return ROLE_RANK[role] >= ROLE_RANK[item.minRole];
  return true;
}

/**
 * Module-level visibility, permission-aware. An explicit entry in
 * `permissions` (keyed by the module's `icon`/menu_key) fully determines
 * visibility for that module — independent of its minRole/roles — since
 * the whole point of an explicit override is to grant or restrict access
 * a role-only check couldn't express. No entry (or no permissions map at
 * all, e.g. still loading) falls back to the plain role check.
 */
export function canSeeModule(mod: NavModule, role: Role, permissions?: Record<string, MenuPermissionLevel> | null): boolean {
  const override = permissions?.[mod.icon];
  if (override) return override !== 'none';
  return canSee(mod, role);
}

/**
 * RBAC submenu-level permissions. A child's menu_key is derived from its
 * parent module's icon + a slug of its own label (e.g. 'cost:cost-explorer')
 * — children have no stable id of their own today, and labels are unique
 * within a module's children array, so this is deterministic without a
 * schema change (menu_permissions.menu_key is a free-form text column).
 */
export function submenuKey(parentIcon: string, childLabel: string): string {
  const slug = childLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return `${parentIcon}:${slug}`;
}

/**
 * Child-level visibility, permission-aware — same precedence as
 * canSeeModule: an explicit submenu override fully determines visibility,
 * independent of minRole/roles; no override falls back to the role check.
 */
export function canSeeChild(child: NavChild, role: Role, parentIcon: string, permissions?: Record<string, MenuPermissionLevel> | null): boolean {
  const override = permissions?.[submenuKey(parentIcon, child.label)];
  if (override) return override !== 'none';
  return canSee(child, role);
}

/**
 * Finds a child's real, fully-specified NavChild entry (the one carrying its
 * actual minRole/roles) by parent icon + label. Used by useCanSeeSubmenu so
 * an in-page tab guard enforces the same role floor as the sidebar, instead
 * of a label-only synthetic child that (having no minRole/roles of its own)
 * would let anyone past regardless of role for any tab lacking an explicit
 * admin override — the sidebar hides the tab, but a direct
 * `?tab=<restricted>` URL wouldn't have been blocked without this.
 */
export function findNavChild(parentIcon: string, label: string): NavChild | undefined {
  return NAV_MODULES.find(m => m.icon === parentIcon)?.children.find(c => c.label === label);
}

/**
 * Returns the navigation modules visible to the given role (and, when
 * provided, effective menu permissions). Filters each module by its own
 * permission, then filters children by their own submenu-level permission
 * (falling back to role check when no explicit override exists). A module
 * with no visible children is hidden entirely.
 */
export function getVisibleModules(role: Role, permissions?: Record<string, MenuPermissionLevel> | null): NavModule[] {
  return NAV_MODULES
    .filter((mod) => canSeeModule(mod, role, permissions))
    .map((mod) => ({
      ...mod,
      children: mod.children.filter((child) => canSeeChild(child, role, mod.icon, permissions)),
    }))
    .filter((mod) => mod.children.length > 0 || mod.to);
}

function pathOnly(to: string): string {
  const i = to.indexOf('?');
  return i === -1 ? to : to.slice(0, i);
}

/** True if `pathname` belongs to this module — its own landing page or any real child route (query strings ignored). */
export function moduleMatchesPath(mod: NavModule, pathname: string): boolean {
  if (mod.to && pathname.startsWith(mod.to)) return true;
  return mod.children.some(c => c.to && pathname.startsWith(pathOnly(c.to)));
}

/**
 * Which of the 15 domain apps the current route belongs to — the single
 * source of truth for both AppRail (which icon is "active") and Sidebar
 * (which module's own sub-nav to render). Falls back to Overview so the
 * shell never renders with no module selected (e.g. on a route no module
 * claims, though App.tsx's catch-all already sends unknown paths to /overview).
 */
export function findActiveModule(pathname: string): NavModule {
  return NAV_MODULES.find(m => moduleMatchesPath(m, pathname)) ?? NAV_MODULES[0];
}

/** path + tab + hash identity a child's `to` resolves to — the unit isChildActive dedupes/compares on, not the raw `to` string (two children can carry different `to` values that land on the exact same page+tab, e.g. Resources' Dependency Graph and Bulk Operations both resolving to /resources/all with no distinguishing tab). */
function childIdentity(child: NavChild): string | null {
  if (!child.to) return null;
  const [beforeHash, hash = ''] = child.to.split('#');
  const [path, query] = beforeHash.split('?');
  const tab = query ? new URLSearchParams(query).get('tab') : null;
  return `${path}|${tab ?? ''}|${hash}`;
}

/**
 * Whether `child` is the one currently showing, for sidebar highlighting.
 * Compares pathname, the `tab` query param, and the hash fragment (if the
 * child's `to` carries one) — NavLink's own `isActive` only looks at
 * pathname, which would light up every sibling sharing one URL at once now
 * that most of them carry distinct `?tab=` values or (Overview) distinct
 * `#section` anchors.
 *
 * `siblings` is the module's full children list. `hash` must be the
 * caller's actual `location.hash` (including the leading `#`, or empty
 * string) — omitting it previously made every hash-anchor sibling
 * (Overview's Executive Dashboard/Activity Timeline/Quick Actions/
 * Favorites) match simultaneously, since the hash was stripped before any
 * comparison happened at all.
 */
export function isChildActive(child: NavChild, siblings: NavChild[], pathname: string, search: string, hash: string): boolean {
  if (!child.to) return false;
  const [beforeHash, childHash = ''] = child.to.split('#');
  const [childPath, childQuery] = beforeHash.split('?');
  if (pathname !== childPath) return false;
  const currentTab = new URLSearchParams(search).get('tab');
  const childTab = childQuery ? new URLSearchParams(childQuery).get('tab') : null;
  if ((currentTab ?? null) !== (childTab ?? null)) return false;
  if (childHash && hash.replace(/^#/, '') !== childHash) return false;
  const thisIdentity = childIdentity(child);
  const sharedBy = siblings.filter(s => childIdentity(s) === thisIdentity).length;
  return sharedBy === 1;
}