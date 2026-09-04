import { describe, it, expect } from 'vitest';
import type { AwsAccountsDashboard, CloudAccountsHealthResponse } from '../api';
import {
  aggregateOverview,
  narrowToProvider,
  rollupProvider,
  healthDonutSlices,
  providerHealthRows,
  signalHealthRows,
  syncBuckets,
  buildAttentionItems,
  topProblemAccounts,
  mergeActivity,
  resourceGrowthSeries,
  recordToBars,
  costByProviderBars,
  activityCategory,
  type ProviderDashes,
  type ProviderHealth,
} from './overview';

function dash(over: Partial<AwsAccountsDashboard> = {}): AwsAccountsDashboard {
  return {
    totalAccounts: 0, healthyAccounts: 0, failedAccounts: 0, disconnectedAccounts: 0, accountsNeedingAttention: 0,
    resourcesDiscovered: 0, regionsCovered: 0, lastDiscovery: null, nextScheduledDiscovery: null, discoverySuccessRate: null,
    accountsNeedingAttentionList: [], permissionErrors: 0, syncFailures: 0, monthlyCost: 0, topCostAccounts: [],
    topGrowingAccounts: [], openRecommendations: 0, potentialMonthlySavings: 0, rotationDue: 0, recentActivity: [], recentAlerts: [],
    ...over,
  };
}

function health(
  provider: 'aws' | 'azure' | 'gcp',
  summary: Partial<CloudAccountsHealthResponse['summary']> = {},
  accounts: CloudAccountsHealthResponse['accounts'] = [],
): CloudAccountsHealthResponse {
  const s = { total: 0, healthy: 0, warning: 0, critical: 0, unknown: 0, healthPercent: null as number | null, ...summary };
  return { provider, accounts, summary: s };
}

const noHealth: ProviderHealth = { aws: null, azure: null, gcp: null };

describe('rollupProvider', () => {
  it('prefers /health/detailed buckets when present', () => {
    const r = rollupProvider('aws', dash({ totalAccounts: 10, healthyAccounts: 1 }), health('aws', { total: 10, healthy: 8, warning: 1, critical: 1 }));
    expect(r.healthy).toBe(8);
    expect(r.critical).toBe(1);
    expect(r.healthPercent).toBe(80); // 8 / (10 - 0 unknown)
  });

  it('falls back to dashboard counts when health is null', () => {
    const r = rollupProvider('azure', dash({ totalAccounts: 5, healthyAccounts: 3, failedAccounts: 1, disconnectedAccounts: 1 }), null);
    expect(r.healthy).toBe(3);
    expect(r.critical).toBe(1);
    expect(r.unknown).toBe(0); // disconnected(1) - failed(1)
    expect(r.warning).toBe(1); // 5 - 3 - 1 - 0
  });

  it('marks GCP as having no cost', () => {
    expect(rollupProvider('gcp', dash({ totalAccounts: 1 }), null).hasCost).toBe(false);
    expect(rollupProvider('aws', dash({ totalAccounts: 1 }), null).hasCost).toBe(true);
  });
});

describe('aggregateOverview', () => {
  const dashes: ProviderDashes = {
    aws: dash({ totalAccounts: 820, healthyAccounts: 806, failedAccounts: 4, accountsNeedingAttention: 10, resourcesDiscovered: 40000, monthlyCost: 50000, lastDiscovery: '2026-09-01T00:00:00Z' }),
    azure: dash({ totalAccounts: 312, healthyAccounts: 302, failedAccounts: 2, accountsNeedingAttention: 8, resourcesDiscovered: 12000, monthlyCost: 20000, lastDiscovery: '2026-09-03T00:00:00Z' }),
    gcp: dash({ totalAccounts: 152, healthyAccounts: 139, failedAccounts: 2, accountsNeedingAttention: 11, resourcesDiscovered: 8000, monthlyCost: 0 }),
  };

  it('sums provider totals and picks the newest discovery', () => {
    const agg = aggregateOverview(dashes, noHealth);
    expect(agg.totals.total).toBe(1284);
    expect(agg.totals.resources).toBe(60000);
    expect(agg.totals.monthlyCost).toBe(70000);
    expect(agg.activeProviders).toEqual(['aws', 'azure', 'gcp']);
    expect(agg.lastDiscovery).toBe('2026-09-03T00:00:00Z');
  });

  it('drops providers with zero environments from activeProviders', () => {
    const agg = aggregateOverview({ ...dashes, gcp: dash(), azure: dash() }, noHealth);
    expect(agg.activeProviders).toEqual(['aws']);
  });

  it('computes an overall health percent excluding unknowns', () => {
    const agg = aggregateOverview(
      { aws: dash({ totalAccounts: 100 }), azure: dash(), gcp: dash() },
      { aws: health('aws', { total: 100, healthy: 90, warning: 5, critical: 5, unknown: 0 }), azure: null, gcp: null },
    );
    expect(agg.totals.healthPercent).toBe(90);
  });
});

