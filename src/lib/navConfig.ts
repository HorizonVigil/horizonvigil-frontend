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
const INTEGRATIONS = '/integrations';

export const NAV_MODULES: NavModule[] = [
  {
    label: 'Overview', icon: '◈', to: OVERVIEW,
    children: [
      { label: 'Executive Dashboard', to: OVERVIEW, real: true },
      { label: 'Cost Overview', to: OVERVIEW, real: true },
      { label: 'Resource Overview', to: OVERVIEW, real: true },
      { label: 'Recent Activity', to: OVERVIEW, real: true },
      { label: 'Business Dashboard', real: false },
      { label: 'Engineering Dashboard', real: false },
      { label: 'Cloud Health', real: false },
      { label: 'Security Overview', real: false },
      { label: 'Recent Alerts', real: false },
      { label: 'AI Executive Summary', real: false },
      { label: 'Quick Actions', real: false },
      { label: 'Favorites', real: false },
      { label: 'Bookmarks', real: false },
      { label: 'Announcements', real: false },
    ],
  },
  {
    label: 'AWS Accounts', icon: '☁', to: ACCOUNTS,
    children: [
      { label: 'Account Inventory', to: ACCOUNTS, real: true },
      { label: 'Account Explorer', to: ACCOUNTS, real: true },
      { label: 'Cross Account Roles', to: ACCOUNTS, real: true },
      { label: 'Credential Management', to: ACCOUNTS, real: true },
      { label: 'Connection Validation', to: ACCOUNTS, real: true },
      { label: 'Region Discovery', to: ACCOUNTS, real: true },
      { label: 'Sync Status', to: ACCOUNTS, real: true },
      { label: 'Health', to: ACCOUNTS, real: true },
      { label: 'Account Cost', to: ACCOUNTS, real: true },
      { label: 'Organizations (AWS Orgs)', real: false },
      { label: 'Discovery Jobs', real: false },
      { label: 'Sync History', real: false },
      { label: 'Account Metrics', real: false },
      { label: 'Recommendations', real: false },
      { label: 'Activity Timeline', real: false },
      { label: 'Audit Logs', to: ORG, real: true },
    ],
  },
  {
    label: 'Resources', icon: '▦', to: RESOURCES,
    children: [
      { label: 'Resource Inventory', to: RESOURCES, real: true },
      { label: 'Resource Explorer', to: RESOURCES, real: true },
      { label: 'Global Search', to: `${RESOURCES}/all`, real: true },
      { label: 'Tags Explorer', to: `${RESOURCES}/all`, real: true },
      { label: 'Resource Health', to: `${RESOURCES}/all`, real: true },
      { label: 'Resource Cost', to: `${RESOURCES}/all`, real: true },
      { label: 'Resource Metrics', to: `${RESOURCES}/all`, real: true },
      { label: 'Recently Discovered', to: `${RESOURCES}/all`, real: true },
      { label: 'Dependency Graph', real: false },
      { label: 'Relationships', real: false },
      { label: 'Timeline', real: false },
      { label: 'Resource Ownership', real: false },
      { label: 'Bulk Operations', real: false },
      { label: 'Recommendations', to: OPT, real: true },
      { label: 'Deleted Resources', real: false },
      { label: 'Orphan Resources', real: false },
    ],
  },
  {
    label: 'Custom Dashboards', icon: '▧',
    children: [
      { label: 'My Dashboards', real: false },
      { label: 'Shared Dashboards', real: false },
      { label: 'Templates', real: false },
      { label: 'Widget Library', real: false },
      { label: 'Dashboard Analytics', real: false },
      { label: 'Favorites', real: false },
      { label: 'Dashboard History', real: false },
      { label: 'Permissions', real: false },
    ],
  },
  {
    label: 'Cost Management', icon: '$', to: COST,
    children: [
      { label: 'Cost Explorer', to: COST, real: true },
      { label: 'Daily Cost', to: COST, real: true },
      { label: 'Monthly Cost', to: COST, real: true },
      { label: 'Forecast', to: COST, real: true },
      { label: 'Budgets', to: COST, real: true },
      { label: 'Showback', to: COST, real: true },
      { label: 'Cost by Account', to: COST, real: true },
      { label: 'Cost by Service', to: COST, real: true },
      { label: 'Cost by Region', to: COST, real: true },
      { label: 'Cost by Tag', to: COST, real: true },
      { label: 'Cost Anomalies', to: COST, real: true },
      { label: 'Cost Reports', to: REPORTS, real: true },
      { label: 'AI Cost Assistant', action: 'open-chat', real: true },
      { label: 'Chargeback', real: false },
      { label: 'Cost Allocation', real: false },
      { label: 'Invoices', real: false },
      { label: 'Billing History', real: false },
    ],
  },
  {
    label: 'Cost Optimization', icon: '↓$', to: OPT,
    children: [
      { label: 'Savings Opportunities', to: OPT, real: true },
      { label: 'Rightsizing', to: OPT, real: true },
      { label: 'Idle Resources', to: OPT, real: true },
      { label: 'Reserved Instances', to: OPT, real: true },
      { label: 'Savings Plans', to: OPT, real: true },
      { label: 'Monthly Savings', to: OPT, real: true },
      { label: 'Annual Savings', to: OPT, real: true },
      { label: 'CLI Suggestions', to: OPT, real: true },
      { label: 'Spot Opportunities', real: false },
      { label: 'Unused Storage', real: false },
      { label: 'Idle Databases', real: false },
      { label: 'Idle Load Balancers', real: false },
      { label: 'Idle NAT Gateways', real: false },
      { label: 'Optimization History', real: false },
      { label: 'Automation Suggestions', real: false },
      { label: 'Terraform Suggestions', real: false },
    ],
  },
  {
    label: 'Vulnerability Management', icon: '⚠', to: VULN,
    children: [
      { label: 'Security Findings', to: VULN, real: true },
      { label: 'GuardDuty', to: VULN, real: true },
      { label: 'Security Hub', to: VULN, real: true },
      { label: 'Inspector', to: VULN, real: true },
      { label: 'Critical Findings', to: VULN, real: true },
      { label: 'High Findings', to: VULN, real: true },
      { label: 'Medium Findings', to: VULN, real: true },
      { label: 'Resolved Findings', to: VULN, real: true },
      { label: 'IAM Access Analyzer', real: false },
      { label: 'AWS Config', real: false },
      { label: 'Trusted Advisor', real: false },
      { label: 'Compliance', real: false },
      { label: 'CVE Explorer', real: false },
      { label: 'Misconfigurations', real: false },
      { label: 'Security Timeline', real: false },
      { label: 'Security Reports', real: false },
    ],
  },
  {
    label: 'Containers', icon: '⬡', to: CLUSTERS,
    children: [
      { label: 'EKS Clusters', to: CLUSTERS, real: true },
      { label: 'ECS Clusters', to: CLUSTERS, real: true },
      { label: 'Node Groups', to: CLUSTERS, real: true },
      { label: 'ECR Repositories', to: `${RESOURCES}/Containers/ecr`, real: true },
      { label: 'Container Metrics', to: CLUSTERS, real: true },
      { label: 'Cluster Cost', to: CLUSTERS, real: true },
      { label: 'ECS Services', real: false },
      { label: 'ECS Tasks', real: false },
      { label: 'Task Definitions', real: false },
      { label: 'Nodes', real: false },
      { label: 'Namespaces', real: false },
      { label: 'Deployments', real: false },
      { label: 'ReplicaSets', real: false },
      { label: 'DaemonSets', real: false },
      { label: 'Pods', real: false },
      { label: 'Services', real: false },
      { label: 'Ingress', real: false },
      { label: 'Helm Releases', real: false },
      { label: 'Recommendations', real: false },
    ],
  },
  {
    label: 'Monitoring', icon: '∿', to: MON,
    children: [
      { label: 'CloudWatch', to: MON, real: true },
      { label: 'Metrics', to: MON, real: true },
      { label: 'Health', to: MON, real: true },
      { label: 'CloudWatch Alarms', to: MON, real: true },
      { label: 'Events', to: RESOURCES, real: true },
      { label: 'AI Monitoring Assistant', action: 'open-chat', real: true },
      { label: 'Logs', real: false },
      { label: 'Log Explorer', real: false },
      { label: 'Traces', real: false },
      { label: 'Dashboards', real: false },
      { label: 'Availability', real: false },
      { label: 'Latency', real: false },
      { label: 'Performance', real: false },
      { label: 'Service Map', real: false },
      { label: 'Application Map', real: false },
      { label: 'Infrastructure Map', real: false },
      { label: 'Recent Incidents', real: false },
    ],
  },
  {
    label: 'Alerts', icon: '🔔', to: ALERTS,
    children: [
      { label: 'Active Alerts', to: ALERTS, real: true },
      { label: 'Alert Rules', to: ALERTS, real: true },
      { label: 'Notification Channels', to: ALERTS, real: true },
      { label: 'Alert History', to: ALERTS, real: true },
      { label: 'Critical Alerts', real: false },
      { label: 'Escalation Policies', real: false },
      { label: 'Maintenance Windows', real: false },
      { label: 'Suppression Rules', real: false },
      { label: 'Incident Timeline', real: false },
    ],
  },
  {
    label: 'Reports', icon: '▤', to: REPORTS,
    children: [
      { label: 'Cost Reports', to: REPORTS, real: true },
      { label: 'Inventory Reports', to: REPORTS, real: true },
      { label: 'Optimization Reports', to: REPORTS, real: true },
      { label: 'Scheduled Reports', to: REPORTS, real: true },
      { label: 'Export Center', to: REPORTS, real: true },
      { label: 'History', to: REPORTS, real: true },
      { label: 'Executive Reports', real: false },
      { label: 'Security Reports', real: false },
      { label: 'Compliance Reports', real: false },
      { label: 'Templates', real: false },
    ],
  },
  {
    label: 'Users & Groups', icon: '◔', to: USERS,
    children: [
      { label: 'Users', to: USERS, real: true },
      { label: 'Groups', to: USERS, real: true },
      { label: 'Roles', to: USERS, real: true },
      { label: 'Permissions', to: USERS, real: true },
      { label: 'Audit Logs', to: ORG, real: true },
      { label: 'API Keys', to: SETTINGS, real: false },
      { label: 'Sessions', real: false },
      { label: 'Login History', real: false },
      { label: 'Activity', real: false },
    ],
  },
  {
    label: 'Organization Management', icon: '⚙', to: ORG,
    children: [
      { label: 'Organizations', to: ORG, real: true },
      { label: 'Folders', to: ORG, real: true },
      { label: 'Projects', to: ORG, real: true },
      { label: 'Audit Logs', to: ORG, real: true },
      { label: 'Hierarchy Explorer', to: ORG, real: true },
      { label: 'Business Units', real: false },
      { label: 'Cost Centers', real: false },
      { label: 'Teams', to: USERS, real: true },
      { label: 'Environments', real: false },
      { label: 'Ownership', real: false },
      { label: 'Tag Policies', real: false },
    ],
  },
  {
    label: 'Automation', icon: '⚡',
    children: [
      { label: 'Runbooks', real: false },
      { label: 'Workflows', real: false },
      { label: 'Scheduled Jobs', real: false },
      { label: 'Remediation', real: false },
      { label: 'Automation History', real: false },
      { label: 'Templates', real: false },
      { label: 'Webhooks', to: INTEGRATIONS, real: true },
      { label: 'Integrations', to: INTEGRATIONS, real: true },
      { label: 'Approvals', real: false },
      { label: 'Execution Logs', real: false },
      { label: 'AI Automation Builder', real: false },
    ],
  },
  {
    label: 'Settings', icon: '●', to: SETTINGS,
    children: [
      { label: 'AWS Integrations', to: ACCOUNTS, real: true },
      { label: 'RBAC', to: USERS, real: true },
      { label: 'Notifications', to: ALERTS, real: true },
      { label: 'Billing', real: false },
      { label: 'Credentials', real: false },
      { label: 'System Settings', real: false },
      { label: 'Branding', real: false },
      { label: 'Licenses', real: false },
      { label: 'Feature Flags', real: false },
      { label: 'API Configuration', real: false },
    ],
  },
];
