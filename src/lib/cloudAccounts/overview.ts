/**
 * Cloud Accounts → Overview — pure aggregation layer (spec §2, §5–26, §44).
 *
 * The Overview is composed on the frontend from endpoints that already exist
 * (each connector's `/dashboard` + `/health/detailed`, plus the resources /
 * cost / security / containers dashboards). This module turns those raw
 * payloads into the exact shapes the chart + section components render —
 * provider roll-ups, health buckets, resource distribution, sync buckets,
 * a prioritised "attention required" list, activity timeline, etc.
 *
 * Everything here is pure and unit-tested. No fabricated numbers: where a
 * metric genuinely isn't available from the compose endpoints (e.g. GCP
 * spend, per-account staleness) the helpers return an explicit null / omit
 * the row rather than inventing a value.
 */
import type {
  AwsAccountsDashboard,
  CloudAccountsHealthResponse,
  HealthSignal,
} from '../api';
import type { BarDatum } from '../../components/charts/BarChart';
import type { DonutSlice } from '../../components/charts/Donut';
import type { StackRow } from '../../components/charts/StackedBar';

export type Provider = 'aws' | 'azure' | 'gcp';
export const PROVIDERS: Provider[] = ['aws', 'azure', 'gcp'];
export const PROVIDER_LABEL: Record<Provider, string> = { aws: 'AWS', azure: 'Azure', gcp: 'GCP' };
export const PROVIDER_UNIT: Record<Provider, string> = { aws: 'accounts', azure: 'subscriptions', gcp: 'projects' };
/** GCP has no cost ingestion in this build; Azure cost is best-effort. */
export const PROVIDER_HAS_COST: Record<Provider, boolean> = { aws: true, azure: true, gcp: false };

export type ProviderDashes = Record<Provider, AwsAccountsDashboard>;
export type ProviderHealth = Record<Provider, CloudAccountsHealthResponse | null>;

/** A zeroed dashboard — used as the fallback for a provider whose fetch failed, and to narrow the view to one provider. */
export const EMPTY_DASHBOARD: AwsAccountsDashboard = {
  totalAccounts: 0, healthyAccounts: 0, failedAccounts: 0, disconnectedAccounts: 0, accountsNeedingAttention: 0,
  resourcesDiscovered: 0, regionsCovered: 0, lastDiscovery: null, nextScheduledDiscovery: null, discoverySuccessRate: null,
  accountsNeedingAttentionList: [], permissionErrors: 0, syncFailures: 0, monthlyCost: 0, topCostAccounts: [],
  topGrowingAccounts: [], openRecommendations: 0, potentialMonthlySavings: 0, rotationDue: 0, recentActivity: [], recentAlerts: [],
};

/** Narrow the per-provider maps to a single provider (the rest zeroed / null), for the Cloud filter. */
export function narrowToProvider(
  dashes: ProviderDashes,
  health: ProviderHealth,
  provider: Provider | null,
): { dashes: ProviderDashes; health: ProviderHealth } {
  if (!provider) return { dashes, health };
  const d = { aws: EMPTY_DASHBOARD, azure: EMPTY_DASHBOARD, gcp: EMPTY_DASHBOARD } as ProviderDashes;
  const h = { aws: null, azure: null, gcp: null } as ProviderHealth;
  d[provider] = dashes[provider];
  h[provider] = health[provider];
  return { dashes: d, health: h };
}

export interface ProviderRollup {
  provider: Provider;
  total: number;
  healthy: number;
  warning: number;
  critical: number;
  unknown: number;
  attention: number;
  resources: number;
  monthlyCost: number;
  hasCost: boolean;
  /** healthy / rated, 0–100, or null when nothing is rated. */
  healthPercent: number | null;
}

export interface OverviewAggregate {
  perProvider: Record<Provider, ProviderRollup>;
  activeProviders: Provider[];
  totals: {
    total: number;
    healthy: number;
    warning: number;
    critical: number;
    unknown: number;
    attention: number;
    resources: number;
    monthlyCost: number;
    healthPercent: number | null;
  };
  lastDiscovery: string | null;
}

function clampNonNeg(n: number): number {
  return n > 0 ? n : 0;
}

function pct(part: number, whole: number): number | null {
  return whole <= 0 ? null : Math.round((part / whole) * 100);
}

