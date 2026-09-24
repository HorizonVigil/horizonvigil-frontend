import { describe, expect, it } from 'vitest';

import { groupConnectionIds } from './groupFilter';

type Provider = 'aws' | 'azure' | 'gcp';

interface TestConnection {
  id: string;
  provider: Provider;
  environment: string;
}

function connection(
  id: string,
  provider: Provider,
  environment = 'production',
): TestConnection {
  return {
    id,
    provider,
    environment,
  };
}

const CONNECTIONS: TestConnection[] = [
  connection('c1', 'aws', 'production'),
  connection('c2', 'aws', 'staging'),
  connection('c3', 'azure', 'production'),
];

describe('groupConnectionIds', () => {
  it('returns undefined when no provider or environment filter is active', () => {
    expect(
      groupConnectionIds(
        {
          provider: null,
          environment: 'all',
        },
        CONNECTIONS,
      ),
    ).toBeUndefined();
  });

  it('filters by provider alone', () => {
    expect(
      groupConnectionIds(
        {
          provider: 'aws',
          environment: 'all',
        },
        CONNECTIONS,
      ),
    ).toEqual(['c1', 'c2']);
  });

  it('filters by environment alone', () => {
    expect(
      groupConnectionIds(
        {
          provider: null,
          environment: 'staging',
        },
        CONNECTIONS,
      ),
    ).toEqual(['c2']);
  });

  it('filters by provider and environment together', () => {
    expect(
      groupConnectionIds(
        {
          provider: 'aws',
          environment: 'production',
        },
        CONNECTIONS,
      ),
    ).toEqual(['c1']);
  });

  it('returns an empty array when an active filter matches nothing', () => {
    expect(
      groupConnectionIds(
        {
          provider: 'gcp',
          environment: 'all',
        },
        CONNECTIONS,
      ),
    ).toEqual([]);
  });

  it('returns only exact provider matches', () => {
    expect(
      groupConnectionIds(
        {
          provider: 'azure',
          environment: 'all',
        },
        CONNECTIONS,
      ),
    ).toEqual(['c3']);
  });

  it('returns only exact environment matches', () => {
    expect(
      groupConnectionIds(
        {
          provider: null,
          environment: 'production',
        },
        CONNECTIONS,
      ),
    ).toEqual(['c1', 'c3']);
  });

  it('preserves source connection order', () => {
    const connections = [
      connection('z', 'aws', 'production'),
      connection('a', 'aws', 'production'),
      connection('m', 'aws', 'staging'),
    ];

    expect(
      groupConnectionIds(
        {
          provider: 'aws',
          environment: 'all',
        },
        connections,
      ),
    ).toEqual(['z', 'a', 'm']);
  });

  it('returns an empty array for an active filter against an empty connection list', () => {
    expect(
      groupConnectionIds(
        {
          provider: 'aws',
          environment: 'all',
        },
        [],
      ),
    ).toEqual([]);
  });

  it('returns an empty array when both active filters exclude every connection', () => {
    expect(
      groupConnectionIds(
        {
          provider: 'azure',
          environment: 'staging',
        },
        CONNECTIONS,
      ),
    ).toEqual([]);
  });

  it('does not mutate the input connection array', () => {
    const connections = [
      connection('c2', 'aws', 'staging'),
      connection('c1', 'aws', 'production'),
    ];

    const before = connections.map(
      ({ id, provider, environment }) => ({
        id,
        provider,
        environment,
      }),
    );

    groupConnectionIds(
      {
        provider: 'aws',
        environment: 'all',
      },
      connections,
    );

    expect(connections).toEqual(before);
  });
});
