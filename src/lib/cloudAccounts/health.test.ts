import { describe, it, expect } from 'vitest';
import type { CloudAccountHealthRow, HealthState } from '../api';
import { summarizeHealthRows } from './health';

function row(provider: 'aws' | 'azure' | 'gcp', state: HealthState, score = 100): CloudAccountHealthRow {
  return { connectionId: `${provider}-${Math.random()}`, connectionName: 'x', provider, identifier: '1', environment: 'production', score, state, signals: [] };
}

describe('summarizeHealthRows', () => {
  it('returns an all-null/zero summary for an empty list', () => {
    const s = summarizeHealthRows([]);
    expect(s).toMatchObject({ total: 0, healthy: 0, warning: 0, critical: 0, unknown: 0, healthPercent: null, perProvider: [] });
  });

  it('counts each state bucket across providers', () => {
    const s = summarizeHealthRows([
      row('aws', 'healthy'), row('aws', 'healthy'), row('aws', 'critical'),
      row('azure', 'warning'), row('gcp', 'unknown'),
    ]);
    expect(s.total).toBe(5);
    expect(s.healthy).toBe(2);
    expect(s.critical).toBe(1);
    expect(s.warning).toBe(1);
    expect(s.unknown).toBe(1);
  });

  it('computes healthPercent over rated (non-unknown) rows only', () => {
    const s = summarizeHealthRows([row('aws', 'healthy'), row('aws', 'healthy'), row('aws', 'critical'), row('aws', 'unknown')]);
    // 2 healthy / 3 rated = 67%
    expect(s.healthPercent).toBe(67);
  });

  it('emits one perProvider row per provider present, each with its own percent', () => {
    const s = summarizeHealthRows([row('aws', 'healthy'), row('aws', 'critical'), row('gcp', 'healthy')]);
    const aws = s.perProvider.find((p) => p.provider === 'aws')!;
    const gcp = s.perProvider.find((p) => p.provider === 'gcp')!;
    expect(aws).toMatchObject({ total: 2, healthPercent: 50 });
    expect(gcp).toMatchObject({ total: 1, healthPercent: 100 });
    expect(s.perProvider.some((p) => p.provider === 'azure')).toBe(false);
  });
});