/** One provider's roll-up. Health buckets come from `/health/detailed` when present, else the dashboard counts. */
export function rollupProvider(
  provider: Provider,
  dash: AwsAccountsDashboard,
  health: CloudAccountsHealthResponse | null,
): ProviderRollup {
  let healthy: number;
  let warning: number;
  let critical: number;
  let unknown: number;
  let total: number;

  if (health && health.summary.total > 0) {
    ({ healthy, warning, critical, unknown } = health.summary);
    total = health.summary.total;
  } else {
    total = dash.totalAccounts;
    healthy = dash.healthyAccounts;
    critical = dash.failedAccounts;
    unknown = clampNonNeg(dash.disconnectedAccounts - dash.failedAccounts);
    warning = clampNonNeg(total - healthy - critical - unknown);
  }

  const rated = total - unknown;
  return {
    provider,
    total,
    healthy,
    warning,
    critical,
    unknown,
    attention: dash.accountsNeedingAttention,
    resources: dash.resourcesDiscovered,
    monthlyCost: dash.monthlyCost,
    hasCost: PROVIDER_HAS_COST[provider],
    healthPercent: pct(healthy, rated),
  };
}

export function aggregateOverview(dashes: ProviderDashes, health: ProviderHealth): OverviewAggregate {
  const perProvider = {} as Record<Provider, ProviderRollup>;
  for (const p of PROVIDERS) perProvider[p] = rollupProvider(p, dashes[p], health[p]);

  const totals = PROVIDERS.reduce(
    (acc, p) => {
      const r = perProvider[p];
      acc.total += r.total;
      acc.healthy += r.healthy;
      acc.warning += r.warning;
      acc.critical += r.critical;
      acc.unknown += r.unknown;
      acc.attention += r.attention;
      acc.resources += r.resources;
      acc.monthlyCost += r.monthlyCost;
      return acc;
    },
    { total: 0, healthy: 0, warning: 0, critical: 0, unknown: 0, attention: 0, resources: 0, monthlyCost: 0, healthPercent: null as number | null },
  );
  totals.healthPercent = pct(totals.healthy, totals.total - totals.unknown);

  const lastDiscovery =
    PROVIDERS.map((p) => dashes[p].lastDiscovery)
      .filter((d): d is string => Boolean(d))
      .sort()
      .at(-1) ?? null;

  return {
    perProvider,
    activeProviders: PROVIDERS.filter((p) => perProvider[p].total > 0),
    totals,
    lastDiscovery,
  };
}

// ── Cloud health visualisations (spec §9, §10, §25) ──────────────────────────

export function healthDonutSlices(t: OverviewAggregate['totals']): DonutSlice[] {
  return [
    { label: 'Healthy', value: t.healthy, tone: 'good' },
    { label: 'Warning', value: t.warning, tone: 'warning' },
    { label: 'Critical', value: t.critical, tone: 'critical' },
    { label: 'Unknown', value: t.unknown, tone: undefined },
  ].filter((s) => s.value > 0) as DonutSlice[];
}

/** One stacked row per active provider — health composition, comparable widths, `%` trailing. */
export function providerHealthRows(agg: OverviewAggregate): StackRow[] {
  return agg.activeProviders.map((p) => {
    const r = agg.perProvider[p];
    return {
      label: PROVIDER_LABEL[p],
      trailing: r.healthPercent === null ? '—' : `${r.healthPercent}%`,
      segments: [
        { label: 'Healthy', value: r.healthy, tone: 'good' as const },
        { label: 'Warning', value: r.warning, tone: 'warning' as const },
        { label: 'Critical', value: r.critical, tone: 'critical' as const },
        { label: 'Unknown', value: r.unknown },
      ],
    };
  });
}

// ── Discovery & connectivity health (spec §17, adapted to compose data) ──────
//
// Real "Compute/DB/Network %" isn't available from the compose endpoints, so
// this rolls up the per-account health *signals* instead — the share of
// accounts where each signal (connection, permissions, discovery, sync
// freshness, credentials) is `ok`. Honest and directly actionable.

export interface SignalHealthRow {
  key: HealthSignal['key'];
  label: string;
  okPercent: number | null;
  okCount: number;
  total: number;
}

