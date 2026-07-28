/**
 * Full 15-module information architecture. Every module and sub-item below
 * is real product scope, not aspiration copy — but not everything listed has
 * a feature behind it yet. `to` present + `real: true` means the item
 * genuinely opens the thing it describes (often a section of a bigger page,
 * not its own URL — several sub-items can share one `to`). `real: false`
 * renders disabled with a "Soon" tag instead of a dead or fake link, per the
 * "never build placeholder pages" rule — the label is honest about what's
 * planned, the disabled state is honest about what isn't built yet.
 *
 * Several modules render as an in-page tabbed workspace (AwsAccounts.tsx,
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
 */

export interface NavChild {
  label: string;
  to?: string;
  /** Opens the floating chat assistant instead of navigating — used for the
   * per-module "AI Copilot" entries, which are one real assistant (grounded
   * in your own data, see ChatWidget.tsx) rather than a separate page per module. */
  action?: 'open-chat';
  real: boolean;
}

export interface NavModule {
  label: string;
  icon: string;
  to?: string; // present when the module itself has a real landing page
  children: NavChild[];
}

const OVERVIEW = '/overview';
const ACCOUNTS = '/aws-accounts';
const RESOURCES = '/resources';
const COST = '/cost-management';
const OPT = '/cost-optimization';
const VULN = '/vulnerability-management';
const CLUSTERS = '/clusters';
const MON = '/monitoring';
const ALERTS = '/alerts';
const REPORTS = '/reports';
const USERS = '/users-groups';
const ORG = '/organization';
const SETTINGS = '/settings';
const DASHBOARDS = '/custom-dashboards';
const AUTOMATION = '/automation';

/** `${base}?tab=<value>`, URL-encoded — the query-string half of the sidebar/in-page-tab link between navConfig and a tabbed page's useTabParam. */
function tabLink(base: string, tab: string): string {
  return `${base}?tab=${encodeURIComponent(tab)}`;
}

