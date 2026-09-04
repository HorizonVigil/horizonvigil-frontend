import { describe, it, expect } from 'vitest';
import { groupConnectionIds, filterByGroup } from './groupFilter';

function conn(id: string, provider: 'aws' | 'azure' | 'gcp', environment = 'production') {
  return { id, provider, environment };
}

describe('groupConnectionIds', () => {
  const connections = [
    conn('c1', 'aws', 'production'),
    conn('c2', 'aws', 'staging'),
    conn('c3', 'azure', 'production'),
  ];

  it('returns undefined when neither provider nor environment is filtered', () => {
    expect(groupConnectionIds({ provider: null, environment: 'all' }, connections)).toBeUndefined();
  });

  it('filters by provider alone', () => {
    expect(groupConnectionIds({ provider: 'aws', environment: 'all' }, connections)).toEqual(['c1', 'c2']);
  });

  it('filters by environment alone', () => {
    expect(groupConnectionIds({ provider: null, environment: 'staging' }, connections)).toEqual(['c2']);
  });

  it('filters by both provider and environment together', () => {
    expect(groupConnectionIds({ provider: 'aws', environment: 'production' }, connections)).toEqual(['c1']);
  });

  it('returns [] when nothing matches, not undefined (still an active filter)', () => {
    expect(groupConnectionIds({ provider: 'gcp', environment: 'all' }, connections)).toEqual([]);
  });
});

describe('filterByGroup', () => {
  const rows = [{ connection_id: 'c1', v: 1 }, { connection_id: 'c2', v: 2 }, { connection_id: 'c3', v: 3 }];

  it('is a no-op when connectionIds is undefined', () => {
    expect(filterByGroup(rows, undefined)).toBe(rows);
  });

  it('keeps only rows whose connection_id is in the list', () => {
    expect(filterByGroup(rows, ['c1', 'c3'])).toEqual([{ connection_id: 'c1', v: 1 }, { connection_id: 'c3', v: 3 }]);
  });

  it('returns [] when the filter matches no connections at all', () => {
    expect(filterByGroup(rows, [])).toEqual([]);
  });
});