const SIGNAL_LABEL: Record<HealthSignal['key'], string> = {
  connection: 'Connectivity',
  permissions: 'Permissions',
  discovery: 'Discovery',
  sync_freshness: 'Sync freshness',
  credentials: 'Credentials',
};

export function signalHealthRows(health: ProviderHealth): SignalHealthRow[] {
  const rows = new Map<HealthSignal['key'], { ok: number; total: number }>();
  for (const p of PROVIDERS) {
    const resp = health[p];
    if (!resp) continue;
    for (const acct of resp.accounts) {
      for (const sig of acct.signals) {
        const cur = rows.get(sig.key) ?? { ok: 0, total: 0 };
        cur.total += 1;
        if (sig.status === 'ok') cur.ok += 1;
        rows.set(sig.key, cur);
      }
    }
  }
  return (Object.keys(SIGNAL_LABEL) as HealthSignal['key'][])
    .filter((k) => rows.has(k))
    .map((k) => {
      const { ok, total } = rows.get(k)!;
      return { key: k, label: SIGNAL_LABEL[k], okPercent: pct(ok, total), okCount: ok, total };
    });
}

// ── Synchronisation health (spec §19) ───────────────────────────────────────

export interface SyncBuckets {
  successful: number;
  failed: number;
  permissionIssues: number;
  total: number;
}

export function syncBuckets(agg: OverviewAggregate, dashes: ProviderDashes): SyncBuckets {
  const failed = PROVIDERS.reduce((n, p) => n + dashes[p].syncFailures, 0);
  const permissionIssues = PROVIDERS.reduce((n, p) => n + dashes[p].permissionErrors, 0);
  const successful = clampNonNeg(agg.totals.total - failed - permissionIssues);
  return { successful, failed, permissionIssues, total: agg.totals.total };
}

export function syncStackRow(b: SyncBuckets): StackRow[] {
  return [
    {
      segments: [
        { label: 'Synced', value: b.successful, tone: 'good' as const },
        { label: 'Permission issue', value: b.permissionIssues, tone: 'warning' as const },
        { label: 'Failed', value: b.failed, tone: 'critical' as const },
      ],
    },
  ];
}

// ── Resource distribution + growth (spec §11, §12, §13, §23) ─────────────────

export interface ResourcesDashboardLike {
  total: number;
  byCategory: Record<string, number>;
  byStatus: Record<string, number>;
  byRegion: Record<string, number>;
  trend30d: { date: string; created: number; deleted: number }[];
}

