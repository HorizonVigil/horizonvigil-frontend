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
    { label: 'Organizations', to: ACCOUNTS, real: true },
    { label: 'Cross-Account Roles', to: ACCOUNTS, real: true },
    { label: 'Credentials', to: ACCOUNTS, real: true },
    { label: 'Sync Status', to: ACCOUNTS, real: true },
    { label: 'Account Health', to: ACCOUNTS, real: true },
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
    { label: 'Shared Dashboards', to: DASHBOARDS, real: true },
    { label: 'Dashboard Templates', to: DASHBOARDS, real: true },
    { label: 'Widget Library', to: DASHBOARDS, real: true },
  
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
    { label: 'Cost Reports', to: REPORTS, real: true },
 
    ],
  },
  {
  label: 'Cost Optimization',
  icon: '↓$',
  to: OPT,
  children: [
    { label: 'Savings Opportunities', to: OPT, real: true },
    { label: 'Rightsizing', to: OPT, real: true },
    { label: 'Idle Resources', to: OPT, real: true },
    { label: 'Reserved Instances', to: OPT, real: true },
    { label: 'Savings Plans', to: OPT, real: true },
    { label: 'Cost Anomalies', to: OPT, real: true },
    { label: 'Optimization History', to: OPT, real: true },
  ],
},
  {
  label: 'Vulnerability Management',
  icon: '⚠',
  to: VULN,
  children: [
    { label: 'Security Hub', to: VULN, real: true },
    { label: 'GuardDuty', to: VULN, real: true },
    { label: 'Inspector', to: VULN, real: true },
    { label: 'IAM Access Analyzer', to: VULN, real: true },
    { label: 'AWS Config', to: VULN, real: true },
    { label: 'Security Findings', to: VULN, real: true },
    { label: 'Compliance', to: VULN, real: true },
    { label: 'Trusted Advisor', to: VULN, real: true },
  ],
},
  {
  label: 'Containers',
  icon: '⬡',
  to: CLUSTERS,
  children: [
    { label: 'ECS Clusters', to: CLUSTERS, real: true },
    { label: 'ECS Services', to: CLUSTERS, real: true },
    { label: 'ECS Tasks', to: CLUSTERS, real: true },
    { label: 'EKS Clusters', to: CLUSTERS, real: true },
    { label: 'Nodes', to: CLUSTERS, real: true },
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
    { label: 'Alert Rules', to: ALERTS, real: true },
    { label: 'Notification Channels', to: ALERTS, real: true },
    { label: 'Escalation Policies', to: ALERTS, real: true },
    { label: 'Alert History', to: ALERTS, real: true },
    { label: 'Maintenance Windows', to: ALERTS, real: true },
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
    { label: 'Audit Logs', to: ORG, real: true },
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
    { label: 'Workflows', to: AUTOMATION, real: true },
    { label: 'Scheduled Jobs', to: AUTOMATION, real: true },
    { label: 'Remediation', to: AUTOMATION, real: true },
    { label: 'Webhooks', to: AUTOMATION, real: true },
    { label: 'Integrations', to: AUTOMATION, real: true },
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

/** True if `pathname` belongs to this module — its own landing page or any real child route. */
export function moduleMatchesPath(mod: NavModule, pathname: string): boolean {
  if (mod.to && pathname.startsWith(mod.to)) return true;
  return mod.children.some(c => c.to && pathname.startsWith(c.to));
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