describe('narrowToProvider', () => {
  const dashes: ProviderDashes = {
    aws: dash({ totalAccounts: 10 }), azure: dash({ totalAccounts: 5 }), gcp: dash({ totalAccounts: 2 }),
  };
  const h: ProviderHealth = { aws: health('aws', { total: 10 }), azure: health('azure', { total: 5 }), gcp: null };

  it('returns the maps unchanged when provider is null', () => {
    expect(narrowToProvider(dashes, h, null).dashes).toBe(dashes);
  });

  it('zeroes every provider except the selected one', () => {
    const n = narrowToProvider(dashes, h, 'azure');
    expect(n.dashes.azure.totalAccounts).toBe(5);
    expect(n.dashes.aws.totalAccounts).toBe(0);
    expect(n.dashes.gcp.totalAccounts).toBe(0);
    expect(n.health.aws).toBeNull();
    expect(n.health.azure).not.toBeNull();
    expect(aggregateOverview(n.dashes, n.health).activeProviders).toEqual(['azure']);
  });
});

describe('healthDonutSlices', () => {
  it('omits empty buckets', () => {
    const slices = healthDonutSlices({ total: 10, healthy: 10, warning: 0, critical: 0, unknown: 0, attention: 0, resources: 0, monthlyCost: 0, healthPercent: 100 });
    expect(slices).toHaveLength(1);
    expect(slices[0].label).toBe('Healthy');
  });
});

describe('providerHealthRows', () => {
  it('emits one comparable row per active provider with a % trailing', () => {
    const agg = aggregateOverview(
      { aws: dash({ totalAccounts: 10 }), azure: dash({ totalAccounts: 4 }), gcp: dash() },
      { aws: health('aws', { total: 10, healthy: 9, warning: 1, healthPercent: 90 }), azure: health('azure', { total: 4, healthy: 4, healthPercent: 100 }), gcp: null },
    );
    const rows = providerHealthRows(agg);
    expect(rows.map((r) => r.label)).toEqual(['AWS', 'Azure']);
    expect(rows[0].trailing).toBe('90%');
    expect(rows[1].trailing).toBe('100%');
  });
});

describe('signalHealthRows', () => {
  it('rolls the per-account signals into an ok-percentage per signal key', () => {
    const mkAcct = (statuses: Record<string, 'ok' | 'warn' | 'fail'>) => ({
      connectionId: `c-${Math.random()}`, connectionName: 'x', provider: 'aws' as const, identifier: '1', environment: 'production',
      score: 80, state: 'healthy' as const,
      signals: Object.entries(statuses).map(([key, status]) => ({ key: key as 'connection', label: key, status: status as 'ok', detail: '', weight: 10 })),
    });
    const resp = health('aws', { total: 2 }, [
      mkAcct({ connection: 'ok', permissions: 'ok' }),
      mkAcct({ connection: 'ok', permissions: 'fail' }),
    ]);
    const rows = signalHealthRows({ aws: resp, azure: null, gcp: null });
    const conn = rows.find((r) => r.key === 'connection')!;
    const perms = rows.find((r) => r.key === 'permissions')!;
    expect(conn.okPercent).toBe(100);
    expect(perms.okPercent).toBe(50);
  });
});

describe('syncBuckets', () => {
  it('splits total into synced / failed / permission issues without going negative', () => {
    const dashes: ProviderDashes = {
      aws: dash({ totalAccounts: 100, syncFailures: 8, permissionErrors: 12 }),
      azure: dash(), gcp: dash(),
    };
    const agg = aggregateOverview(dashes, noHealth);
    const b = syncBuckets(agg, dashes);
    expect(b).toEqual({ successful: 80, failed: 8, permissionIssues: 12, total: 100 });
  });
});