export function recordToBars(rec: Record<string, number>, limit = 8): BarDatum[] {
  return Object.entries(rec)
    .map(([label, value]) => ({ label, value }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

/** Cumulative resource count over the trend window, back-calculated so the series ends at `total`. */
export function resourceGrowthSeries(res: ResourcesDashboardLike): { x: string; y: number }[] {
  const net = res.trend30d.map((d) => d.created - d.deleted);
  const totalNet = net.reduce((a, b) => a + b, 0);
  let running = res.total - totalNet;
  return res.trend30d.map((d, i) => {
    running += net[i];
    return { x: d.date, y: clampNonNeg(running) };
  });
}

// ── Cost (spec §14, §15) ────────────────────────────────────────────────────

export function costByProviderBars(agg: OverviewAggregate): BarDatum[] {
  return PROVIDERS.filter((p) => agg.perProvider[p].hasCost && agg.perProvider[p].total > 0).map((p) => ({
    label: PROVIDER_LABEL[p],
    value: agg.perProvider[p].monthlyCost,
  }));
}

// ── Attention required (spec §20) ───────────────────────────────────────────

export type AttentionSeverity = 'critical' | 'warning';

export interface AttentionItem {
  id: string;
  severity: AttentionSeverity;
  icon: string;
  text: string;
  action: { label: string; to: string };
}

const STALE_DISCOVERY_DAYS = 7;

export interface AttentionInputs {
  security: { bySeverity?: Record<string, number>; openFindings?: number } | null;
  now?: number;
}

export function buildAttentionItems(
  agg: OverviewAggregate,
  dashes: ProviderDashes,
  { security, now = Date.now() }: AttentionInputs,
): AttentionItem[] {
  const items: AttentionItem[] = [];
  const sync = syncBuckets(agg, dashes);

  if (sync.failed > 0) {
    items.push({
      id: 'sync-failed',
      severity: 'critical',
      icon: 'refresh-cw',
      text: `${sync.failed} ${sync.failed === 1 ? 'environment' : 'environments'} failed synchronization`,
      action: { label: 'View sync', to: '/cloud-accounts?tab=Sync+Center' },
    });
  }
  if (sync.permissionIssues > 0) {
    items.push({
      id: 'perm-issues',
      severity: 'warning',
      icon: 'key',
      text: `${sync.permissionIssues} ${sync.permissionIssues === 1 ? 'environment has' : 'environments have'} permission issues`,
      action: { label: 'Review access', to: '/cloud-accounts?tab=Access' },
    });
  }

  const staleProviders = PROVIDERS.filter((p) => {
    const d = dashes[p].lastDiscovery;
    return d != null && now - new Date(d).getTime() > STALE_DISCOVERY_DAYS * 86_400_000 && agg.perProvider[p].total > 0;
  });
  if (staleProviders.length > 0) {
    items.push({
      id: 'stale',
      severity: 'warning',
      icon: 'clock',
      text: `${staleProviders.map((p) => PROVIDER_LABEL[p]).join(', ')} discovery data is more than ${STALE_DISCOVERY_DAYS} days old`,
      action: { label: 'Run discovery', to: '/cloud-accounts?tab=Sync+Center' },
    });
  }

  const criticalFindings = security?.bySeverity?.critical ?? 0;
  if (criticalFindings > 0) {
    items.push({
      id: 'sec-critical',
      severity: 'critical',
      icon: 'shield-alert',
      text: `${criticalFindings} critical security ${criticalFindings === 1 ? 'finding' : 'findings'} across cloud resources`,
      action: { label: 'Investigate', to: '/vulnerability-management' },
    });
  }

  const rotationDue = PROVIDERS.reduce((n, p) => n + dashes[p].rotationDue, 0);
  if (rotationDue > 0) {
    items.push({
      id: 'rotation',
      severity: 'warning',
      icon: 'key',
      text: `${rotationDue} ${rotationDue === 1 ? 'credential is' : 'credentials are'} due for rotation`,
      action: { label: 'Review', to: '/cloud-accounts?tab=Settings' },
    });
  }

  const order: Record<AttentionSeverity, number> = { critical: 0, warning: 1 };
  return items.sort((a, b) => order[a.severity] - order[b.severity]);
}

// ── Top problem accounts (spec §26) ─────────────────────────────────────────

export interface ProblemAccount {
  connectionId: string;
  connectionName: string;
  provider: Provider;
  issue: string;
}

export function topProblemAccounts(dashes: ProviderDashes, limit = 6): ProblemAccount[] {
  const out: ProblemAccount[] = [];
  for (const p of PROVIDERS) {
    for (const a of dashes[p].accountsNeedingAttentionList) {
      out.push({ connectionId: a.connectionId, connectionName: a.connectionName, provider: p, issue: a.reason });
    }
  }
  return out.slice(0, limit);
}

// ── Recent activity timeline (spec §21) ─────────────────────────────────────

export interface TimelineEntry {
  id: string;
  provider: Provider;
  action: string;
  occurredAt: string;
  actorEmail: string | null;
}

export function mergeActivity(dashes: ProviderDashes, limit = 12): TimelineEntry[] {
  const all: TimelineEntry[] = [];
  for (const p of PROVIDERS) {
    for (const e of dashes[p].recentActivity) {
      all.push({ id: `${p}-${e.id}`, provider: p, action: e.action, occurredAt: e.occurredAt, actorEmail: e.actorEmail });
    }
  }
  return all.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1)).slice(0, limit);
}

/** Coarse category for the activity filter chips (spec §21). */
export function activityCategory(action: string): 'connections' | 'security' | 'cost' | 'configuration' | 'resources' | 'accounts' {
  const a = action.toLowerCase();
  if (a.includes('connect') || a.includes('sync') || a.includes('credential') || a.includes('validat')) return 'connections';
  if (a.includes('security') || a.includes('finding') || a.includes('vuln') || a.includes('permission')) return 'security';
  if (a.includes('cost') || a.includes('budget') || a.includes('spend')) return 'cost';
  if (a.includes('discover') || a.includes('resource') || a.includes('scan')) return 'resources';
  if (a.includes('account') || a.includes('project') || a.includes('subscription') || a.includes('import')) return 'accounts';
  return 'configuration';
}
