/**
 * Full information architecture (18 top-level modules). Vulnerability
 * Management is the unified security workspace: its own children span
 * Overview/Vulnerabilities/Risk/Assets plus five domain pillars (Security
 * Scanning, Cloud Security, Application Security, Code Security, Container &
 * Kubernetes, Infrastructure) that were briefly separate top-level modules
 * (an earlier "Phase 1 IA redesign" pass) before being folded in here per
 * later direction -- each pillar's own page (CloudSecurity.tsx,
 * SecurityScanningCenter.tsx, etc.) is unchanged, still its own route with
 * its own tab bar, just reached via this module's Sidebar now. See the
 * `group` field on NavChild for the purely-cosmetic Sidebar-section
 * dividers this produces, and `section` below for AppRail's (separate,
 * module-level) grouping.
 *
 * NavChild labels are unique *within one module's children* (findNavChild/
 * submenuKey/RBAC overrides/React list keys are all label-keyed per module,
 * not globally) -- with ~100 children now on Vulnerability Management alone,
 * several leaves that are the same concept in the spec this was built from
 * (e.g. "SAST" under both Security Scanning and Code Security) are
 * deliberately disambiguated with a qualifier ("SAST Scanning" vs "SAST") --
 * don't drop the qualifier when editing, it's there to avoid a real
 * silent-collision bug, not decoration.
 *
 * Every module and sub-item below
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
  /** Purely cosmetic sub-grouping within one module's Sidebar children list
   * (e.g. Vulnerability Management's Overview/Vulnerabilities/Risk/Assets/...
   * sections) — mirrors NavModule.section's role for AppRail. Never affects
   * canSeeChild/findNavChild/isChildActive/moduleMatchesPath, purely a
   * Sidebar rendering hint. */
  group?: string;
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
  /** Purely cosmetic grouping for AppRail's section dividers (Get Started /
   * Cloud Operations / Security / Platform) — never affects visibility,
   * routing, or RBAC. Modules are bucketed by this at render time; array
   * order within NAV_MODULES is otherwise unaffected. */
  section?: string;
}

const OVERVIEW = '/overview';
const ACCOUNTS = '/cloud-accounts';
const RESOURCES = '/resources';
const COST = '/cost-management';
const OPT = '/cost-optimization';
const VULN = '/vulnerability-management';
const SCANNING = '/security-scanning';
const CLOUD_SEC = '/cloud-security';
const APP_SEC = '/application-security';
const CODE_SEC = '/code-security';
const CONTAINER_SEC = '/container-security';
const INFRA_SEC = '/infrastructure-security';
const EKS_CONSOLE = '/clusters/aws';
const GKE_CONSOLE = '/clusters/gcp';
const AKS_CONSOLE = '/clusters/azure';
const MON = '/monitoring';
const ALERTS = '/alerts';
const ISSUES = '/issues';
const INCIDENTS = '/incidents';
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

/** Same as tabLink, plus a `preset=<value>` param — used by the Vulnerabilities
 * group's Critical/Exploitable/Newly Discovered/Aging/Suppressed/Resolved
 * children, all of which land on the same Security Findings tab pre-filtered
 * rather than each being its own table. */
function presetLink(base: string, tab: string, preset: string): string {
  return `${tabLink(base, tab)}&preset=${encodeURIComponent(preset)}`;
}

