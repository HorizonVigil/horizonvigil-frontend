/**
 * Widget Registry — the id → React component half. The metadata half is
 * lib/overview/registryMeta.ts (kept apart so the engine stays testable
 * without pulling in lib/api.ts).
 *
 * A load-time assertion fails loudly in dev if the two drift — every
 * REGISTRY_META id must have a component here and vice versa.
 */
import { REGISTRY_META } from '../../lib/overview/registryMeta';
import type { WidgetComponent } from '../../lib/overview/types';

import * as platform from './widgets/platformWidgets';
import * as finops from './widgets/finopsWidgets';
import * as security from './widgets/securityWidgets';
import * as devops from './widgets/devopsWidgets';
import * as observability from './widgets/observabilityWidgets';
import * as operations from './widgets/operationsWidgets';

export const WIDGET_COMPONENTS: Record<string, WidgetComponent> = {
  // ── KPIs ────────────────────────────────────────────────────────────────
  'kpi-security-score': security.SecurityScoreKpi,
  'kpi-critical-risks': security.CriticalRisksKpi,
  'kpi-critical-vulnerabilities': security.CriticalVulnerabilitiesKpi,
  'kpi-critical-findings': security.CriticalFindingsKpi,
  'kpi-exposures': security.ExposuresKpi,
  'kpi-attack-paths': security.AttackPathsKpi,
  'kpi-active-incidents': operations.ActiveIncidentsKpi,
  'kpi-open-investigations': operations.OpenInvestigationsKpi,
  'kpi-mttr': operations.MttrKpi,
  'kpi-open-issues': operations.OpenIssuesKpi,
  'kpi-cloud-spend': finops.CloudSpendKpi,
  'kpi-monthly-run-rate': finops.MonthlyRunRateKpi,
  'kpi-potential-savings': finops.PotentialSavingsKpi,
  'kpi-cost-anomalies': finops.CostAnomaliesKpi,
  'kpi-budget-status': finops.BudgetStatusKpi,
  'kpi-total-assets': platform.TotalAssetsKpi,
  'kpi-platform-health': platform.PlatformHealthKpi,
  'kpi-projects': platform.ProjectsKpi,
  'kpi-repositories': devops.RepositoriesKpi,
  'kpi-deployments': devops.DeploymentsKpi,
  'kpi-pipeline-success': devops.PipelineSuccessKpi,
  'kpi-service-health': observability.ServiceHealthKpi,
  'kpi-availability': observability.AvailabilityKpi,
  'kpi-error-rate': observability.ErrorRateKpi,
  'kpi-latency': observability.LatencyKpi,
  'kpi-events-per-min': observability.EventsPerMinKpi,

  // ── Operations panels ───────────────────────────────────────────────────
  'quick-actions': operations.QuickActionsWidget,
  'active-incidents': operations.ActiveIncidentsWidget,
  'critical-alerts': operations.CriticalAlertsWidget,
  'recommended-actions': operations.RecommendedActionsWidget,
  'investigations': operations.InvestigationsWidget,
  'automation-activity': operations.AutomationActivityWidget,
  'recent-changes': platform.RecentChangesWidget,
  'recent-activity': operations.RecentActivityWidget,
  'favorites': operations.FavoritesWidget,

  // ── Security panels ─────────────────────────────────────────────────────
  'security-posture': security.SecurityPostureWidget,
  'security-score': security.SecurityScoreWidget,
  'critical-vulnerabilities': security.CriticalVulnerabilitiesWidget,
  'critical-now': security.CriticalNowWidget,
  'attack-paths': security.AttackPathsWidget,
  'exposure': security.ExposureWidget,
  'compliance': security.ComplianceWidget,
  'identity-risk': security.IdentityRiskWidget,
  'container-security': security.ContainerSecurityWidget,
  'kubernetes-security': security.KubernetesSecurityWidget,

  // ── FinOps panels ──────────────────────────────────────────────────────
  'current-cloud-spend': finops.CurrentCloudSpendWidget,
  'monthly-run-rate': finops.MonthlyRunRateWidget,
  'cost-by-service': finops.CostByServiceWidget,
  'cost-by-provider': finops.CostByProviderWidget,
  'budget-status': finops.BudgetStatusWidget,
  'cost-anomalies': finops.CostAnomaliesWidget,
  'optimization-opportunities': finops.OptimizationOpportunitiesWidget,
  'potential-savings': finops.PotentialSavingsWidget,

  // ── Platform panels ────────────────────────────────────────────────────
  'cloud-accounts': platform.CloudAccountsWidget,
  'resource-inventory': platform.ResourceInventoryWidget,
  'environment-health': platform.EnvironmentHealthWidget,
  'infrastructure-health': platform.InfrastructureHealthWidget,
  'service-health': platform.ServiceHealthWidget,
  'kubernetes-health': platform.KubernetesHealthWidget,
  'resource-distribution': platform.ResourceDistributionWidget,
  'resource-trend': platform.ResourceTrendWidget,
  'folders-projects': platform.FoldersProjectsWidget,

  // ── DevOps panels ──────────────────────────────────────────────────────
  'recent-deployments': devops.RecentDeploymentsWidget,
  'deployment-frequency': devops.DeploymentFrequencyWidget,
  'failed-deployments': devops.FailedDeploymentsWidget,
  'change-failure-rate': devops.ChangeFailureRateWidget,
  'pipeline-health': devops.PipelineHealthWidget,
  'build-success-rate': devops.BuildSuccessRateWidget,
  'lead-time': devops.LeadTimeWidget,

  // ── Infrastructure / IaC panels ────────────────────────────────────────
  'infrastructure-changes': platform.InfrastructureChangesWidget,
  'resource-changes': platform.ResourceChangesWidget,
  'configuration-drift': security.ConfigurationDriftWidget,
  'iac-changes': security.IacChangesWidget,
  'terraform-drift': security.TerraformDriftWidget,

  // ── Observability panels ───────────────────────────────────────────────
  'alerts-panel': observability.AlertsPanelWidget,
  'events': observability.EventsWidget,
  'golden-signals': observability.GoldenSignalsWidget,
  'error-rate': observability.ErrorRateWidget,
  'latency': observability.LatencyWidget,
  'traffic': observability.TrafficWidget,
  'saturation': observability.SaturationWidget,
};

// Fail loudly if metadata and components have drifted.
const metaIds = new Set(REGISTRY_META.map((m) => m.id));
const compIds = new Set(Object.keys(WIDGET_COMPONENTS));
const missing = [...metaIds].filter((id) => !compIds.has(id));
const orphan = [...compIds].filter((id) => !metaIds.has(id));
if (missing.length || orphan.length) {
  throw new Error(
    `Overview widget registry mismatch — missing components: [${missing.join(', ')}]; orphan components: [${orphan.join(', ')}]`,
  );
}

export function getWidgetComponent(id: string): WidgetComponent | undefined {
  return WIDGET_COMPONENTS[id];
}