describe('buildAttentionItems', () => {
  const base: ProviderDashes = { aws: dash(), azure: dash(), gcp: dash() };

  it('is empty when nothing is wrong', () => {
    const agg = aggregateOverview(base, noHealth);
    expect(buildAttentionItems(agg, base, { security: null })).toEqual([]);
  });

  it('orders critical before warning and includes sync + permission + security items', () => {
    const dashes: ProviderDashes = {
      aws: dash({ totalAccounts: 50, syncFailures: 3, permissionErrors: 5, rotationDue: 2 }),
      azure: dash(), gcp: dash(),
    };
    const agg = aggregateOverview(dashes, noHealth);
    const items = buildAttentionItems(agg, dashes, { security: { bySeverity: { critical: 4 } } });
    expect(items[0].severity).toBe('critical');
    expect(items.map((i) => i.id)).toEqual(expect.arrayContaining(['sync-failed', 'perm-issues', 'sec-critical', 'rotation']));
    // criticals first
    const firstWarningIdx = items.findIndex((i) => i.severity === 'warning');
    const lastCriticalIdx = [...items].map((i) => i.severity).lastIndexOf('critical');
    expect(lastCriticalIdx).toBeLessThan(firstWarningIdx);
  });

  it('flags stale discovery older than 7 days', () => {
    const now = new Date('2026-09-20T00:00:00Z').getTime();
    const dashes: ProviderDashes = {
      aws: dash({ totalAccounts: 10, lastDiscovery: '2026-09-01T00:00:00Z' }),
      azure: dash(), gcp: dash(),
    };
    const agg = aggregateOverview(dashes, noHealth);
    const items = buildAttentionItems(agg, dashes, { security: null, now });
    expect(items.some((i) => i.id === 'stale')).toBe(true);
  });
});

describe('topProblemAccounts', () => {
  it('flattens the per-provider attention lists and caps the count', () => {
    const dashes: ProviderDashes = {
      aws: dash({ accountsNeedingAttentionList: [{ connectionId: 'a', connectionName: 'Prod-07', reason: 'Permission' }] }),
      azure: dash({ accountsNeedingAttentionList: [{ connectionId: 'b', connectionName: 'Pay-02', reason: 'Sync failed' }] }),
      gcp: dash(),
    };
    const rows = topProblemAccounts(dashes, 1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ connectionId: 'a', provider: 'aws', issue: 'Permission' });
  });
});

describe('mergeActivity', () => {
  it('merges + sorts newest-first across providers', () => {
    const dashes: ProviderDashes = {
      aws: dash({ recentActivity: [{ id: '1', action: 'aws_account.synced', targetId: null, occurredAt: '2026-09-01T10:00:00Z', actorEmail: null }] }),
      azure: dash({ recentActivity: [{ id: '2', action: 'azure_account.discovered', targetId: null, occurredAt: '2026-09-02T10:00:00Z', actorEmail: null }] }),
      gcp: dash(),
    };
    const t = mergeActivity(dashes);
    expect(t.map((e) => e.id)).toEqual(['azure-2', 'aws-1']);
  });
});

describe('resourceGrowthSeries', () => {
  it('back-calculates a cumulative series that ends at total', () => {
    const series = resourceGrowthSeries({
      total: 100, byCategory: {}, byStatus: {}, byRegion: {},
      trend30d: [
        { date: '2026-09-01', created: 6, deleted: 1 },
        { date: '2026-09-02', created: 5, deleted: 0 },
        { date: '2026-09-03', created: 7, deleted: 2 },
      ],
    });
    // net = [+5, +5, +5], total 100 -> baseline 85 -> 90, 95, 100
    expect(series.map((p) => p.y)).toEqual([90, 95, 100]);
  });
});

describe('recordToBars', () => {
  it('sorts desc, drops zeros, caps length', () => {
    const bars = recordToBars({ Compute: 40, Storage: 20, Empty: 0, Network: 10 }, 2);
    expect(bars).toEqual([{ label: 'Compute', value: 40 }, { label: 'Storage', value: 20 }]);
  });
});

describe('costByProviderBars', () => {
  it('excludes providers with no cost support or no environments', () => {
    const agg = aggregateOverview(
      { aws: dash({ totalAccounts: 5, monthlyCost: 100 }), azure: dash({ totalAccounts: 2, monthlyCost: 50 }), gcp: dash({ totalAccounts: 3, monthlyCost: 0 }) },
      noHealth,
    );
    expect(costByProviderBars(agg)).toEqual([{ label: 'AWS', value: 100 }, { label: 'Azure', value: 50 }]);
  });
});

describe('activityCategory', () => {
  it('classifies common actions', () => {
    expect(activityCategory('aws_connection.synced')).toBe('connections');
    expect(activityCategory('security.finding_opened')).toBe('security');
    expect(activityCategory('cost.budget_exceeded')).toBe('cost');
    expect(activityCategory('gcp_project.bulk_imported')).toBe('accounts');
    expect(activityCategory('resource.discovered')).toBe('resources');
    expect(activityCategory('something.else')).toBe('configuration');
  });
});
