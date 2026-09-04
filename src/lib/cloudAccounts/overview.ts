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

// ── Boundary normalisation ──────────────────────────────────────────────────
// The compose endpoints are typed but the live payloads can be partial (a
// service returns 200 with a subset of fields, or an older shape). Everything
// below trusts its inputs, so the raw payloads are normalised here first.

function num(x: unknown): number {
  return typeof x === 'number' && Number.isFinite(x) ? x : 0;
}
function arr<T>(x: unknown): T[] {
  return Array.isArray(x) ? (x as T[]) : [];
}
function rec(x: unknown): Record<string, number> {
  if (!x || typeof x !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) out[k] = num(v);
  return out;
}

/** Merge a raw (possibly partial) provider dashboard onto the zeroed shape and coerce every field. */
export function normalizeDashboard(raw: Partial<AwsAccountsDashboard> | null | undefined): AwsAccountsDashboard {
  const d = raw ?? {};
  return {
    totalAccounts: num(d.totalAccounts),
    healthyAccounts: num(d.healthyAccounts),
    failedAccounts: num(d.failedAccounts),
    disconnectedAccounts: num(d.disconnectedAccounts),
    accountsNeedingAttention: num(d.accountsNeedingAttention),
    resourcesDiscovered: num(d.resourcesDiscovered),
    regionsCovered: num(d.regionsCovered),
    lastDiscovery: typeof d.lastDiscovery === 'string' ? d.lastDiscovery : null,
    nextScheduledDiscovery: typeof d.nextScheduledDiscovery === 'string' ? d.nextScheduledDiscovery : null,
    discoverySuccessRate: typeof d.discoverySuccessRate === 'number' ? d.discoverySuccessRate : null,
    accountsNeedingAttentionList: arr<AwsAccountsDashboard['accountsNeedingAttentionList'][number]>(d.accountsNeedingAttentionList)
      .filter((a) => a && typeof a === 'object')
      .map((a) => ({ connectionId: String(a.connectionId ?? ''), connectionName: String(a.connectionName ?? 'Unknown'), reason: String(a.reason ?? '') })),
    permissionErrors: num(d.permissionErrors),
    syncFailures: num(d.syncFailures),
    monthlyCost: num(d.monthlyCost),
    topCostAccounts: arr(d.topCostAccounts),
    topGrowingAccounts: arr(d.topGrowingAccounts),
    openRecommendations: num(d.openRecommendations),
    potentialMonthlySavings: num(d.potentialMonthlySavings),
    rotationDue: num(d.rotationDue),
    recentActivity: arr<AwsAccountsDashboard['recentActivity'][number]>(d.recentActivity)
      .filter((e) => e && typeof e === 'object')
      .map((e) => ({
        id: String(e.id ?? Math.random()),
        action: String(e.action ?? 'activity'),
        targetId: e.targetId ?? null,
        occurredAt: typeof e.occurredAt === 'string' ? e.occurredAt : new Date(0).toISOString(),
        actorEmail: typeof e.actorEmail === 'string' ? e.actorEmail : null,
      })),
    recentAlerts: arr(d.recentAlerts),
  };
}

/** Coerce a `/health/detailed` response; returns null when the payload is unusable. */
export function normalizeHealth(raw: unknown): CloudAccountsHealthResponse | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<CloudAccountsHealthResponse>;
  const provider = r.provider === 'aws' || r.provider === 'azure' || r.provider === 'gcp' ? r.provider : null;
  if (!provider) return null;
  const accounts = arr<CloudAccountsHealthResponse['accounts'][number]>(r.accounts)
    .filter((a) => a && typeof a === 'object')
    .map((a) => ({ ...a, signals: arr<HealthSignal>(a.signals).filter((s) => s && typeof s === 'object') }));
  const s = (r.summary ?? {}) as Partial<CloudAccountsHealthResponse['summary']>;
  return {
    provider,
    accounts,
    summary: {
      total: num(s.total),
      healthy: num(s.healthy),
      warning: num(s.warning),
      critical: num(s.critical),
      unknown: num(s.unknown),
      healthPercent: typeof s.healthPercent === 'number' ? s.healthPercent : null,
    },
  };
}

