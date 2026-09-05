/**
 * Widget Registry — metadata only (issue §3, §18 "Widget Registry").
 *
 * This is the single source of truth for *what* Overview widgets exist, which
 * capability + module gates them, their default size/position weight, and how
 * a live risk signal elevates them (issue §15 level 3). The React component
 * for each id lives in components/overview/registry.tsx; the two are matched
 * by id and a load-time assertion there fails loudly if they drift.
 *
 * Kept free of the lib/api.ts import chain on purpose so the engine and its
 * tests can consume it (see types.ts header).
 *
 * Adding a capability to HorizonVigil later (issue §18: "AI Operations") is a
 * push to this array + a component — no dashboard rewrite.
 */
import type { ContextSignals, WidgetMeta } from './types';

/** Boost helper: returns an elevation only when `active`, else null. */
function boostWhen(active: boolean, priority: number, reason: string) {
  return active ? { priority, reason } : null;
}

export const REGISTRY_META: WidgetMeta[] = [
  // ══ KPIs ═══════════════════════════════════════════════════════════════
  // kind:'kpi' — the engine shows the top ~8 eligible ones in the KPI strip,
  // the rest are addable from the drawer. defaultSize is ignored for KPIs
  // (the strip is its own fixed grid) but kept valid for the type.
  {
    id: 'kpi-security-score', title: 'Security Score', description: 'Aggregate risk score across all findings.',
    category: 'security', kind: 'kpi', module: 'security', requires: ['security.read'],
    defaultSize: { w: 1, h: 2 }, basePriority: 4, integrated: true,
  },
  {
    id: 'kpi-critical-risks', title: 'Critical Risks', description: 'Open critical + high severity findings.',
    category: 'security', kind: 'kpi', module: 'security', requires: ['security.read'],
    defaultSize: { w: 1, h: 2 }, basePriority: 5, integrated: true,
    contextBoost: (s) => boostWhen(s.criticalVulns > 0, 40, `${s.criticalVulns} critical vulnerabilities open`),
  },
  {
    id: 'kpi-critical-vulnerabilities', title: 'Critical Vulnerabilities', description: 'Findings at critical severity.',
    category: 'security', kind: 'kpi', module: 'security', requires: ['security.read'],
    defaultSize: { w: 1, h: 2 }, basePriority: 8, integrated: true, defaultEnabled: false,
  },
  {
    id: 'kpi-exposures', title: 'Internet-Facing Exposures', description: 'Publicly reachable resources with findings.',
    category: 'security', kind: 'kpi', module: 'security', requires: ['security.read'],
    defaultSize: { w: 1, h: 2 }, basePriority: 9, integrated: true, defaultEnabled: false,
  },
  {
    id: 'kpi-attack-paths', title: 'Attack Paths', description: 'Exposure + vulnerability + over-privilege converging on one resource.',
    category: 'security', kind: 'kpi', module: 'security', requires: ['security.read'],
    defaultSize: { w: 1, h: 2 }, basePriority: 9, integrated: true, defaultEnabled: false,
    contextBoost: (s) => boostWhen(s.openAttackPaths > 0, 35, `${s.openAttackPaths} attack paths`),
  },
  {
    id: 'kpi-critical-findings', title: 'Critical Findings', description: 'Open critical findings across scanners.',
    category: 'security', kind: 'kpi', module: 'security', requires: ['security.read'],
    defaultSize: { w: 1, h: 2 }, basePriority: 10, integrated: true, defaultEnabled: false,
  },
  {
    id: 'kpi-active-incidents', title: 'Active Incidents', description: 'Incidents that are open right now.',
    category: 'operations', kind: 'kpi', module: 'incidents', requires: ['incident.read'],
    defaultSize: { w: 1, h: 2 }, basePriority: 6, integrated: true,
    contextBoost: (s) => boostWhen(s.criticalIncidents > 0, 60, `${s.criticalIncidents} critical incidents`),
  },
  {
    id: 'kpi-open-investigations', title: 'Open Investigations', description: 'Incidents currently being investigated.',
    category: 'operations', kind: 'kpi', module: 'incidents', requires: ['incident.read'],
    defaultSize: { w: 1, h: 2 }, basePriority: 12, integrated: true, defaultEnabled: false,
  },
  {
    id: 'kpi-mttr', title: 'MTTR', description: 'Mean time to resolve, last 30 days.',
    category: 'operations', kind: 'kpi', module: 'incidents', requires: ['incident.read'],
    defaultSize: { w: 1, h: 2 }, basePriority: 18, integrated: true, defaultEnabled: false,
  },
  {
    id: 'kpi-open-issues', title: 'Open Issues', description: 'Cost, security and alert issues needing attention.',
    category: 'operations', kind: 'kpi', module: null,
    requires: [], anyOf: ['cost.read', 'security.read', 'observability.read'],
    defaultSize: { w: 1, h: 2 }, basePriority: 15, integrated: true,
  },
  {
    id: 'kpi-cloud-spend', title: 'Cloud Spend', description: 'Month-to-date spend across providers.',
    category: 'finops', kind: 'kpi', module: 'cost', requires: ['cost.read'],
    defaultSize: { w: 1, h: 2 }, basePriority: 10, integrated: true,
  },
  {
    id: 'kpi-monthly-run-rate', title: 'Monthly Run Rate', description: 'Projected full-month spend at the current rate.',
    category: 'finops', kind: 'kpi', module: 'cost', requires: ['cost.read'],
    defaultSize: { w: 1, h: 2 }, basePriority: 13, integrated: true, defaultEnabled: false,
  },
  {
    id: 'kpi-potential-savings', title: 'Potential Savings', description: 'Monthly savings from open recommendations.',
    category: 'finops', kind: 'kpi', module: 'cost', requires: ['cost.read'],
    defaultSize: { w: 1, h: 2 }, basePriority: 14, integrated: true,
  },
  {
    id: 'kpi-cost-anomalies', title: 'Cost Anomalies', description: 'Open spend anomalies detected.',
    category: 'finops', kind: 'kpi', module: 'cost', requires: ['cost.read'],
    defaultSize: { w: 1, h: 2 }, basePriority: 15, integrated: true, defaultEnabled: false,
    contextBoost: (s) => boostWhen(s.costAnomalies > 0, 30, `${s.costAnomalies} cost anomalies`),
  },
  {
    id: 'kpi-budget-status', title: 'Budget Status', description: 'Worst budget utilisation in scope.',
    category: 'finops', kind: 'kpi', module: 'cost', requires: ['cost.read'],
    defaultSize: { w: 1, h: 2 }, basePriority: 16, integrated: true, defaultEnabled: false,
  },
  {
    id: 'kpi-total-assets', title: 'Total Assets', description: 'Discovered resources across all accounts in scope.',
    category: 'platform', kind: 'kpi', module: 'resources', requires: ['infrastructure.read'],
    defaultSize: { w: 1, h: 2 }, basePriority: 11, integrated: true,
  },
  {
    id: 'kpi-platform-health', title: 'Platform Health', description: 'Share of connected accounts reporting healthy.',
    category: 'platform', kind: 'kpi', module: 'cloud', requires: ['cloud.read'],
    defaultSize: { w: 1, h: 2 }, basePriority: 11, integrated: true,
  },
  {
    id: 'kpi-projects', title: 'Projects', description: 'Projects you can access in this organization.',
    category: 'platform', kind: 'kpi', module: null, requires: [],
    defaultSize: { w: 1, h: 2 }, basePriority: 20, integrated: true, defaultEnabled: false,
  },
  {
    id: 'kpi-repositories', title: 'Repositories', description: 'Connected source repositories.',
    category: 'devops', kind: 'kpi', module: 'security', requires: ['repository.read'],
    defaultSize: { w: 1, h: 2 }, basePriority: 20, integrated: true, defaultEnabled: false,
  },
  {
    id: 'kpi-deployments', title: 'Deployments', description: 'Deployments recorded in the selected window.',
    category: 'devops', kind: 'kpi', module: 'monitoring', requires: ['devops.read'],
    defaultSize: { w: 1, h: 2 }, basePriority: 17, integrated: true, defaultEnabled: false,
  },
  {
    id: 'kpi-pipeline-success', title: 'Pipeline Success Rate', description: 'Successful CI runs — needs a CI provider connected.',
    category: 'devops', kind: 'kpi', module: 'monitoring', requires: ['devops.read'],
    defaultSize: { w: 1, h: 2 }, basePriority: 22, integrated: false, defaultEnabled: false,
  },
  {
    id: 'kpi-service-health', title: 'Service Health', description: 'Resources reporting healthy vs degraded.',
    category: 'observability', kind: 'kpi', module: 'monitoring', requires: ['observability.read'],
    defaultSize: { w: 1, h: 2 }, basePriority: 16, integrated: true, defaultEnabled: false,
  },
  {
    id: 'kpi-availability', title: 'Availability', description: 'Uptime over the window — needs an uptime source.',
    category: 'observability', kind: 'kpi', module: 'monitoring', requires: ['observability.read'],
    defaultSize: { w: 1, h: 2 }, basePriority: 23, integrated: false, defaultEnabled: false,
  },
  {
    id: 'kpi-error-rate', title: 'Error Rate', description: 'Errors per minute — needs a metrics source.',
    category: 'observability', kind: 'kpi', module: 'monitoring', requires: ['observability.read'],
    defaultSize: { w: 1, h: 2 }, basePriority: 24, integrated: false, defaultEnabled: false,
  },
  {
    id: 'kpi-latency', title: 'P95 / P99 Latency', description: 'Tail latency — needs a metrics source.',
    category: 'observability', kind: 'kpi', module: 'monitoring', requires: ['observability.read'],
    defaultSize: { w: 1, h: 2 }, basePriority: 24, integrated: false, defaultEnabled: false,
  },
  {
    id: 'kpi-events-per-min', title: 'Events / Minute', description: 'Event throughput — needs an events pipeline.',
    category: 'observability', kind: 'kpi', module: 'monitoring', requires: ['observability.read'],
    defaultSize: { w: 1, h: 2 }, basePriority: 25, integrated: false, defaultEnabled: false,
  },

  // ══ Operations panels ══════════════════════════════════════════════════
  {
    id: 'quick-actions', title: 'Quick Actions', description: 'Shortcuts to the tasks you run most.',
    category: 'operations', kind: 'panel', module: null, requires: [],
    defaultSize: { w: 3, h: 3 }, basePriority: 80, integrated: true,
  },
  {
    id: 'active-incidents', title: 'Active Incidents', description: 'Open incidents in your scope.',
    category: 'operations', kind: 'panel', module: 'incidents', requires: ['incident.read'],
    defaultSize: { w: 1, h: 6 }, basePriority: 100, integrated: true,
    contextBoost: (s) => boostWhen(s.criticalIncidents > 0, 200, `${s.criticalIncidents} critical incident${s.criticalIncidents === 1 ? '' : 's'} active`),
  },
  {
    id: 'critical-alerts', title: 'Critical Alerts', description: 'Firing alerts at critical severity.',
    category: 'operations', kind: 'panel', module: 'alerts', requires: ['observability.read'],
    defaultSize: { w: 1, h: 6 }, basePriority: 104, integrated: true,
    contextBoost: (s) => boostWhen(s.criticalAlerts > 0, 175, `${s.criticalAlerts} critical alerts firing`),
  },
  {
    id: 'recommended-actions', title: 'Recommended Actions', description: 'The highest-impact things to do next, across cost, security and operations.',
    category: 'operations', kind: 'panel', module: null,
    requires: [], anyOf: ['cost.read', 'security.read', 'incident.read', 'observability.read'],
    defaultSize: { w: 1, h: 6 }, basePriority: 108, integrated: true,
  },
  {
    id: 'investigations', title: 'Active Investigations', description: 'Incidents currently under investigation.',
    category: 'operations', kind: 'panel', module: 'incidents', requires: ['incident.read'],
    anyOf: ['security.investigate', 'incident.manage'],
    defaultSize: { w: 1, h: 6 }, basePriority: 114, integrated: true, defaultEnabled: false,
    contextBoost: (s) => boostWhen(s.investigatingIncidents > 0, 120, `${s.investigatingIncidents} investigations open`),
  },
  {
    id: 'automation-activity', title: 'Automation Activity', description: 'Recent runbook, workflow and remediation runs.',
    category: 'operations', kind: 'panel', module: 'automation', requires: ['automation.read'],
    defaultSize: { w: 1, h: 6 }, basePriority: 250, integrated: true, defaultEnabled: false,
  },
  {
    id: 'recent-changes', title: 'Recent Changes', description: 'Resource create / modify / delete events.',
    category: 'operations', kind: 'panel', module: 'resources', requires: ['infrastructure.read'],
    defaultSize: { w: 1, h: 6 }, basePriority: 252, integrated: true, defaultEnabled: false,
  },
  {
    id: 'recent-activity', title: 'Recent Activity', description: 'Audit trail of actions across your organization.',
    category: 'operations', kind: 'panel', module: null, requires: [],
    defaultSize: { w: 1, h: 6 }, basePriority: 256, integrated: true,
  },
  {
    id: 'favorites', title: 'Favorites', description: 'Accounts, resources and reports you pinned.',
    category: 'operations', kind: 'panel', module: null, requires: [],
    defaultSize: { w: 1, h: 6 }, basePriority: 258, integrated: true,
  },

  // ══ Security panels ════════════════════════════════════════════════════
  {
    id: 'security-posture', title: 'Security Posture', description: 'Risk score, severity mix and compliance at a glance.',
    category: 'security', kind: 'panel', module: 'security', requires: ['security.read'],
    defaultSize: { w: 2, h: 7 }, basePriority: 120, integrated: true,
    contextBoost: (s) => boostWhen(s.criticalVulns > 0 || s.openAttackPaths > 0, 118, 'Elevated security risk detected'),
  },
  {
    id: 'security-score', title: 'Security Score', description: 'Risk score trend and band.',
    category: 'security', kind: 'panel', module: 'security', requires: ['security.read'],
    defaultSize: { w: 1, h: 5 }, basePriority: 122, integrated: true, defaultEnabled: false,
  },
  {
    id: 'critical-vulnerabilities', title: 'Critical Vulnerabilities', description: 'Newest open critical findings.',
    category: 'security', kind: 'panel', module: 'security', requires: ['security.read'],
    defaultSize: { w: 1, h: 6 }, basePriority: 124, integrated: true,
    contextBoost: (s) => boostWhen(s.criticalVulns > 0, 150, `${s.criticalVulns} critical vulnerabilities open`),
  },
  {
    id: 'critical-now', title: 'Critical Now', description: 'Open findings ranked by severity plus real-world context (internet exposure, asset criticality) — not just recency.',
    category: 'security', kind: 'panel', module: 'security', requires: ['security.read'],
    defaultSize: { w: 1, h: 6 }, basePriority: 123, integrated: true, defaultEnabled: false,
    contextBoost: (s) => boostWhen(s.criticalVulns > 0, 148, `${s.criticalVulns} critical vulnerabilities open`),
  },
  {
    id: 'attack-paths', title: 'Attack Paths', description: 'Resources where exposure, a vulnerability and over-privilege converge.',
    category: 'security', kind: 'panel', module: 'security', requires: ['security.read'],
    defaultSize: { w: 1, h: 6 }, basePriority: 126, integrated: true,
    contextBoost: (s) => boostWhen(s.openAttackPaths > 0, 145, `${s.openAttackPaths} attack path${s.openAttackPaths === 1 ? '' : 's'}`),
  },
  {
    id: 'exposure', title: 'Exposure', description: 'Publicly reachable resources flagged by IAM Access Analyzer.',
    category: 'security', kind: 'panel', module: 'security', requires: ['security.read'],
    defaultSize: { w: 1, h: 6 }, basePriority: 128, integrated: true, defaultEnabled: false,
  },
  {
    id: 'compliance', title: 'Compliance', description: 'Benchmark pass rates (CIS, PCI DSS, ISO 27001).',
    category: 'security', kind: 'panel', module: 'security', requires: ['security.read'],
    defaultSize: { w: 1, h: 6 }, basePriority: 130, integrated: true, defaultEnabled: false,
  },
  {
    id: 'identity-risk', title: 'Identity Risk', description: 'Over-privileged and MFA-less cloud identities.',
    category: 'security', kind: 'panel', module: 'cloud', requires: ['security.read', 'cloud.read'],
    defaultSize: { w: 1, h: 6 }, basePriority: 132, integrated: true, defaultEnabled: false,
  },
  {
    id: 'container-security', title: 'Container Security', description: 'Image vulnerabilities from Trivy.',
    category: 'security', kind: 'panel', module: 'containers', requires: ['container.security'],
    defaultSize: { w: 1, h: 6 }, basePriority: 134, integrated: true, defaultEnabled: false,
  },
  {
    id: 'kubernetes-security', title: 'Kubernetes Security', description: 'Cluster posture — needs Kubescape / kube-bench results.',
    category: 'security', kind: 'panel', module: 'containers', requires: ['kubernetes.security'],
    defaultSize: { w: 1, h: 6 }, basePriority: 136, integrated: false, defaultEnabled: false,
  },

  // ══ FinOps panels ═════════════════════════════════════════════════════
  {
    id: 'current-cloud-spend', title: 'Current Cloud Spend', description: 'Month-to-date spend and trend.',
    category: 'finops', kind: 'panel', module: 'cost', requires: ['cost.read'],
    defaultSize: { w: 2, h: 6 }, basePriority: 150, integrated: true,
  },
  {
    id: 'monthly-run-rate', title: 'Monthly Run Rate', description: 'Projected full-month spend.',
    category: 'finops', kind: 'panel', module: 'cost', requires: ['cost.read'],
    defaultSize: { w: 1, h: 5 }, basePriority: 152, integrated: true, defaultEnabled: false,
  },
  {
    id: 'cost-by-service', title: 'Cost by Service', description: 'Top spending services this month.',
    category: 'finops', kind: 'panel', module: 'cost', requires: ['cost.read'],
    defaultSize: { w: 1, h: 6 }, basePriority: 154, integrated: true,
  },
  {
    id: 'cost-by-provider', title: 'Cost by Provider', description: 'Spend split across AWS, Azure and GCP.',
    category: 'finops', kind: 'panel', module: 'cost', requires: ['cost.read'],
    defaultSize: { w: 1, h: 6 }, basePriority: 156, integrated: true, defaultEnabled: false,
  },
  {
    id: 'budget-status', title: 'Budget Status', description: 'Budgets and their current utilisation.',
    category: 'finops', kind: 'panel', module: 'cost', requires: ['cost.read'],
    defaultSize: { w: 1, h: 6 }, basePriority: 158, integrated: true, defaultEnabled: false,
  },
  {
    id: 'cost-anomalies', title: 'Cost Anomalies', description: 'Day-over-day spend spikes.',
    category: 'finops', kind: 'panel', module: 'cost', requires: ['cost.read'],
    defaultSize: { w: 1, h: 6 }, basePriority: 160, integrated: true, defaultEnabled: false,
    contextBoost: (s) => boostWhen(s.costAnomalies > 0, 155, `${s.costAnomalies} cost anomal${s.costAnomalies === 1 ? 'y' : 'ies'}`),
  },
  {
    id: 'optimization-opportunities', title: 'Optimization Opportunities', description: 'Open cost recommendations by impact.',
    category: 'finops', kind: 'panel', module: 'cost', requires: ['cost.read'],
    defaultSize: { w: 1, h: 6 }, basePriority: 162, integrated: true,
  },
  {
    id: 'potential-savings', title: 'Potential Savings', description: 'Realisable monthly savings and idle resources.',
    category: 'finops', kind: 'panel', module: 'cost', requires: ['cost.read'],
    defaultSize: { w: 1, h: 5 }, basePriority: 164, integrated: true, defaultEnabled: false,
  },

  // ══ Platform panels ═══════════════════════════════════════════════════
  {
    id: 'cloud-accounts', title: 'Cloud Accounts', description: 'Connected accounts, subscriptions and projects.',
    category: 'platform', kind: 'panel', module: 'cloud', requires: ['cloud.read'],
    defaultSize: { w: 1, h: 6 }, basePriority: 180, integrated: true,
  },
  {
    id: 'resource-inventory', title: 'Resource Inventory', description: 'Discovered resources by category.',
    category: 'platform', kind: 'panel', module: 'resources', requires: ['infrastructure.read'],
    defaultSize: { w: 1, h: 6 }, basePriority: 182, integrated: true,
  },
  {
    id: 'environment-health', title: 'Environment Health', description: 'Resources and connection health per environment.',
    category: 'platform', kind: 'panel', module: 'cloud', requires: ['cloud.read'],
    defaultSize: { w: 1, h: 6 }, basePriority: 184, integrated: true, defaultEnabled: false,
  },
  {
    id: 'infrastructure-health', title: 'Infrastructure Health', description: 'CloudWatch alarm and resource-status rollup.',
    category: 'platform', kind: 'panel', module: 'monitoring', requires: ['observability.read'],
    defaultSize: { w: 1, h: 6 }, basePriority: 186, integrated: true,
  },
  {
    id: 'service-health', title: 'Service Health', description: 'Healthy vs degraded vs unhealthy resources.',
    category: 'platform', kind: 'panel', module: 'monitoring', requires: ['observability.read'],
    defaultSize: { w: 1, h: 6 }, basePriority: 188, integrated: true, defaultEnabled: false,
  },
  {
    id: 'kubernetes-health', title: 'Kubernetes Health', description: 'Clusters, nodes and workloads.',
    category: 'platform', kind: 'panel', module: 'containers', requires: ['kubernetes.read'],
    defaultSize: { w: 1, h: 6 }, basePriority: 190, integrated: true, defaultEnabled: false,
  },
  {
    id: 'resource-distribution', title: 'Resource Distribution', description: 'Resource mix by category.',
    category: 'platform', kind: 'panel', module: 'resources', requires: ['infrastructure.read'],
    defaultSize: { w: 1, h: 6 }, basePriority: 192, integrated: true, defaultEnabled: false,
  },
  {
    id: 'resource-trend', title: 'Resource Trend', description: 'Resources created vs deleted over time.',
    category: 'platform', kind: 'panel', module: 'resources', requires: ['infrastructure.read'],
    defaultSize: { w: 2, h: 6 }, basePriority: 194, integrated: true, defaultEnabled: false,
  },
  {
    id: 'folders-projects', title: 'Folders & Projects', description: 'Your slice of the organization hierarchy.',
    category: 'platform', kind: 'panel', module: 'organization', requires: [],
    defaultSize: { w: 1, h: 6 }, basePriority: 262, integrated: true, defaultEnabled: false,
  },

  // ══ DevOps panels ═════════════════════════════════════════════════════
  {
    id: 'recent-deployments', title: 'Recent Deployments', description: 'Latest deployment events and their status.',
    category: 'devops', kind: 'panel', module: 'monitoring', requires: ['devops.read'],
    defaultSize: { w: 1, h: 6 }, basePriority: 200, integrated: true,
  },
  {
    id: 'deployment-frequency', title: 'Deployment Frequency', description: 'Deployments per day over the window.',
    category: 'devops', kind: 'panel', module: 'monitoring', requires: ['devops.read'],
    defaultSize: { w: 1, h: 6 }, basePriority: 202, integrated: true, defaultEnabled: false,
  },
  {
    id: 'failed-deployments', title: 'Failed Deployments', description: 'Deployments that rolled back or errored.',
    category: 'devops', kind: 'panel', module: 'monitoring', requires: ['devops.read'],
    defaultSize: { w: 1, h: 6 }, basePriority: 204, integrated: true, defaultEnabled: false,
    contextBoost: (s) => boostWhen(s.failedDeployments > 0, 150, `${s.failedDeployments} failed deployment${s.failedDeployments === 1 ? '' : 's'}`),
  },
  {
    id: 'change-failure-rate', title: 'Change Failure Rate', description: 'Share of deployments that failed.',
    category: 'devops', kind: 'panel', module: 'monitoring', requires: ['devops.read'],
    defaultSize: { w: 1, h: 5 }, basePriority: 206, integrated: true, defaultEnabled: false,
  },
  {
    id: 'pipeline-health', title: 'Pipeline Health', description: 'CI pipeline status — connect a CI provider to populate.',
    category: 'devops', kind: 'panel', module: 'monitoring', requires: ['devops.read'],
    defaultSize: { w: 1, h: 5 }, basePriority: 208, integrated: false, defaultEnabled: false,
  },
  {
    id: 'build-success-rate', title: 'Build Success Rate', description: 'Successful builds — connect a CI provider to populate.',
    category: 'devops', kind: 'panel', module: 'monitoring', requires: ['devops.read'],
    defaultSize: { w: 1, h: 5 }, basePriority: 210, integrated: false, defaultEnabled: false,
  },
  {
    id: 'lead-time', title: 'Lead Time for Changes', description: 'Commit-to-deploy time — needs commit + deploy linkage.',
    category: 'devops', kind: 'panel', module: 'monitoring', requires: ['devops.read'],
    defaultSize: { w: 1, h: 5 }, basePriority: 212, integrated: false, defaultEnabled: false,
  },

  // ══ Infrastructure / IaC panels ═══════════════════════════════════════
  {
    id: 'infrastructure-changes', title: 'Infrastructure Changes', description: 'Resource lifecycle events over time.',
    category: 'iac', kind: 'panel', module: 'resources', requires: ['infrastructure.read'],
    defaultSize: { w: 1, h: 6 }, basePriority: 220, integrated: true, defaultEnabled: false,
  },
  {
    id: 'resource-changes', title: 'Resource Changes', description: 'Net resource growth: created vs deleted.',
    category: 'iac', kind: 'panel', module: 'resources', requires: ['infrastructure.read'],
    defaultSize: { w: 1, h: 5 }, basePriority: 222, integrated: true, defaultEnabled: false,
  },
  {
    id: 'configuration-drift', title: 'Configuration Drift', description: 'Non-compliant resources from AWS Config.',
    category: 'iac', kind: 'panel', module: 'security', requires: ['security.read'],
    defaultSize: { w: 1, h: 6 }, basePriority: 224, integrated: true, defaultEnabled: false,
  },
  {
    id: 'iac-changes', title: 'IaC Changes', description: 'Recent Checkov IaC scan results.',
    category: 'iac', kind: 'panel', module: 'security', requires: ['terraform.read'],
    defaultSize: { w: 1, h: 6 }, basePriority: 226, integrated: true, defaultEnabled: false,
  },
  {
    id: 'terraform-drift', title: 'Terraform Drift', description: 'State vs reality drift — needs Terraform state ingestion.',
    category: 'iac', kind: 'panel', module: 'resources', requires: ['terraform.read'],
    defaultSize: { w: 1, h: 5 }, basePriority: 228, integrated: false, defaultEnabled: false,
  },

  // ══ Observability panels ══════════════════════════════════════════════
  {
    id: 'alerts-panel', title: 'Alerts', description: 'Currently firing alerts by severity.',
    category: 'observability', kind: 'panel', module: 'alerts', requires: ['observability.read'],
    defaultSize: { w: 1, h: 6 }, basePriority: 230, integrated: true, defaultEnabled: false,
  },
  {
    id: 'events', title: 'Events', description: 'Recent resource and platform events.',
    category: 'observability', kind: 'panel', module: 'monitoring', requires: ['observability.read'],
    defaultSize: { w: 1, h: 6 }, basePriority: 232, integrated: true, defaultEnabled: false,
  },
  {
    id: 'golden-signals', title: 'Golden Signals', description: 'Latency, traffic, errors and saturation — needs a metrics source.',
    category: 'observability', kind: 'panel', module: 'monitoring', requires: ['observability.read'],
    defaultSize: { w: 2, h: 5 }, basePriority: 234, integrated: false, defaultEnabled: false,
  },
  {
    id: 'error-rate', title: 'Error Rate', description: 'Errors over time — needs a metrics source.',
    category: 'observability', kind: 'panel', module: 'monitoring', requires: ['observability.read'],
    defaultSize: { w: 1, h: 5 }, basePriority: 240, integrated: false, defaultEnabled: false,
  },
  {
    id: 'latency', title: 'Latency', description: 'P50 / P95 / P99 — needs a metrics source.',
    category: 'observability', kind: 'panel', module: 'monitoring', requires: ['observability.read'],
    defaultSize: { w: 1, h: 5 }, basePriority: 242, integrated: false, defaultEnabled: false,
  },
  {
    id: 'traffic', title: 'Traffic', description: 'Requests per second — needs a metrics source.',
    category: 'observability', kind: 'panel', module: 'monitoring', requires: ['observability.read'],
    defaultSize: { w: 1, h: 5 }, basePriority: 244, integrated: false, defaultEnabled: false,
  },
  {
    id: 'saturation', title: 'Saturation', description: 'Resource utilisation — needs a metrics source.',
    category: 'observability', kind: 'panel', module: 'monitoring', requires: ['observability.read'],
    defaultSize: { w: 1, h: 5 }, basePriority: 246, integrated: false, defaultEnabled: false,
  },
];
