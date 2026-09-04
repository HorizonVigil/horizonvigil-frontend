import { describe, it, expect } from 'vitest';
import type { Budget, CostAnomaly, CostRecommendation, CostSnapshot } from '../api';
import type { UnifiedAccountRow } from '../unifiedAccounts';
import {
  aggregateDaily,
  costByCloudBars,
  costByAccountBars,
  recordToBars,
  summarizeBudgets,
  optimizationByCategory,
  anomalySeverity,
  sortAnomalies,
  periodOverPeriod,
} from './overview';

function conn(id: string, provider: 'aws' | 'azure' | 'gcp', identifier: string, name = id): UnifiedAccountRow {
  return {
    id, provider, name, identifier, environment: 'production', status: 'connected', errorMessage: null,
    connectionMethod: 'access_key', connectionMethodLabel: 'Access key', region: 'us-east-1', resources: 0, lastSync: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    raw: {} as any,
  };
}

function snapshot(date: string, cost: number): CostSnapshot {
  return { id: `${date}-${cost}`, connection_id: 'c1', account_id: 'a1', usage_date: date, service: 'EC2', region: 'us-east-1', unblended_cost: String(cost), usage_quantity: null, usage_unit: null, currency: 'USD' };
}

function budget(over: Partial<Budget> = {}): Budget {
  return { id: 'b1', org_id: 'o1', scope_type: 'org', scope_id: 'o1', name: 'Org budget', monthly_limit: 1000, alert_thresholds: [80], created_at: '', currentSpend: 500, projectedSpend: 900, forecastMethod: 'linear', percentOfLimit: 50, status: 'ok', ...over };
}

function rec(over: Partial<CostRecommendation> = {}): CostRecommendation {
  return { id: 'r1', connection_id: 'c1', resource_id: null, category: 'idle', issue: 'x', recommended_action: 'y', potential_monthly_savings: 10, priority: 'low', status: 'open', created_at: '', external_key: null, excluded_reason: null, excluded_justification: null, excluded_by: null, excluded_at: null, excluded_until: null, assigned_to: null, last_notified_at: null, last_notified_by: null, ...over };
}

function anomaly(over: Partial<CostAnomaly> = {}): CostAnomaly {
  return { id: 'an1', connection_id: 'c1', service: 'EC2', detected_at: '', usage_date: '2026-09-01', expected_cost: 100, actual_cost: 150, percent_change: 50, dollar_impact: 50, status: 'open', created_at: '', ...over };
}

describe('aggregateDaily', () => {
  it('sums cost per usage_date and sorts ascending', () => {
    const result = aggregateDaily([snapshot('2026-09-02', 10), snapshot('2026-09-01', 5), snapshot('2026-09-01', 3)]);
    expect(result).toEqual([{ date: '2026-09-01', cost: 8 }, { date: '2026-09-02', cost: 10 }]);
  });

  it('returns [] for no rows', () => {
    expect(aggregateDaily([])).toEqual([]);
  });
});

describe('costByCloudBars', () => {
  const connections = [conn('c-aws', 'aws', '111111111111'), conn('c-azure', 'azure', 'sub-1')];

  it('groups by resolved provider, matching either id or identifier', () => {
    const bars = costByCloudBars({ '111111111111': 100, 'sub-1': 40 }, connections);
    expect(bars).toEqual([{ label: 'AWS', value: 100 }, { label: 'Azure', value: 40 }]);
  });

  it('drops keys that resolve to no known connection', () => {
    const bars = costByCloudBars({ 'unknown-account': 999, '111111111111': 50 }, connections);
    expect(bars).toEqual([{ label: 'AWS', value: 50 }]);
  });

  it('sums multiple accounts under the same provider', () => {
    const multi = [conn('c1', 'aws', 'a1'), conn('c2', 'aws', 'a2')];
    const bars = costByCloudBars({ a1: 30, a2: 20 }, multi);
    expect(bars).toEqual([{ label: 'AWS', value: 50 }]);
  });
});

describe('costByAccountBars', () => {
  it('resolves display names and sorts descending, capped at limit', () => {
    const connections = [conn('c1', 'aws', 'a1', 'Production'), conn('c2', 'aws', 'a2', 'Staging')];
    const bars = costByAccountBars({ a1: 50, a2: 200 }, connections, 1);
    expect(bars).toEqual([{ label: 'Staging', value: 200 }]);
  });

  it('falls back to the raw key when no connection matches', () => {
    const bars = costByAccountBars({ 'ghost-account': 10 }, []);
    expect(bars).toEqual([{ label: 'ghost-account', value: 10 }]);
  });
});

describe('recordToBars', () => {
  it('handles null/undefined input', () => {
    expect(recordToBars(null)).toEqual([]);
    expect(recordToBars(undefined)).toEqual([]);
  });
});

describe('summarizeBudgets', () => {
  it('returns a zeroed rollup for no budgets', () => {
    expect(summarizeBudgets([])).toMatchObject({ count: 0, usedPercent: null, worst: null });
  });

  it('sums limits/spend/forecast and reports the worst status', () => {
    const rollup = summarizeBudgets([budget({ monthly_limit: 100, currentSpend: 50, status: 'ok' }), budget({ id: 'b2', monthly_limit: 200, currentSpend: 220, status: 'exceeded' })]);
    expect(rollup.totalLimit).toBe(300);
    expect(rollup.totalSpend).toBe(270);
    expect(rollup.usedPercent).toBe(90);
    expect(rollup.worst).toBe('exceeded');
    expect(rollup.exceededCount).toBe(1);
  });
});

describe('optimizationByCategory', () => {
  it('sums potential savings per category with a friendly label', () => {
    const bars = optimizationByCategory([rec({ category: 'idle', potential_monthly_savings: 18 }), rec({ category: 'rightsizing', potential_monthly_savings: 24 }), rec({ category: 'idle', potential_monthly_savings: 5 })]);
    expect(bars).toEqual([{ label: 'Rightsizing', value: 24 }, { label: 'Idle Resources', value: 23 }]);
  });

  it('falls back to a de-slugged label for an unmapped category', () => {
    const bars = optimizationByCategory([rec({ category: 'unattached_ip', potential_monthly_savings: 5 })]);
    expect(bars).toEqual([{ label: 'unattached ip', value: 5 }]);
  });
});

describe('anomalySeverity', () => {
  it('is critical at or above 50% change, warning below', () => {
    expect(anomalySeverity(50)).toBe('critical');
    expect(anomalySeverity(75)).toBe('critical');
    expect(anomalySeverity(49)).toBe('warning');
  });
});

describe('sortAnomalies', () => {
  it('sorts by dollar impact descending', () => {
    const sorted = sortAnomalies([anomaly({ id: 'a', dollar_impact: 10 }), anomaly({ id: 'b', dollar_impact: 90 }), anomaly({ id: 'c', dollar_impact: 40 })]);
    expect(sorted.map((a) => a.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('periodOverPeriod', () => {
  it('splits the series at the midpoint and computes % change', () => {
    const daily = [{ date: '1', cost: 10 }, { date: '2', cost: 10 }, { date: '3', cost: 20 }, { date: '4', cost: 20 }];
    const r = periodOverPeriod(daily);
    expect(r.previous).toBe(20);
    expect(r.current).toBe(40);
    expect(r.changePercent).toBe(100);
  });

  it('handles fewer than 2 points without dividing by zero', () => {
    expect(periodOverPeriod([])).toEqual({ current: 0, previous: 0, changePercent: null });
    expect(periodOverPeriod([{ date: '1', cost: 5 }])).toEqual({ current: 5, previous: 0, changePercent: null });
  });
});