/** Coerce the resources dashboard payload into the shape the Overview needs. */
export function normalizeResources(raw: unknown): ResourcesDashboardLike | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  return {
    total: num(r.total),
    byCategory: rec(r.byCategory),
    byStatus: rec(r.byStatus),
    byRegion: rec(r.byRegion),
    trend30d: arr<{ date: string; created: number; deleted: number }>(r.trend30d)
      .filter((d) => d && typeof d === 'object')
      .map((d) => ({ date: String(d.date ?? ''), created: num(d.created), deleted: num(d.deleted) })),
  };
}

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

  if (health && health.summary && num(health.summary.total) > 0) {
    healthy = num(health.summary.healthy);
    warning = num(health.summary.warning);
    critical = num(health.summary.critical);
    unknown = num(health.summary.unknown);
    total = num(health.summary.total);
  } else {
    total = num(dash.totalAccounts);
    healthy = num(dash.healthyAccounts);
    critical = num(dash.failedAccounts);
    unknown = clampNonNeg(num(dash.disconnectedAccounts) - num(dash.failedAccounts));
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
    attention: num(dash.accountsNeedingAttention),
    resources: num(dash.resourcesDiscovered),
    monthlyCost: num(dash.monthlyCost),
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
    for (const acct of arr<CloudAccountsHealthResponse['accounts'][number]>(resp.accounts)) {
      for (const sig of arr<HealthSignal>(acct?.signals)) {
        if (!sig?.key) continue;
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
  const failed = PROVIDERS.reduce((n, p) => n + num(dashes[p]?.syncFailures), 0);
  const permissionIssues = PROVIDERS.reduce((n, p) => n + num(dashes[p]?.permissionErrors), 0);
  const total = num(agg.totals.total);
  const successful = clampNonNeg(total - failed - permissionIssues);
  return { successful, failed, permissionIssues, total };
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

export function recordToBars(record: Record<string, number> | null | undefined, limit = 8): BarDatum[] {
  return Object.entries(record ?? {})
    .map(([label, value]) => ({ label, value: num(value) }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

/** Cumulative resource count over the trend window, back-calculated so the series ends at `total`. */
export function resourceGrowthSeries(res: ResourcesDashboardLike): { x: string; y: number }[] {
  const trend = arr<{ date: string; created: number; deleted: number }>(res?.trend30d);
  const net = trend.map((d) => num(d.created) - num(d.deleted));
  const totalNet = net.reduce((a, b) => a + b, 0);
  let running = num(res?.total) - totalNet;
  return trend.map((d, i) => {
    running += net[i];
    return { x: String(d.date ?? ''), y: clampNonNeg(running) };
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
    const d = dashes[p]?.lastDiscovery;
    if (d == null) return false;
    const t = new Date(d).getTime();
    return Number.isFinite(t) && now - t > STALE_DISCOVERY_DAYS * 86_400_000 && agg.perProvider[p].total > 0;
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

  const rotationDue = PROVIDERS.reduce((n, p) => n + num(dashes[p]?.rotationDue), 0);
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
    for (const a of arr<AwsAccountsDashboard['accountsNeedingAttentionList'][number]>(dashes[p]?.accountsNeedingAttentionList)) {
      if (!a) continue;
      out.push({
        connectionId: String(a.connectionId ?? ''),
        connectionName: String(a.connectionName ?? 'Unknown'),
        provider: p,
        issue: String(a.reason ?? 'Needs attention'),
      });
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
    for (const e of arr<AwsAccountsDashboard['recentActivity'][number]>(dashes[p]?.recentActivity)) {
      if (!e) continue;
      all.push({
        id: `${p}-${e.id ?? Math.random()}`,
        provider: p,
        action: String(e.action ?? 'activity'),
        occurredAt: typeof e.occurredAt === 'string' ? e.occurredAt : '',
        actorEmail: typeof e.actorEmail === 'string' ? e.actorEmail : null,
      });
    }
  }
  return all.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1)).slice(0, limit);
}

/** Coarse category for the activity filter chips (spec §21). */
export function activityCategory(action: string): 'connections' | 'security' | 'cost' | 'configuration' | 'resources' | 'accounts' {
  const a = String(action ?? '').toLowerCase();
  if (a.includes('connect') || a.includes('sync') || a.includes('credential') || a.includes('validat')) return 'connections';
  if (a.includes('security') || a.includes('finding') || a.includes('vuln') || a.includes('permission')) return 'security';
  if (a.includes('cost') || a.includes('budget') || a.includes('spend')) return 'cost';
  if (a.includes('discover') || a.includes('resource') || a.includes('scan')) return 'resources';
  if (a.includes('account') || a.includes('project') || a.includes('subscription') || a.includes('import')) return 'accounts';
  return 'configuration';
}
