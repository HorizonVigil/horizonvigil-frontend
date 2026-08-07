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
 */

import { isBillingEnabled } from './featureFlags';

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
const ACCOUNTS = '/cloud-accounts';
const RESOURCES = '/resources';
const COST = '/cost-management';
const OPT = '/cost-optimization';
const VULN = '/vulnerability-management';
const CLUSTERS = '/clusters';
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
    // Fully merged multi-cloud module — was briefly two separate modules
    // ("Cloud Accounts" for AWS, "GCP Projects" for GCP) after the AWS ->
    // Cloud Accounts rename, but two entries for what's conceptually one
    // "your connected cloud accounts" concern was confusing (worse, they
    // shared one icon in the collapsed-by-default rail, so the second
    // module was easy to miss entirely). CloudAccounts.tsx's Inventory tab
    // now lists AWS accounts and GCP projects in one merged table, and
    // CloudAccountDetail.tsx routes a single /cloud-accounts/:id to
    // whichever provider's detail view actually applies.
    label: 'Cloud Accounts',
    icon: '☁',
    to: ACCOUNTS,
    // Consolidated from an earlier, larger list that had Account Explorer,
    // Connection Validation, Cross-Account Roles, Credentials, Sync Status,
    // Health, Permission Validation, and several purely-aliased items
    // (Discovery Status, Cost Summary, Recommendations, Audit Logs) each as
    // their own sidebar entry — most pointed at a tab that just re-showed
    // Dashboard or Inventory under a different label, which is exactly the
    // "duplicate page, different name" problem this list is meant to avoid.
    // Dashboard/Organizations/Regions/Sync Center/Reports stay AWS-only in
    // their data (see the TABS comment in CloudAccounts.tsx) — GCP has no
    // backend endpoints for those yet, so they're not padded with numbers
    // that would be fake for GCP projects. Inventory and Onboarding are the
    // two genuinely multi-cloud tabs.
    children: [
      // Dashboard is the default tab (see CloudAccounts.tsx useTabParam), so
      // its link is bare (no ?tab=) to match what useTabParam itself omits —
      // see isChildActive's exact-match comparison below.
      { label: 'Dashboard', to: ACCOUNTS, real: true },
      { label: 'Account Inventory', to: tabLink(ACCOUNTS, 'Inventory'), real: true },
      { label: 'Account Onboarding', to: tabLink(ACCOUNTS, 'Onboarding'), real: true },
      { label: 'Organizations', to: tabLink(ACCOUNTS, 'Organizations'), real: true },
      { label: 'Regions', to: tabLink(ACCOUNTS, 'Regions'), real: true },
      { label: 'Sync Center', to: tabLink(ACCOUNTS, 'Sync Center'), real: true },
      { label: 'Reports', to: tabLink(ACCOUNTS, 'Reports'), real: true },
      // Per-domain settings (distinct from the global Settings module, which
      // already covers AWS credentials/integrations org-wide) isn't built.
      { label: 'Settings', real: false },
    ],
  },
  {
    label: 'Resources',
    icon: '▦',
    to: RESOURCES,
    children: [
      { label: 'Resource Inventory', to: RESOURCES, real: true },
      { label: 'Resource Explorer', to: RESOURCES, real: true },
      { label: 'Global Search', to: tabLink(`${RESOURCES}/all`, 'Global Search'), real: true },
      // Dependency Graph is opened per-resource from the Drawer (see
      // Resources.tsx), not a standalone browsable view — lands on the
      // default All Resources tab, same bare URL as Bulk Operations below.
      { label: 'Dependency Graph', to: `${RESOURCES}/all`, real: true },
      { label: 'Resource Relationships', to: tabLink(`${RESOURCES}/all`, 'Resource Relationships'), real: true },
      { label: 'Tags Explorer', to: tabLink(`${RESOURCES}/all`, 'Tags Explorer'), real: true },
      { label: 'Resource Timeline', to: tabLink(`${RESOURCES}/all`, 'Resource Timeline'), real: true },
      // Bulk Operations is a mode toggle over the All Resources table, not a
      // separate tab — same bare URL as Dependency Graph above.
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
      // Cost Explorer is the default tab (see CostManagement.tsx's
      // useTabParam), so its link is bare (no ?tab=) to match what
      // useTabParam itself omits — see isChildActive's exact-match comparison.
      { label: 'Cost Explorer', to: COST, real: true },
      { label: 'Cost Analytics', to: tabLink(COST, 'Cost Analytics'), real: true },
      { label: 'Forecast', to: tabLink(COST, 'Forecast'), real: true },
      { label: 'Budgets', to: tabLink(COST, 'Budgets'), real: true },
      { label: 'Cost Allocation', to: tabLink(COST, 'Cost Allocation'), real: true },
      { label: 'Chargeback', to: tabLink(COST, 'Chargeback'), real: true },
      { label: 'Showback', to: tabLink(COST, 'Showback'), real: true },
      { label: 'Cost Reports', to: tabLink(COST, 'Cost Reports'), real: true },
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
      { label: 'Cloud Run', to: tabLink(CLUSTERS, 'Cloud Run'), real: true },
      { label: 'Artifact Registry', to: tabLink(CLUSTERS, 'Artifact Registry'), real: true },
      { label: 'GKE Clusters', to: tabLink(CLUSTERS, 'GKE Clusters'), real: true },
      // Deployments/Pods merge AWS EKS + GCP GKE data (both have real
      // Kubernetes-API-backed scanners now). Namespaces/Helm Releases still
      // have no scanner for either provider, so those tabs show an honest
      // "not integrated" panel instead of a table.
      { label: 'Deployments', to: tabLink(CLUSTERS, 'Deployments'), real: true },
      { label: 'Pods', to: tabLink(CLUSTERS, 'Pods'), real: true },
      { label: 'Namespaces', to: tabLink(CLUSTERS, 'Namespaces'), real: true },
      { label: 'Helm Releases', to: tabLink(CLUSTERS, 'Helm Releases'), real: true },
    ],
  },
  {
    label: 'Monitoring',
    icon: '∿',
    to: MON,
    children: [
      // CloudWatch is the default tab (see Monitoring.tsx's useTabParam), so
      // its link is bare (no ?tab=) to match what useTabParam itself omits —
      // see isChildActive's exact-match comparison above.
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
    // Cross-cutting triage view — merges cost recommendations, security
    // findings, and alerts client-side (see Issues.tsx's doc comment for
    // why that's a client-side merge of three already-real feeds, not a
    // new backend service). One page, so it has no sub-tabs of its own.
    label: 'Issues',
    icon: '⚠',
    to: ISSUES,
    children: [
      { label: 'All Issues', to: ISSUES, real: true },
    ],
  },
  {
    label: 'Reports',
    icon: '▤',
    to: REPORTS,
    children: [
      // Executive Reports is the default tab (see Reports.tsx's useTabParam),
      // so its link is bare (no ?tab=) — see isChildActive's exact-match comparison.
      { label: 'Executive Reports', to: REPORTS, real: true },
      { label: 'Cost Reports', to: tabLink(REPORTS, 'Cost Reports'), real: true },
      { label: 'Security Reports', to: tabLink(REPORTS, 'Security Reports'), real: true },
      { label: 'Compliance Reports', to: tabLink(REPORTS, 'Compliance Reports'), real: true },
      { label: 'Inventory Reports', to: tabLink(REPORTS, 'Inventory Reports'), real: true },
      // Not one of the original 7 — added because reports-api genuinely
      // supports a 'savings' category (the rule-based Savings Opportunities
      // report) with no other reachable destination in the sidebar otherwise.
      { label: 'Savings Reports', to: tabLink(REPORTS, 'Savings Reports'), real: true },
      { label: 'Scheduled Reports', to: tabLink(REPORTS, 'Scheduled Reports'), real: true },
      { label: 'Export Center', to: tabLink(REPORTS, 'Export Center'), real: true },
    ],
  },
  {
    label: 'Users & Groups',
    icon: '◔',
    to: USERS,
    children: [
      // Users is the default tab (see UsersGroups.tsx's useTabParam), so its
      // link is bare (no ?tab=) — see isChildActive's exact-match comparison.
      { label: 'Users', to: USERS, real: true },
      { label: 'Groups', to: tabLink(USERS, 'Groups'), real: true },
      { label: 'Roles', to: tabLink(USERS, 'Roles'), real: true },
      { label: 'Permissions', to: tabLink(USERS, 'Permissions'), real: true },
      { label: 'API Keys', to: tabLink(USERS, 'API Keys'), real: true },
      { label: 'Audit Logs', to: tabLink(USERS, 'Audit Logs'), real: true },
    ],
  },
  {
    label: 'Organization Management',
    icon: '⚙',
    to: ORG,
    children: [
      // Organizations is the default tab (see OrganizationManagement.tsx's
      // useTabParam), so its link is bare (no ?tab=) — see isChildActive's
      // exact-match comparison.
      { label: 'Organizations', to: ORG, real: true },
      { label: 'Folders', to: tabLink(ORG, 'Folders'), real: true },
      { label: 'Projects', to: tabLink(ORG, 'Projects'), real: true },
      { label: 'Environments', to: tabLink(ORG, 'Environments'), real: true },
      { label: 'Business Units', to: tabLink(ORG, 'Business Units'), real: true },
      { label: 'Cost Centers', to: tabLink(ORG, 'Cost Centers'), real: true },
      { label: 'Tags', to: tabLink(ORG, 'Tags'), real: true },
      { label: 'Ownership', to: tabLink(ORG, 'Ownership'), real: true },
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
      // Profile isn't one of the original 8 — Settings.tsx's default tab
      // (bare, no ?tab=) groups the per-you settings (profile, theme,
      // sign-out) that don't belong under any of the 8 per-org sections.
      { label: 'Profile', to: SETTINGS, real: true },
      { label: 'AWS Integrations', to: tabLink(SETTINGS, 'AWS Integrations'), real: true },
      { label: 'Billing', to: tabLink(SETTINGS, 'Billing'), real: true },
      { label: 'Notifications', to: tabLink(SETTINGS, 'Notifications'), real: true },
      { label: 'Credentials', to: tabLink(SETTINGS, 'Credentials'), real: true },
      { label: 'RBAC', to: tabLink(SETTINGS, 'RBAC'), real: true },
      { label: 'System Settings', to: tabLink(SETTINGS, 'System Settings'), real: true },
      { label: 'Branding', to: tabLink(SETTINGS, 'Branding'), real: true },
      { label: 'License', to: tabLink(SETTINGS, 'License'), real: true },
    ],
  },
  // Test-env only (VITE_BILLING_API_URL unset in the prod build) — see
  // isBillingEnabled()'s doc comment in api.ts. Kept entirely separate from
  // the pre-existing Settings > Billing stub tab rather than replacing it,
  // so prod's Settings page is untouched either way.
  ...(isBillingEnabled() ? [{
    label: 'Subscription',
    icon: '$',
    to: SUBSCRIPTION,
    children: [
      { label: 'Plans', to: SUBSCRIPTION, real: true },
      { label: 'Usage', to: tabLink(SUBSCRIPTION, 'Usage'), real: true },
      { label: 'Invoices', to: tabLink(SUBSCRIPTION, 'Invoices'), real: true },
    ],
  }] : []),
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
 *
 * `siblings` is the module's full children list. A handful of modules
 * deliberately point several children at the exact same `to` (see the file
 * header — they're real facets of one page, not separate views yet). None
 * of those siblings is more "current" than another, so highlighting all of
 * them at once looked like every entry in the menu was identical/active —
 * this only highlights a child whose destination is unique among its
 * siblings, leaving shared-destination groups unhighlighted instead.
 */
export function isChildActive(child: NavChild, siblings: NavChild[], pathname: string, search: string): boolean {
  if (!child.to) return false;
  const [childPath, childQuery] = child.to.split('?');
  if (pathname !== childPath) return false;
  const currentTab = new URLSearchParams(search).get('tab');
  const childTab = childQuery ? new URLSearchParams(childQuery).get('tab') : null;
  if ((currentTab ?? null) !== (childTab ?? null)) return false;
  const sharedBy = siblings.filter(s => s.to === child.to).length;
  return sharedBy === 1;
}