export const NAV_MODULES: NavModule[] = [
  {
    label: 'Overview',
    icon: 'overview',
    section: 'Get Started',
    to: OVERVIEW,
    children: [
      { label: 'Executive Dashboard', to: `${OVERVIEW}#executive-dashboard`, real: true },
      { label: 'Security Posture', to: `${OVERVIEW}#security-posture`, real: true },
      { label: 'Activity Timeline', to: `${OVERVIEW}#activity-timeline`, real: true },
      { label: 'Quick Actions', to: `${OVERVIEW}#quick-actions`, real: true },
      { label: 'Favorites', to: `${OVERVIEW}#favorites`, real: true },
    ],
  },
  {
    label: 'Cloud Accounts',
    icon: 'cloud',
    section: 'Cloud Operations',
    to: ACCOUNTS,
    children: [
      { label: 'Dashboard', to: ACCOUNTS, real: true },
      { label: 'Account Inventory', to: tabLink(ACCOUNTS, 'Inventory'), real: true },
      { label: 'Account Onboarding', to: tabLink(ACCOUNTS, 'Onboarding'), real: true, minRole: 'editor' },
      { label: 'Organizations', to: tabLink(ACCOUNTS, 'Organizations'), real: true },
      { label: 'Regions', to: tabLink(ACCOUNTS, 'Regions'), real: true },
      { label: 'Sync Center', to: tabLink(ACCOUNTS, 'Sync Center'), real: true, minRole: 'editor' },
      { label: 'Reports', to: tabLink(ACCOUNTS, 'Reports'), real: true },
      { label: 'Identities', to: tabLink(ACCOUNTS, 'Identities'), real: true },
      { label: 'Settings', real: false, minRole: 'admin' },
    ],
  },
  {
    // The unified security workspace -- Overview/Vulnerabilities/Risk/Assets
    // groups plus the five domain pillars (Security Scanning, Cloud
    // Security, Application Security, Code Security, Container &
    // Kubernetes, Infrastructure) that were separate top-level modules
    // before this restructure. Each pillar's own page (CloudSecurity.tsx,
    // SecurityScanningCenter.tsx, etc.) is unchanged -- still its own route,
    // still its own tab bar -- only reached via this module's Sidebar now
    // instead of its own rail icon. `group` tags below drive Sidebar's
    // section dividers; purely cosmetic, see NavChild.group's own comment.
    label: 'Vulnerability Management',
    icon: 'security',
    section: 'Security',
    to: VULN,
    children: [
      // ── Overview ──────────────────────────────────────────────────────
      { label: 'Vulnerability Overview', to: VULN, real: true, group: 'Overview' },
      { label: 'Risk Overview', real: false, group: 'Overview' },
      { label: 'Exposure Overview', real: false, group: 'Overview' },

      // ── Vulnerabilities ───────────────────────────────────────────────
      // All seven land on the same Security Findings table, pre-filtered by
      // a `preset` param -- not seven separate table implementations.
      { label: 'All Vulnerabilities', to: tabLink(VULN, 'Security Findings'), real: true, group: 'Vulnerabilities' },
      { label: 'Critical Vulnerabilities', to: presetLink(VULN, 'Security Findings', 'critical'), real: true, group: 'Vulnerabilities' },
      { label: 'Exploitable Vulnerabilities', to: presetLink(VULN, 'Security Findings', 'exploitable'), real: true, group: 'Vulnerabilities' },
      { label: 'Newly Discovered', to: presetLink(VULN, 'Security Findings', 'new'), real: true, group: 'Vulnerabilities' },
      { label: 'Aging Vulnerabilities', to: presetLink(VULN, 'Security Findings', 'aging'), real: true, group: 'Vulnerabilities' },
      { label: 'Suppressed / Accepted Risk', to: presetLink(VULN, 'Security Findings', 'suppressed'), real: true, group: 'Vulnerabilities' },
      { label: 'Resolved Vulnerabilities', to: presetLink(VULN, 'Security Findings', 'resolved'), real: true, group: 'Vulnerabilities' },

      // ── Risk ──────────────────────────────────────────────────────────
      { label: 'Risk Prioritization', real: false, group: 'Risk' },
      { label: 'Risk Score', real: false, group: 'Risk' },
      // real: false until confirmed live against a real positive END-TO-END
      // match (see this session's attack-path-engine plan) -- the tab and
      // its backend route both work, and the exposure leg now has a real
      // hit in the test accounts (an internet-facing ELB), but that
      // resource has no ASSUMES edge to an IAM role (load balancers don't
      // carry one) and no matching critical/high finding on it either, so
      // no row has ever actually rendered here yet. Flip once one does.
      { label: 'Attack Paths', to: tabLink(VULN, 'Attack Paths'), real: false, group: 'Risk' },
      { label: 'Business Risk', real: false, group: 'Risk' },
      { label: 'Risk Correlation', real: false, group: 'Risk' },

      // ── Assets ────────────────────────────────────────────────────────
      // "Cloud Assets"/"Databases" are deliberately NOT listed here as their
      // own cross-link children, unlike Repository Inventory/Containers
      // below -- their natural target is /resources*, which is Asset
      // Inventory's own exclusively-owned base path. Asset Inventory sits
      // AFTER this module in NAV_MODULES (see the ordering-constraint
      // comment on that module), so a child here pointing at /resources*
      // would win moduleMatchesPath's prefix match before Asset Inventory's
      // own `to` is ever checked -- the same class of collision this file's
      // header comment warns about, just in the opposite direction. Asset
      // Inventory is one rail-icon click away regardless, so the fix is
      // simply not claiming its territory from in here.
      { label: 'All Assets', real: false, group: 'Assets' },
      { label: 'Infrastructure', real: false, group: 'Assets' },
      // "* Assets"/"* Inventory" naming below disambiguates from the
      // same-named leaves under Application Security/Code Security/
      // Container & Kubernetes further down -- NavChild identity (findNavChild,
      // submenuKey, RBAC overrides, React list keys) is label-keyed *within*
      // one module's children, so a label can't repeat here even across groups.
      { label: 'Kubernetes Assets', real: false, group: 'Assets' },
      // Real -- same Trivy-backed table as Container & Kubernetes Security's own tab.
      { label: 'Containers', to: tabLink(CONTAINER_SEC, 'Docker & Container Images'), real: true, group: 'Assets' },
      // Real -- api.getGitInstallations()/getInstallationRepos(), same as Code & Repository Security's own tab.
      { label: 'Repository Inventory', to: tabLink(CODE_SEC, 'Repositories'), real: true, group: 'Assets' },
      { label: 'Application Inventory', real: false, group: 'Assets' },
      { label: 'API Inventory', real: false, group: 'Assets' },
      { label: 'Domain Inventory', real: false, group: 'Assets' },
      // Real, live resource category (ResourcesOverview.tsx's CATEGORIES) --
      // not cross-linked with a `to` here for the same /resources*
      // ownership reason as "Cloud Assets" above; reachable via Asset
      // Inventory's own Databases shortcut.
      { label: 'Databases', real: false, group: 'Assets' },

      // ── Security Scanning ────────────────────────────────────────────
      // Command-center for every scan category -- the unified entry point
      // the "don't build a pile of separate scanner pages" requirement
      // calls for. Cross-links into the Scanners tab (session-ephemeral
      // results, see api.ts's getScanStatus/getScanResults -- no
      // list-all-scans endpoint exists yet) rather than duplicating it.
      { label: 'Scan Overview', to: SCANNING, real: true, group: 'Security Scanning' },
      { label: 'All Scans', to: tabLink(VULN, 'Scanners'), real: true, group: 'Security Scanning' },
      // "* Scanning"/"* Testing" naming disambiguates from the same-named
      // leaves under Code Security/Application Security further down --
      // NavChild labels are unique-per-module, not globally.
      // Real -- Security Scanning Center's SAST tab now shows a persisted,
      // independently-queryable Semgrep scan history (api.listScans),
      // unlike the other 4 scanning-category tabs still awaiting their own
      // scanner service's GET /v1/scans rollout.
      { label: 'SAST Scanning', to: tabLink(SCANNING, 'SAST'), real: true, group: 'Security Scanning' },
      { label: 'DAST Scanning', to: tabLink(SCANNING, 'DAST'), real: false, group: 'Security Scanning' },
      { label: 'SCA Scanning', to: tabLink(SCANNING, 'SCA'), real: false, group: 'Security Scanning' },
      // Real -- deep-links to Container & Kubernetes Security's canonical
      // Docker & Container Images tab (real Trivy findings) rather than
      // rendering a second copy of the same table.
      { label: 'Container Scanning', to: tabLink(SCANNING, 'Container Scanning'), real: true, group: 'Security Scanning' },
      { label: 'IaC Scanning', to: tabLink(SCANNING, 'IaC Scanning'), real: false, group: 'Security Scanning' },
      { label: 'Secrets Scanning', to: tabLink(SCANNING, 'Secrets Detection'), real: false, group: 'Security Scanning' },
      { label: 'API Security Testing', to: tabLink(SCANNING, 'API Security Testing'), real: false, group: 'Security Scanning' },
      { label: 'Web Security Testing', to: tabLink(SCANNING, 'Web Security Testing'), real: false, group: 'Security Scanning' },
      { label: 'URL / Domain Testing', real: false, group: 'Security Scanning' },
      { label: 'Penetration Testing', to: tabLink(SCANNING, 'Pentest'), real: false, group: 'Security Scanning' },
      { label: 'Infrastructure Scanning', real: false, group: 'Security Scanning' },
      // Real -- reuses SecurityPostureSummary fed by the same vulnerability
      // dashboard endpoint Cloud Security's own Posture tab uses.
      { label: 'Cloud Security Scanning', to: tabLink(SCANNING, 'Cloud Posture'), real: true, group: 'Security Scanning' },

      // ── Cloud Security ────────────────────────────────────────────────
      // Multi-cloud security posture pillar -- distinct from Cloud Accounts
      // (connection management/ops) and from the AWS-native tool tabs
      // above, which this pillar re-presents through a posture/risk lens.
      { label: 'Cloud Overview', to: CLOUD_SEC, real: true, group: 'Cloud Security' },
      // AWS's own posture lives in Misconfigurations/Exposed Resources below
      // (real, AWS Config + IAM Access Analyzer); Azure/GCP are real too as
      // of the gcp-scc/defender source routes -- all three now point at the
      // real Multi-Cloud Coverage tab's per-provider breakdown rather than
      // being separate unbuilt tabs. OCI has no connector at all yet.
      { label: 'AWS', to: tabLink(CLOUD_SEC, 'Multi-Cloud Coverage'), real: true, group: 'Cloud Security' },
      { label: 'Azure', to: tabLink(CLOUD_SEC, 'Multi-Cloud Coverage'), real: true, group: 'Cloud Security' },
      { label: 'GCP', to: tabLink(CLOUD_SEC, 'Multi-Cloud Coverage'), real: true, group: 'Cloud Security' },
      { label: 'OCI', real: false, group: 'Cloud Security' },
      { label: 'Other Clouds', real: false, group: 'Cloud Security' },
      { label: 'Misconfigurations', to: tabLink(CLOUD_SEC, 'Misconfigurations'), real: true, group: 'Cloud Security' },
      { label: 'Identity & Access', to: tabLink(CLOUD_SEC, 'Identity & Access Risk'), real: true, group: 'Cloud Security' },
      { label: 'Exposed Resources', to: tabLink(CLOUD_SEC, 'Exposed Resources'), real: true, group: 'Cloud Security' },

      // ── Application Security ─────────────────────────────────────────
      { label: 'Application Security Overview', to: APP_SEC, real: true, group: 'Application Security' },
      { label: 'Applications', to: tabLink(APP_SEC, 'Applications'), real: false, group: 'Application Security' },
      { label: 'APIs', to: tabLink(APP_SEC, 'APIs'), real: false, group: 'Application Security' },
      { label: 'Web Applications', real: false, group: 'Application Security' },
      { label: 'Domains / URLs', to: tabLink(APP_SEC, 'URLs & Domains'), real: false, group: 'Application Security' },
      { label: 'DAST', to: tabLink(APP_SEC, 'DAST Results'), real: false, group: 'Application Security' },
      { label: 'API Security', to: tabLink(APP_SEC, 'API Security Findings'), real: false, group: 'Application Security' },
      { label: 'Web Vulnerabilities', to: tabLink(APP_SEC, 'Web Vulnerabilities'), real: false, group: 'Application Security' },

      // ── Code Security ─────────────────────────────────────────────────
      { label: 'Code Security Overview', to: CODE_SEC, real: true, group: 'Code Security' },
      // Real -- api.getGitInstallations()/getInstallationRepos() already
      // back Settings > Git Integration's Auto-PR feature with real,
      // persisted repo rows.
      { label: 'Repositories', to: tabLink(CODE_SEC, 'Repositories'), real: true, group: 'Code Security' },
      { label: 'SAST', to: tabLink(CODE_SEC, 'Code Vulnerabilities'), real: false, group: 'Code Security' },
      { label: 'SCA', to: tabLink(CODE_SEC, 'Dependency Vulnerabilities'), real: false, group: 'Code Security' },
      { label: 'Dependencies', to: tabLink(CODE_SEC, 'Dependency Vulnerabilities'), real: false, group: 'Code Security' },
      { label: 'Secrets', to: tabLink(CODE_SEC, 'Secrets Detected'), real: false, group: 'Code Security' },
      { label: 'Code Vulnerabilities', to: tabLink(CODE_SEC, 'Code Vulnerabilities'), real: false, group: 'Code Security' },

      // ── Container & Kubernetes ────────────────────────────────────────
      // Distinct from the operational Clusters module (pods/deployments/
      // nodes) -- this is the security-posture lens over the same
      // container/K8s surface.
      { label: 'Container & Kubernetes Overview', to: CONTAINER_SEC, real: true, group: 'Container & Kubernetes' },
      { label: 'Kubernetes', to: tabLink(CONTAINER_SEC, 'Kubernetes Security'), real: false, group: 'Container & Kubernetes' },
      { label: 'Rancher', to: tabLink(CONTAINER_SEC, 'Rancher'), real: false, group: 'Container & Kubernetes' },
      // Real, canonical -- api.getFindingsBySource('container-images')
      // (Trivy), the same persisted data the AWS-native "Container Images"
      // source tab further down reads. Labeled "Container Image Inventory"
      // here (not "Container Images") since that exact label is already
      // used by the AWS-native tab below -- same label-uniqueness
      // constraint as the Assets/Security Scanning renames above.
      { label: 'Docker', to: tabLink(CONTAINER_SEC, 'Docker & Container Images'), real: true, group: 'Container & Kubernetes' },
      { label: 'Container Image Inventory', to: tabLink(CONTAINER_SEC, 'Docker & Container Images'), real: true, group: 'Container & Kubernetes' },
      { label: 'Registries', to: tabLink(CONTAINER_SEC, 'Container Registries'), real: false, group: 'Container & Kubernetes' },
      { label: 'Runtime Security', to: tabLink(CONTAINER_SEC, 'Runtime Risks'), real: false, group: 'Container & Kubernetes' },
      { label: 'Container Vulnerabilities', to: tabLink(CONTAINER_SEC, 'Docker & Container Images'), real: true, group: 'Container & Kubernetes' },

      // ── Infrastructure ────────────────────────────────────────────────
      // Zero backend surface anywhere for servers/OS/on-prem today -- exists
      // to state real product scope honestly, same as AksConsole's precedent.
      { label: 'Infrastructure Overview', to: INFRA_SEC, real: true, group: 'Infrastructure' },
      { label: 'Servers', to: tabLink(INFRA_SEC, 'Servers'), real: false, group: 'Infrastructure' },
      { label: 'Linux', to: tabLink(INFRA_SEC, 'Linux'), real: false, group: 'Infrastructure' },
      { label: 'Ubuntu', to: tabLink(INFRA_SEC, 'Ubuntu'), real: false, group: 'Infrastructure' },
      { label: 'Windows', to: tabLink(INFRA_SEC, 'Windows'), real: false, group: 'Infrastructure' },
      { label: 'Operating Systems', to: INFRA_SEC, real: false, group: 'Infrastructure' },
      { label: 'Network Security', to: tabLink(INFRA_SEC, 'Network & Security Configuration'), real: false, group: 'Infrastructure' },
      { label: 'Infrastructure Vulnerabilities', to: INFRA_SEC, real: false, group: 'Infrastructure' },

      // ── Remediation ───────────────────────────────────────────────────
      { label: 'Remediation Overview', real: false, group: 'Remediation' },
      { label: 'Remediation Queue', real: false, group: 'Remediation' },
      { label: 'Fix Recommendations', real: false, group: 'Remediation' },
      { label: 'Tickets', real: false, group: 'Remediation' },
      { label: 'SLA', real: false, group: 'Remediation' },
      { label: 'Exceptions', real: false, group: 'Remediation' },

      // ── Reports ───────────────────────────────────────────────────────
      // The real Reports module (its own top-level rail icon, unaffected by
      // this restructure) owns every /reports* path. Vulnerability
      // Management sits before it in NAV_MODULES, so -- same reasoning as
      // the Assets group's Cloud Assets/Databases above -- these can't
      // carry a `to` without stealing /reports* away from the real Reports
      // module. Reports is one rail-icon click away regardless.
      { label: 'Vulnerability Reports', real: false, group: 'Reports' },
      { label: 'Executive Reports', real: false, group: 'Reports' },
      { label: 'Compliance Reports', real: false, group: 'Reports' },
      { label: 'Scan Reports', real: false, group: 'Reports' },
      { label: 'Asset Reports', real: false, group: 'Reports' },
      { label: 'Export Center', real: false, group: 'Reports' },

      // ── AWS-native source tabs (unchanged from before this restructure) ─
      { label: 'Security Hub', to: tabLink(VULN, 'Security Hub'), real: true, group: 'AWS-Native Sources' },
      { label: 'GuardDuty', to: tabLink(VULN, 'GuardDuty'), real: true, group: 'AWS-Native Sources' },
      { label: 'Inspector', to: tabLink(VULN, 'Inspector'), real: true, group: 'AWS-Native Sources' },
      { label: 'IAM Access Analyzer', to: tabLink(VULN, 'IAM Access Analyzer'), real: true, group: 'AWS-Native Sources' },
      { label: 'AWS Config', to: tabLink(VULN, 'AWS Config'), real: true, group: 'AWS-Native Sources' },
      { label: 'Container Images', to: tabLink(VULN, 'Container Images'), real: true, group: 'AWS-Native Sources' },
      { label: 'Compliance', to: tabLink(VULN, 'Compliance'), real: true, group: 'AWS-Native Sources' },
      { label: 'Trusted Advisor', to: tabLink(VULN, 'Trusted Advisor'), real: true, group: 'AWS-Native Sources' },
      { label: 'Scanners', to: tabLink(VULN, 'Scanners'), real: true, group: 'AWS-Native Sources' },
    ],
  },
  {
    // IMPORTANT: this module's children (Repositories/Servers/Applications/
    // APIs/Domains & URLs below) cross-link into the Security-section
    // modules just above -- moduleMatchesPath scans EVERY child's `to`
    // regardless of `real`, and NAV_MODULES.find() returns the first array
    // match, so this module must stay AFTER every module its children
    // cross-link into, or a cross-link child's `to` prefix-matching another
    // module's own base route would make findActiveModule (and therefore
    // AppRail/Sidebar's "which module is active" highlighting) resolve to
    // THIS module instead of the real one. Caught by navConfig.test.ts's
    // "resolves each new security module to itself" case -- keep that test
    // passing if this module (or its children's cross-link targets) ever
    // moves again.
    //
    // Relabeled from "Resources" to communicate the unified, cross-domain
    // asset-inventory positioning (cloud resources today; servers/apps/
    // repos/APIs cross-link in as their own modules ship). Label-only change
    // -- `icon` (the RBAC menu_key) and every route below are untouched, so
    // no per-org menu_permissions override can be orphaned by this. See
    // icons.tsx's NAV_ICON_MAP['Asset Inventory'] entry and App.tsx's four
    // `module="Asset Inventory"` ProtectedRoute props, which MUST stay in
    // sync with this label (ProtectedRoute matches on label, not icon, and
    // fails closed -- AccessDenied, not open -- on a mismatch).
    label: 'Asset Inventory',
    icon: 'resources',
    section: 'Cloud Operations',
    to: RESOURCES,
    children: [
      { label: 'Resource Inventory', to: RESOURCES, real: true },
      { label: 'Global Search', to: tabLink(`${RESOURCES}/all`, 'Global Search'), real: true },
      { label: 'Dependency Graph', to: `${RESOURCES}/all`, real: true },
      { label: 'Resource Relationships', to: tabLink(`${RESOURCES}/all`, 'Resource Relationships'), real: true },
      { label: 'Tags Explorer', to: tabLink(`${RESOURCES}/all`, 'Tags Explorer'), real: true },
      { label: 'Resource Timeline', to: tabLink(`${RESOURCES}/all`, 'Resource Timeline'), real: true },
      { label: 'Bulk Operations', to: `${RESOURCES}/all?bulk=1`, real: true, minRole: 'editor' },
      // Already a real, live resource category (see ResourcesOverview.tsx's
      // CATEGORIES) -- not new backend, just a direct shortcut into it.
      { label: 'Databases', to: `${RESOURCES}/Database`, real: true },
      // Code Security/Infrastructure/Application & API Security are all now
      // nested under Vulnerability Management (not standalone modules), and
      // Vulnerability Management sits before this module in NAV_MODULES --
      // a `real: true` cross-link into any of their paths from here would
      // let this module's children steal that path away from Vulnerability
      // Management in moduleMatchesPath's prefix scan (caught by
      // navConfig.test.ts's cross-link-ownership test). Real, working
      // pages -- just reachable via Vulnerability Management's own Sidebar
      // (Assets/Code Security groups), not cross-linked from here.
      { label: 'Repositories', to: tabLink(CODE_SEC, 'Repositories'), real: false },
      { label: 'Servers', to: tabLink(INFRA_SEC, 'Servers'), real: false },
      { label: 'Applications', to: tabLink(APP_SEC, 'Applications'), real: false },
      { label: 'APIs', to: tabLink(APP_SEC, 'APIs'), real: false },
      { label: 'Domains & URLs', to: tabLink(APP_SEC, 'URLs & Domains'), real: false },
    ],
  },
  {
    label: 'Custom Dashboards',
    icon: 'dashboard',
    section: 'Cloud Operations',
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
    section: 'Cloud Operations',
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
    section: 'Cloud Operations',
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
    label: 'Clusters',
    icon: 'containers',
    section: 'Cloud Operations',
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
    section: 'Cloud Operations',
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
    section: 'Cloud Operations',
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
    section: 'Cloud Operations',
    to: ISSUES,
    children: [
      { label: 'All Issues', to: ISSUES, real: true },
    ],
  },
  {
    label: 'Incidents',
    icon: 'incidents',
    section: 'Cloud Operations',
    to: INCIDENTS,
    children: [
      { label: 'All Incidents', to: INCIDENTS, real: true },
      { label: 'Open', to: tabLink(INCIDENTS, 'Open'), real: true },
      { label: 'Investigating', to: tabLink(INCIDENTS, 'Investigating'), real: true },
      { label: 'Resolved', to: tabLink(INCIDENTS, 'Resolved'), real: true },
    ],
  },
  {
    label: 'Reports',
    icon: 'reports',
    section: 'Cloud Operations',
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
    section: 'Platform',
    to: USERS,
    minRole: 'admin',
    children: [
      { label: 'Users', to: USERS, real: true },
      { label: 'Groups', to: tabLink(USERS, 'Groups'), real: true },
      { label: 'Roles & Permissions', to: tabLink(USERS, 'Roles & Permissions'), real: true },
      { label: 'Project Access', to: tabLink(USERS, 'Project Access'), real: true },
      { label: 'API Keys', to: tabLink(USERS, 'API Keys'), real: true, minRole: 'admin' },
      { label: 'ABAC Policies', to: tabLink(USERS, 'ABAC Policies'), real: true, minRole: 'admin' },
      { label: 'SCIM Provisioning', to: tabLink(USERS, 'SCIM Provisioning'), real: true, minRole: 'admin' },
      { label: 'Audit Logs', to: tabLink(USERS, 'Audit Logs'), real: true },
    ],
  },
  {
    label: 'Organization Management',
    icon: 'organization',
    section: 'Platform',
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
    section: 'Platform',
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
    section: 'Platform',
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
    section: 'Platform',
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