export const NAV_MODULES: NavModule[] = [
  {
    label: 'Overview',
    icon: '◈',
    to: OVERVIEW,
    children: [
      { label: 'Executive Dashboard', to: OVERVIEW, real: true },
      { label: 'Activity Timeline', to: OVERVIEW, real: true },
      { label: 'Quick Actions', to: OVERVIEW, real: true },
      { label: 'Favorites', to: OVERVIEW, real: true },
    ],
  },
  {
    label: 'AWS Accounts',
    icon: '☁',
    to: ACCOUNTS,
    children: [
      { label: 'Account Inventory', to: ACCOUNTS, real: true },
      { label: 'Account Onboarding', to: ACCOUNTS, real: true },
      { label: 'Organizations', to: tabLink(ACCOUNTS, 'Organizations'), real: true },
      { label: 'Cross-Account Roles', to: tabLink(ACCOUNTS, 'Cross-Account Roles'), real: true },
      { label: 'Credentials', to: tabLink(ACCOUNTS, 'Credentials'), real: true },
      { label: 'Sync Status', to: tabLink(ACCOUNTS, 'Sync Status'), real: true },
      { label: 'Account Health', to: tabLink(ACCOUNTS, 'Health'), real: true },
    ],
  },
  {
    label: 'Resources',
    icon: '▦',
    to: RESOURCES,
    children: [
      { label: 'Resource Inventory', to: RESOURCES, real: true },
      { label: 'Resource Explorer', to: RESOURCES, real: true },
      { label: 'Global Search', to: `${RESOURCES}/all`, real: true },
      { label: 'Dependency Graph', to: `${RESOURCES}/all`, real: true },
      { label: 'Resource Relationships', to: `${RESOURCES}/all`, real: true },
      { label: 'Tags Explorer', to: `${RESOURCES}/all`, real: true },
      { label: 'Resource Timeline', to: `${RESOURCES}/all`, real: true },
      { label: 'Bulk Operations', to: `${RESOURCES}/all`, real: true },
    ],
  },
  {
    label: 'Custom Dashboards',
    icon: '▧',
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
    icon: '$',
    to: COST,
    children: [
      { label: 'Cost Explorer', to: COST, real: true },
      { label: 'Cost Analytics', to: COST, real: true },
      { label: 'Forecast', to: COST, real: true },
      { label: 'Budgets', to: COST, real: true },
      { label: 'Cost Allocation', to: COST, real: true },
      { label: 'Chargeback', to: COST, real: true },
      { label: 'Showback', to: COST, real: true },
      { label: 'Cost Reports', to: COST, real: true },
    ],
  },
  {
    label: 'Cost Optimization',
    icon: '↓$',
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
    icon: '⚠',
    to: VULN,
    children: [
      { label: 'Security Hub', to: VULN, real: true },
      { label: 'GuardDuty', to: tabLink(VULN, 'GuardDuty'), real: true },
      { label: 'Inspector', to: tabLink(VULN, 'Inspector'), real: true },
      { label: 'IAM Access Analyzer', to: tabLink(VULN, 'IAM Access Analyzer'), real: true },
      { label: 'AWS Config', to: tabLink(VULN, 'AWS Config'), real: true },
      { label: 'Security Findings', to: tabLink(VULN, 'Security Findings'), real: true },
      { label: 'Compliance', to: tabLink(VULN, 'Compliance'), real: true },
      { label: 'Trusted Advisor', to: tabLink(VULN, 'Trusted Advisor'), real: true },
    ],
  },
  {
    label: 'Containers',
    icon: '⬡',
    to: CLUSTERS,
    children: [
      { label: 'ECS Clusters', to: CLUSTERS, real: true },
      { label: 'ECS Services', to: tabLink(CLUSTERS, 'ECS Services'), real: true },
      { label: 'ECS Tasks', to: tabLink(CLUSTERS, 'ECS Tasks'), real: true },
      { label: 'EKS Clusters', to: tabLink(CLUSTERS, 'EKS Clusters'), real: true },
      { label: 'Nodes', to: tabLink(CLUSTERS, 'Nodes'), real: true },
      // Namespaces/Deployments/Pods/Helm Releases aren't gated behind a tab —
      // they're not buildable in this pass (no Kubernetes API access to any
      // cluster), so they show as an always-visible honest "not integrated"
      // panel under every tab rather than their own empty section.
      { label: 'Namespaces', to: CLUSTERS, real: true },
      { label: 'Deployments', to: CLUSTERS, real: true },
      { label: 'Pods', to: CLUSTERS, real: true },
      { label: 'Helm Releases', to: CLUSTERS, real: true },
    ],
  },
  {
    label: 'Monitoring',
    icon: '∿',
    to: MON,
    children: [
      { label: 'CloudWatch', to: MON, real: true },
      { label: 'Metrics', to: MON, real: true },
      { label: 'Logs', to: MON, real: true },
      { label: 'Traces', to: MON, real: true },
      { label: 'Dashboards', to: MON, real: true },
      { label: 'Health', to: MON, real: true },
      { label: 'Service Map', to: MON, real: true },
      { label: 'Performance', to: MON, real: true },
    ],
  },
  {
    label: 'Alerts',
    icon: '🔔',
    to: ALERTS,
    children: [
      { label: 'Active Alerts', to: ALERTS, real: true },
      { label: 'Alert Rules', to: tabLink(ALERTS, 'rules'), real: true },
      { label: 'Notification Channels', to: tabLink(ALERTS, 'channels'), real: true },
      { label: 'Escalation Policies', to: tabLink(ALERTS, 'escalations'), real: true },
      { label: 'Alert History', to: tabLink(ALERTS, 'history'), real: true },
      { label: 'Maintenance Windows', to: tabLink(ALERTS, 'maintenance'), real: true },
    ],
  },
  {
    label: 'Reports',
    icon: '▤',
    to: REPORTS,
    children: [
      { label: 'Executive Reports', to: REPORTS, real: true },
      { label: 'Cost Reports', to: REPORTS, real: true },
      { label: 'Security Reports', to: REPORTS, real: true },
      { label: 'Compliance Reports', to: REPORTS, real: true },
      { label: 'Inventory Reports', to: REPORTS, real: true },
      { label: 'Scheduled Reports', to: REPORTS, real: true },
      { label: 'Export Center', to: REPORTS, real: true },
    ],
  },
  {
    label: 'Users & Groups',
    icon: '◔',
    to: USERS,
    children: [
      { label: 'Users', to: USERS, real: true },
      { label: 'Groups', to: USERS, real: true },
      { label: 'Roles', to: USERS, real: true },
      { label: 'Permissions', to: USERS, real: true },
      { label: 'API Keys', to: USERS, real: true },
      { label: 'Audit Logs', to: USERS, real: true },
    ],
  },
  {
    label: 'Organization Management',
    icon: '⚙',
    to: ORG,
    children: [
      { label: 'Organizations', to: ORG, real: true },
      { label: 'Folders', to: ORG, real: true },
      { label: 'Projects', to: ORG, real: true },
      { label: 'Environments', to: ORG, real: true },
      { label: 'Business Units', to: ORG, real: true },
      { label: 'Cost Centers', to: ORG, real: true },
      { label: 'Tags', to: ORG, real: true },
      { label: 'Ownership', to: ORG, real: true },
    ],
  },
  {
    label: 'Automation',
    icon: '⚡',
    to: AUTOMATION,
    children: [
      { label: 'Runbooks', to: AUTOMATION, real: true },
      { label: 'Workflows', to: tabLink(AUTOMATION, 'workflows'), real: true },
      { label: 'Scheduled Jobs', to: tabLink(AUTOMATION, 'scheduled'), real: true },
      { label: 'Remediation', to: tabLink(AUTOMATION, 'remediation'), real: true },
      { label: 'Webhooks', to: tabLink(AUTOMATION, 'webhooks'), real: true },
      { label: 'Integrations', to: tabLink(AUTOMATION, 'integrations'), real: true },
    ],
  },
  {
    label: 'Settings',
    icon: '●',
    to: SETTINGS,
    children: [
      { label: 'AWS Integrations', to: SETTINGS, real: true },
      { label: 'Billing', to: SETTINGS, real: true },
      { label: 'Notifications', to: SETTINGS, real: true },
      { label: 'Credentials', to: SETTINGS, real: true },
      { label: 'RBAC', to: SETTINGS, real: true },
      { label: 'System Settings', to: SETTINGS, real: true },
      { label: 'Branding', to: SETTINGS, real: true },
      { label: 'License', to: SETTINGS, real: true },
    ],
  },
];

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

/**
 * Whether `child` is the one currently showing, for sidebar highlighting.
 * Compares pathname AND the `tab` query param (if the child's `to` carries
 * one) — NavLink's own `isActive` only looks at pathname, which would light
 * up every sibling sharing one URL at once now that most of them carry
 * distinct `?tab=` values.
 */
export function isChildActive(child: NavChild, pathname: string, search: string): boolean {
  if (!child.to) return false;
  const [childPath, childQuery] = child.to.split('?');
  if (pathname !== childPath) return false;
  const currentTab = new URLSearchParams(search).get('tab');
  const childTab = childQuery ? new URLSearchParams(childQuery).get('tab') : null;
  return (currentTab ?? null) === (childTab ?? null);
}
