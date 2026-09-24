/**
 * Cloud Accounts → Overview — pure aggregation layer (spec §2, §5–26, §44).
 *
 * This module is deliberately a pure boundary/aggregation layer:
 * - normalizes connector payloads;
 * - derives provider roll-ups and chart rows;
 * - preserves "unknown/unavailable" instead of inventing values;
 * - keeps provider filtering deterministic;
 * - never performs API calls or mutates application state.
 *
 * The connector/API payload remains the source of truth. Where a metric is not
 * actually available, helpers return null/omit the row rather than fabricate a
 * value that looks authoritative.
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

export const PROVIDERS: Provider[] = [
  'aws',
  'azure',
  'gcp',
];

export const PROVIDER_LABEL: Record<
  Provider,
  string
> = {
  aws: 'AWS',
  azure: 'Azure',
  gcp: 'GCP',
};

export const PROVIDER_UNIT: Record<
  Provider,
  string
> = {
  aws: 'accounts',
  azure: 'subscriptions',
  gcp: 'projects',
};

/** GCP has no cost ingestion in this build; Azure cost is best-effort. */
export const PROVIDER_HAS_COST: Record<
  Provider,
  boolean
> = {
  aws: true,
  azure: true,
  gcp: false,
};

export type ProviderDashes =
  Record<Provider, AwsAccountsDashboard>;

export type ProviderHealth =
  Record<
    Provider,
    CloudAccountsHealthResponse | null
  >;

/**
 * A zeroed dashboard used only when a provider fetch fails or when the UI
 * narrows the aggregate to one provider.
 *
 * Do not mutate this object. `narrowToProvider()` clones it for each provider
 * to avoid accidental cross-provider state sharing.
 */
export const EMPTY_DASHBOARD: AwsAccountsDashboard =
  {
    totalAccounts: 0,
    healthyAccounts: 0,
    failedAccounts: 0,
    disconnectedAccounts: 0,
    accountsNeedingAttention: 0,
    resourcesDiscovered: 0,
    regionsCovered: 0,
    lastDiscovery: null,
    nextScheduledDiscovery: null,
    discoverySuccessRate: null,
    accountsNeedingAttentionList: [],
    permissionErrors: 0,
    syncFailures: 0,
    monthlyCost: 0,
    topCostAccounts: [],
    topGrowingAccounts: [],
    openRecommendations: 0,
    potentialMonthlySavings: 0,
    rotationDue: 0,
    recentActivity: [],
    recentAlerts: [],
  };

// ── Boundary normalization ──────────────────────────────────────────────────

function num(value: unknown): number {
  return typeof value === 'number' &&
    Number.isFinite(value)
    ? value
    : 0;
}

function nonNegativeNum(
  value: unknown,
): number {
  return Math.max(0, num(value));
}

function nonNegativeInt(
  value: unknown,
): number {
  return Math.floor(
    nonNegativeNum(value),
  );
}

function percent(
  value: unknown,
): number | null {
  const n = num(value);
  if (!Number.isFinite(n)) {
    return null;
  }
  return Math.min(
    100,
    Math.max(0, n),
  );
}

function arr<T>(
  value: unknown,
): T[] {
  return Array.isArray(value)
    ? (value as T[])
    : [];
}

function rec(
  value: unknown,
): Record<string, number> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return {};
  }

  const output: Record<
    string,
    number
  > = {};

  for (const [
    key,
    rawValue,
  ] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (!key.trim()) {
      continue;
    }

    output[key] = nonNegativeNum(
      rawValue,
    );
  }

  return output;
}

function text(
  value: unknown,
  fallback: string,
): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim();

  return normalized || fallback;
}

function nullableText(
  value: unknown,
): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();

  return normalized || null;
}

function validIsoOrNull(
  value: unknown,
): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  const timestamp = Date.parse(
    normalized,
  );

  return Number.isFinite(timestamp)
    ? normalized
    : null;
}

function cloneEmptyDashboard(): AwsAccountsDashboard {
  return {
    ...EMPTY_DASHBOARD,
    accountsNeedingAttentionList: [],
    topCostAccounts: [],
    topGrowingAccounts: [],
    recentActivity: [],
    recentAlerts: [],
  };
}

/**
 * Merge a raw provider dashboard onto the zeroed shape and coerce every field.
 */
export function normalizeDashboard(
  raw:
    | Partial<AwsAccountsDashboard>
    | null
    | undefined,
): AwsAccountsDashboard {
  const dashboard = raw ?? {};

  return {
    totalAccounts: nonNegativeInt(
      dashboard.totalAccounts,
    ),
    healthyAccounts: nonNegativeInt(
      dashboard.healthyAccounts,
    ),
    failedAccounts: nonNegativeInt(
      dashboard.failedAccounts,
    ),
    disconnectedAccounts:
      nonNegativeInt(
        dashboard.disconnectedAccounts,
      ),
    accountsNeedingAttention:
      nonNegativeInt(
        dashboard.accountsNeedingAttention,
      ),
    resourcesDiscovered:
      nonNegativeInt(
        dashboard.resourcesDiscovered,
      ),
    regionsCovered: nonNegativeInt(
      dashboard.regionsCovered,
    ),
    lastDiscovery: validIsoOrNull(
      dashboard.lastDiscovery,
    ),
    nextScheduledDiscovery:
      validIsoOrNull(
        dashboard.nextScheduledDiscovery,
      ),
    discoverySuccessRate:
      typeof dashboard.discoverySuccessRate ===
        'number'
        ? percent(
            dashboard.discoverySuccessRate,
          )
        : null,
    accountsNeedingAttentionList:
      arr<
        AwsAccountsDashboard['accountsNeedingAttentionList'][number]
      >(
        dashboard.accountsNeedingAttentionList,
      )
        .filter(
          (account) =>
            Boolean(
              account &&
                typeof account ===
                  'object',
            ),
        )
        .map((account) => ({
          connectionId: text(
            account.connectionId,
            '',
          ),
          connectionName: text(
            account.connectionName,
            'Unknown',
          ),
          reason: text(
            account.reason,
            'Needs attention',
          ),
        }))
        .filter(
          (account) =>
            account.connectionId.length >
            0,
        ),
    permissionErrors: nonNegativeInt(
      dashboard.permissionErrors,
    ),
    syncFailures: nonNegativeInt(
      dashboard.syncFailures,
    ),
    monthlyCost: nonNegativeNum(
      dashboard.monthlyCost,
    ),
    topCostAccounts:
      arr(
        dashboard.topCostAccounts,
      ),
    topGrowingAccounts:
      arr(
        dashboard.topGrowingAccounts,
      ),
    openRecommendations:
      nonNegativeInt(
        dashboard.openRecommendations,
      ),
    potentialMonthlySavings:
      nonNegativeNum(
        dashboard.potentialMonthlySavings,
      ),
    rotationDue: nonNegativeInt(
      dashboard.rotationDue,
    ),
    recentActivity:
      arr<
        AwsAccountsDashboard['recentActivity'][number]
      >(
        dashboard.recentActivity,
      )
        .filter(
          (event) =>
            Boolean(
              event &&
                typeof event ===
                  'object',
            ),
        )
        .map((event, index) => ({
          id: text(
            event.id,
            `act-${index}`,
          ),
          action: text(
            event.action,
            'activity',
          ),
          targetId:
            nullableText(
              event.targetId,
            ),
          occurredAt:
            validIsoOrNull(
              event.occurredAt,
            ) ?? '',
          actorEmail:
            nullableText(
              event.actorEmail,
            ),
        })),
    recentAlerts:
      arr(
        dashboard.recentAlerts,
      ),
  };
}

/**
 * Coerce a `/health/detailed` response.
 * Returns null when the payload cannot be identified as a supported provider
 * health response.
 */
export function normalizeHealth(
  raw: unknown,
): CloudAccountsHealthResponse | null {
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw)
  ) {
    return null;
  }

  const response =
    raw as Partial<CloudAccountsHealthResponse>;

  const provider =
    response.provider === 'aws' ||
    response.provider === 'azure' ||
    response.provider === 'gcp'
      ? response.provider
      : null;

  if (!provider) {
    return null;
  }

  const accounts =
    arr<
      CloudAccountsHealthResponse['accounts'][number]
    >(response.accounts)
      .filter(
        (account) =>
          Boolean(
            account &&
              typeof account ===
                'object',
          ),
      )
      .map((account) => ({
        ...account,
        /*
         * A signal is kept only when it carries the two fields every caller
         * reads: `key` and `status`. An "is it an object?" check alone let
         * `{}` through, and a shapeless entry then rendered as a health
         * signal with no key and an undefined status -- an unreadable row
         * that still counted as a signal the account had been assessed on.
         * Dropping it is the honest outcome: it was never a measurement.
         */
        signals: arr<HealthSignal>(
          account.signals,
        ).filter(
          (signal): signal is HealthSignal =>
            Boolean(
              signal &&
                typeof signal === 'object' &&
                typeof (signal as HealthSignal).key ===
                  'string' &&
                typeof (signal as HealthSignal).status ===
                  'string',
            ),
        ),
      }));

  const summary =
    (response.summary ?? {}) as Partial<
      CloudAccountsHealthResponse['summary']
    >;

  const total =
    nonNegativeInt(summary.total);

  const healthy = Math.min(
    nonNegativeInt(summary.healthy),
    total,
  );

  const warning = Math.min(
    nonNegativeInt(summary.warning),
    Math.max(
      0,
      total - healthy,
    ),
  );

  const critical = Math.min(
    nonNegativeInt(summary.critical),
    Math.max(
      0,
      total - healthy - warning,
    ),
  );

  const unknown = Math.min(
    nonNegativeInt(summary.unknown),
    Math.max(
      0,
      total -
        healthy -
        warning -
        critical,
    ),
  );

  return {
    provider,
    accounts,
    summary: {
      total,
      healthy,
      warning,
      critical,
      unknown,
      healthPercent:
        typeof summary.healthPercent ===
        'number'
          ? percent(
              summary.healthPercent,
            )
          : null,
    },
  };
}

/** Coerce the resources dashboard payload into the shape the Overview needs. */
export function normalizeResources(
  raw: unknown,
): ResourcesDashboardLike | null {
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw)
  ) {
    return null;
  }

  const resources =
    raw as Record<
      string,
      unknown
    >;

  return {
    total: nonNegativeInt(
      resources.total,
    ),
    byCategory: rec(
      resources.byCategory,
    ),
    byStatus: rec(
      resources.byStatus,
    ),
    byRegion: rec(
      resources.byRegion,
    ),
    trend30d: arr<{
      date: string;
      created: number;
      deleted: number;
    }>(resources.trend30d)
      .filter(
        (point) =>
          Boolean(
            point &&
              typeof point ===
                'object',
          ),
      )
      .map((point) => ({
        date:
          nullableText(
            point.date,
          ) ?? '',
        created:
          nonNegativeInt(
            point.created,
          ),
        deleted:
          nonNegativeInt(
            point.deleted,
          ),
      })),
  };
}

/**
 * Narrow provider maps to a single provider.
 *
 * Fresh empty dashboard objects are used for inactive providers to prevent a
 * mutation to one provider's nested arrays from affecting another provider.
 */
export function narrowToProvider(
  dashes: ProviderDashes,
  health: ProviderHealth,
  provider: Provider | null,
): {
  dashes: ProviderDashes;
  health: ProviderHealth;
} {
  if (!provider) {
    return {
      dashes,
      health,
    };
  }

  const narrowedDashes: ProviderDashes =
    {
      aws: cloneEmptyDashboard(),
      azure: cloneEmptyDashboard(),
      gcp: cloneEmptyDashboard(),
    };

  const narrowedHealth: ProviderHealth =
    {
      aws: null,
      azure: null,
      gcp: null,
    };

  narrowedDashes[provider] =
    dashes[provider];
  narrowedHealth[provider] =
    health[provider];

  return {
    dashes: narrowedDashes,
    health: narrowedHealth,
  };
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
  perProvider: Record<
    Provider,
    ProviderRollup
  >;
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

function clampNonNeg(
  value: number,
): number {
  return Math.max(0, num(value));
}

function pct(
  part: number,
  whole: number,
): number | null {
  if (
    !Number.isFinite(part) ||
    !Number.isFinite(whole) ||
    whole <= 0
  ) {
    return null;
  }

  return Math.min(
    100,
    Math.max(
      0,
      Math.round(
        (part / whole) *
          100,
      ),
    ),
  );
}

/**
 * One provider's roll-up. Health buckets come from `/health/detailed` when
 * present and usable, otherwise the dashboard's coarse account counts are used.
 */
export function rollupProvider(
  provider: Provider,
  dash: AwsAccountsDashboard,
  health:
    | CloudAccountsHealthResponse
    | null,
): ProviderRollup {
  let healthy = 0;
  let warning = 0;
  let critical = 0;
  let unknown = 0;
  let total = 0;

  if (
    health?.summary &&
    nonNegativeInt(
      health.summary.total,
    ) > 0
  ) {
    total = nonNegativeInt(
      health.summary.total,
    );

    healthy = Math.min(
      nonNegativeInt(
        health.summary.healthy,
      ),
      total,
    );

    warning = Math.min(
      nonNegativeInt(
        health.summary.warning,
      ),
      Math.max(
        0,
        total - healthy,
      ),
    );

    critical = Math.min(
      nonNegativeInt(
        health.summary.critical,
      ),
      Math.max(
        0,
        total -
          healthy -
          warning,
      ),
    );

    unknown = Math.min(
      nonNegativeInt(
        health.summary.unknown,
      ),
      Math.max(
        0,
        total -
          healthy -
          warning -
          critical,
      ),
    );
  } else {
    total = nonNegativeInt(
      dash.totalAccounts,
    );

    healthy = Math.min(
      nonNegativeInt(
        dash.healthyAccounts,
      ),
      total,
    );

    critical = Math.min(
      nonNegativeInt(
        dash.failedAccounts,
      ),
      Math.max(
        0,
        total - healthy,
      ),
    );

    /*
     * The dashboard's disconnected count is not necessarily a disjoint bucket
     * from failed count. Preserve the old intent while preventing negative or
     * impossible values.
     */
    unknown = Math.min(
      clampNonNeg(
        nonNegativeInt(
          dash.disconnectedAccounts,
        ) - critical,
      ),
      Math.max(
        0,
        total - healthy - critical,
      ),
    );

    warning = Math.max(
      0,
      total -
        healthy -
        critical -
        unknown,
    );
  }

  const rated =
    Math.max(
      0,
      total - unknown,
    );

  return {
    provider,
    total,
    healthy,
    warning,
    critical,
    unknown,
    attention: nonNegativeInt(
      dash.accountsNeedingAttention,
    ),
    resources: nonNegativeInt(
      dash.resourcesDiscovered,
    ),
    monthlyCost: nonNegativeNum(
      dash.monthlyCost,
    ),
    hasCost:
      PROVIDER_HAS_COST[provider],
    healthPercent: pct(
      healthy,
      rated,
    ),
  };
}

export function aggregateOverview(
  dashes: ProviderDashes,
  health: ProviderHealth,
): OverviewAggregate {
  const perProvider =
    {} as Record<
      Provider,
      ProviderRollup
    >;

  for (const provider of PROVIDERS) {
    perProvider[provider] =
      rollupProvider(
        provider,
        dashes[provider],
        health[provider],
      );
  }

  const totals =
    PROVIDERS.reduce(
      (accumulator, provider) => {
        const rollup =
          perProvider[provider];

        accumulator.total +=
          rollup.total;

        accumulator.healthy +=
          rollup.healthy;

        accumulator.warning +=
          rollup.warning;

        accumulator.critical +=
          rollup.critical;

        accumulator.unknown +=
          rollup.unknown;

        accumulator.attention +=
          rollup.attention;

        accumulator.resources +=
          rollup.resources;

        accumulator.monthlyCost +=
          rollup.monthlyCost;

        return accumulator;
      },
      {
        total: 0,
        healthy: 0,
        warning: 0,
        critical: 0,
        unknown: 0,
        attention: 0,
        resources: 0,
        monthlyCost: 0,
        healthPercent:
          null as number | null,
      },
    );

  totals.healthPercent = pct(
    totals.healthy,
    Math.max(
      0,
      totals.total -
        totals.unknown,
    ),
  );

  const discoveryDates =
    PROVIDERS.map(
      (provider) =>
        dashes[provider]
          .lastDiscovery,
    ).filter(
      (value): value is string =>
        Boolean(
          value &&
            Number.isFinite(
              Date.parse(value),
            ),
        ),
    );

  const lastDiscovery =
    discoveryDates.reduce<
      string | null
    >(
      (latest, value) => {
        if (!latest) {
          return value;
        }

        return Date.parse(value) >
          Date.parse(latest)
          ? value
          : latest;
      },
      null,
    );

  return {
    perProvider,
    activeProviders:
      PROVIDERS.filter(
        (provider) =>
          perProvider[provider]
            .total > 0,
      ),
    totals,
    lastDiscovery,
  };
}

// ── Cloud health visualisations (spec §9, §10, §25) ──────────────────────────

export function healthDonutSlices(
  totals: OverviewAggregate['totals'],
): DonutSlice[] {
  return [
    {
      label: 'Healthy',
      value: nonNegativeInt(
        totals.healthy,
      ),
      tone: 'good',
    },
    {
      label: 'Warning',
      value: nonNegativeInt(
        totals.warning,
      ),
      tone: 'warning',
    },
    {
      label: 'Critical',
      value: nonNegativeInt(
        totals.critical,
      ),
      tone: 'critical',
    },
    {
      label: 'Unknown',
      value: nonNegativeInt(
        totals.unknown,
      ),
      tone: undefined,
    },
  ].filter(
    (
      slice,
    ): slice is DonutSlice =>
      slice.value > 0,
  );
}

/** One stacked row per active provider — health composition, comparable widths. */
export function providerHealthRows(
  aggregate: OverviewAggregate,
): StackRow[] {
  return aggregate.activeProviders.map(
    (provider) => {
      const rollup =
        aggregate.perProvider[
          provider
        ];

      return {
        label:
          PROVIDER_LABEL[
            provider
          ],
        trailing:
          rollup.healthPercent ===
          null
            ? '—'
            : `${rollup.healthPercent}%`,
        segments: [
          {
            label: 'Healthy',
            value:
              rollup.healthy,
            tone: 'good' as const,
          },
          {
            label: 'Warning',
            value:
              rollup.warning,
            tone: 'warning' as const,
          },
          {
            label: 'Critical',
            value:
              rollup.critical,
            tone: 'critical' as const,
          },
          {
            label: 'Unknown',
            value:
              rollup.unknown,
          },
        ],
      };
    },
  );
}

// ── Discovery & connectivity health (spec §17, adapted to compose data) ──────
//
// Real "Compute/DB/Network %" isn't available from the compose endpoints, so
// this rolls up per-account health signals instead: the share of accounts where
// each signal is `ok`. This remains directly traceable to the connector data.

export interface SignalHealthRow {
  key: HealthSignal['key'];
  label: string;
  okPercent: number | null;
  okCount: number;
  total: number;
}

const SIGNAL_LABEL: Record<
  HealthSignal['key'],
  string
> = {
  connection:
    'Connectivity',
  permissions:
    'Permissions',
  discovery:
    'Discovery',
  sync_freshness:
    'Sync freshness',
  credentials:
    'Credentials',
};

export function signalHealthRows(
  health: ProviderHealth,
): SignalHealthRow[] {
  const counts = new Map<
    HealthSignal['key'],
    {
      ok: number;
      total: number;
    }
  >();

  for (const provider of PROVIDERS) {
    const response =
      health[provider];

    if (!response) {
      continue;
    }

    for (const account of arr<
      CloudAccountsHealthResponse['accounts'][number]
    >(response.accounts)) {
      for (const signal of arr<HealthSignal>(
        account?.signals,
      )) {
        if (
          !signal?.key ||
          !(signal.key in
            SIGNAL_LABEL)
        ) {
          continue;
        }

        const current =
          counts.get(
            signal.key,
          ) ?? {
            ok: 0,
            total: 0,
          };

        current.total += 1;

        if (
          signal.status === 'ok'
        ) {
          current.ok += 1;
        }

        counts.set(
          signal.key,
          current,
        );
      }
    }
  }

  return (
    Object.keys(
      SIGNAL_LABEL,
    ) as HealthSignal['key'][]
  )
    .filter((key) =>
      counts.has(key),
    )
    .map((key) => {
      const current =
        counts.get(key);

      if (!current) {
        return {
          key,
          label:
            SIGNAL_LABEL[key],
          okPercent: null,
          okCount: 0,
          total: 0,
        };
      }

      return {
        key,
        label:
          SIGNAL_LABEL[key],
        okPercent: pct(
          current.ok,
          current.total,
        ),
        okCount:
          current.ok,
        total:
          current.total,
      };
    });
}

// ── Synchronisation health (spec §19) ───────────────────────────────────────

export interface SyncBuckets {
  successful: number;
  failed: number;
  permissionIssues: number;
  total: number;
}

export function syncBuckets(
  aggregate: OverviewAggregate,
  dashes: ProviderDashes,
): SyncBuckets {
  const failed =
    PROVIDERS.reduce(
      (sum, provider) =>
        sum +
        nonNegativeInt(
          dashes[provider]
            ?.syncFailures,
        ),
      0,
    );

  const permissionIssues =
    PROVIDERS.reduce(
      (sum, provider) =>
        sum +
        nonNegativeInt(
          dashes[provider]
            ?.permissionErrors,
        ),
      0,
    );

  const total =
    nonNegativeInt(
      aggregate.totals.total,
    );

  /*
   * Only `successful` is clamped, and only against going negative.
   *
   * The previous version also clamped the two PROBLEM counts against the
   * total, so a provider reporting 10 sync failures and 10 permission errors
   * across 5 accounts was rendered as 5 failures and ZERO permission errors.
   * Ten reported permission errors displayed as none is a reported failure
   * presented as clean -- the exact thing these buckets exist to surface.
   *
   * The counts are not mutually exclusive and are not per-account (one
   * account can fail repeatedly), so they legitimately exceed the account
   * total. The buckets therefore do not sum to `total`, and that is correct:
   * forcing that identity can only be done by discarding a real failure.
   */
  const countedProblems =
    Math.min(
      total,
      failed +
        permissionIssues,
    );

  const successful =
    Math.max(
      0,
      total -
        countedProblems,
    );

  return {
    successful,
    failed,
    permissionIssues,
    total,
  };
}

export function syncStackRow(
  buckets: SyncBuckets,
): StackRow[] {
  return [
    {
      label: 'Synchronization',
      trailing:
        buckets.total > 0
          ? `${buckets.successful}/${buckets.total}`
          : '—',
      segments: [
        {
          label: 'Synced',
          value:
            buckets.successful,
          tone: 'good' as const,
        },
        {
          label:
            'Permission issue',
          value:
            buckets.permissionIssues,
          tone:
            'warning' as const,
        },
        {
          label: 'Failed',
          value:
            buckets.failed,
          tone:
            'critical' as const,
        },
      ],
    },
  ];
}

// ── Resource distribution + growth (spec §11, §12, §13, §23) ─────────────────

export interface ResourcesDashboardLike {
  total: number;
  byCategory: Record<
    string,
    number
  >;
  byStatus: Record<
    string,
    number
  >;
  byRegion: Record<
    string,
    number
  >;
  trend30d: {
    date: string;
    created: number;
    deleted: number;
  }[];
}

export function recordToBars(
  record:
    | Record<string, number>
    | null
    | undefined,
  limit = 8,
): BarDatum[] {
  const safeLimit =
    Number.isFinite(limit)
      ? Math.max(
          0,
          Math.floor(limit),
        )
      : 8;

  return Object.entries(
    record ?? {},
  )
    .map(
      ([label, value]) => ({
        label,
        value: nonNegativeNum(
          value,
        ),
      }),
    )
    .filter(
      (datum) =>
        datum.label.trim().length >
          0 &&
        datum.value > 0,
    )
    .sort(
      (a, b) =>
        b.value - a.value ||
        a.label.localeCompare(
          b.label,
        ),
    )
    .slice(0, safeLimit);
}

/**
 * Cumulative resource count over the trend window, back-calculated so the
 * final point equals the current resource total, when the trend data is usable.
 */
export function resourceGrowthSeries(
  resources: ResourcesDashboardLike,
): {
  x: string;
  y: number;
}[] {
  const trend =
    arr<{
      date: string;
      created: number;
      deleted: number;
    }>(
      resources?.trend30d,
    ).filter(
      (point) =>
        Boolean(
          point &&
            typeof point ===
              'object',
        ),
    );

  if (trend.length === 0) {
    return [];
  }

  const normalizedTrend =
    trend.map(
      (point) => ({
        date:
          nullableText(
            point.date,
          ) ?? '',
        created:
          nonNegativeInt(
            point.created,
          ),
        deleted:
          nonNegativeInt(
            point.deleted,
          ),
      }),
    );

  const net = normalizedTrend.map(
    (point) =>
      point.created -
      point.deleted,
  );

  const totalNet =
    net.reduce(
      (sum, value) =>
        sum + value,
      0,
    );

  let running =
    nonNegativeNum(
      resources.total,
    ) - totalNet;

  return normalizedTrend.map(
    (point, index) => {
      running += net[index];

      return {
        x: point.date,
        y: clampNonNeg(
          running,
        ),
      };
    },
  );
}

// ── Cost (spec §14, §15) ────────────────────────────────────────────────────

export function costByProviderBars(
  aggregate: OverviewAggregate,
): BarDatum[] {
  return PROVIDERS
    .filter(
      (provider) =>
        aggregate.perProvider[
          provider
        ].hasCost &&
        aggregate.perProvider[
          provider
        ].total > 0 &&
        aggregate.perProvider[
          provider
        ].monthlyCost > 0,
    )
    .map((provider) => ({
      label:
        PROVIDER_LABEL[
          provider
        ],
      value:
        nonNegativeNum(
          aggregate.perProvider[
            provider
          ].monthlyCost,
        ),
    }));
}

// ── Attention required (spec §20) ───────────────────────────────────────────

export type AttentionSeverity =
  | 'critical'
  | 'warning';

export interface AttentionItem {
  id: string;
  severity: AttentionSeverity;
  icon: string;
  text: string;
  action: {
    label: string;
    to: string;
  };
}

const STALE_DISCOVERY_DAYS = 7;
const MILLISECONDS_PER_DAY =
  86_400_000;

export interface AttentionInputs {
  security: {
    bySeverity?: Record<
      string,
      number
    >;
    openFindings?: number;
  } | null;
  now?: number;
}

function providerDiscoveryIsStale(
  value: string | null,
  now: number,
): boolean {
  if (!value) {
    return false;
  }

  const timestamp =
    Date.parse(value);

  if (
    !Number.isFinite(timestamp)
  ) {
    return false;
  }

  /*
   * A future timestamp is not stale. This protects against clock skew or a
   * scheduled/discovery timestamp being misread as a completed run.
   */
  if (timestamp > now) {
    return false;
  }

  return (
    now - timestamp >
    STALE_DISCOVERY_DAYS *
      MILLISECONDS_PER_DAY
  );
}

export function buildAttentionItems(
  aggregate: OverviewAggregate,
  dashes: ProviderDashes,
  {
    security,
    now = Date.now(),
  }: AttentionInputs,
): AttentionItem[] {
  const items: AttentionItem[] =
    [];

  const sync =
    syncBuckets(
      aggregate,
      dashes,
    );

  if (sync.failed > 0) {
    items.push({
      id: 'sync-failed',
      severity: 'critical',
      icon: 'refresh-cw',
      text: `${sync.failed} ${
        sync.failed === 1
          ? 'environment'
          : 'environments'
      } failed synchronization`,
      action: {
        label: 'View sync',
        to:
          '/cloud-accounts?tab=Sync+Center',
      },
    });
  }

  if (
    sync.permissionIssues > 0
  ) {
    items.push({
      id: 'perm-issues',
      severity: 'warning',
      icon: 'key',
      text: `${sync.permissionIssues} ${
        sync.permissionIssues === 1
          ? 'environment has'
          : 'environments have'
      } permission issues`,
      action: {
        label: 'Review access',
        to:
          '/cloud-accounts?tab=Access',
      },
    });
  }

  const staleProviders =
    PROVIDERS.filter(
      (provider) =>
        aggregate.perProvider[
          provider
        ].total > 0 &&
        providerDiscoveryIsStale(
          dashes[provider]
            ?.lastDiscovery ??
            null,
          now,
        ),
    );

  if (
    staleProviders.length > 0
  ) {
    items.push({
      id: 'stale',
      severity: 'warning',
      icon: 'clock',
      text: `${staleProviders
        .map(
          (provider) =>
            PROVIDER_LABEL[
              provider
            ],
        )
        .join(
          ', ',
        )} discovery data is more than ${STALE_DISCOVERY_DAYS} days old`,
      action: {
        label: 'Run discovery',
        to:
          '/cloud-accounts?tab=Sync+Center',
      },
    });
  }

  const criticalFindings =
    nonNegativeInt(
      security?.bySeverity
        ?.critical,
    );

  if (criticalFindings > 0) {
    items.push({
      id: 'sec-critical',
      severity: 'critical',
      icon: 'shield-alert',
      text: `${criticalFindings} critical security ${
        criticalFindings === 1
          ? 'finding'
          : 'findings'
      } across cloud resources`,
      action: {
        label: 'Investigate',
        to:
          '/vulnerability-management',
      },
    });
  }

  const rotationDue =
    PROVIDERS.reduce(
      (sum, provider) =>
        sum +
        nonNegativeInt(
          dashes[provider]
            ?.rotationDue,
        ),
      0,
    );

  if (rotationDue > 0) {
    items.push({
      id: 'rotation',
      severity: 'warning',
      icon: 'key',
      text: `${rotationDue} ${
        rotationDue === 1
          ? 'credential is'
          : 'credentials are'
      } due for rotation`,
      action: {
        label: 'Review',
        to:
          '/cloud-accounts?tab=Settings',
      },
    });
  }

  const order: Record<
    AttentionSeverity,
    number
  > = {
    critical: 0,
    warning: 1,
  };

  /*
   * Keep original insertion order for equal severity. Modern JS sort is stable,
   * but the comparator intentionally returns 0 for equal severities.
   */
  return items.sort(
    (left, right) =>
      order[left.severity] -
      order[right.severity],
  );
}

// ── Top problem accounts (spec §26) ─────────────────────────────────────────

export interface ProblemAccount {
  connectionId: string;
  connectionName: string;
  provider: Provider;
  issue: string;
}

export function topProblemAccounts(
  dashes: ProviderDashes,
  limit = 6,
): ProblemAccount[] {
  const safeLimit =
    Number.isFinite(limit)
      ? Math.max(
          0,
          Math.floor(limit),
        )
      : 6;

  if (safeLimit === 0) {
    return [];
  }

  const output: ProblemAccount[] =
    [];

  for (const provider of PROVIDERS) {
    for (const account of arr<
      AwsAccountsDashboard['accountsNeedingAttentionList'][number]
    >(
      dashes[provider]
        ?.accountsNeedingAttentionList,
    )) {
      if (
        !account ||
        typeof account !==
          'object'
      ) {
        continue;
      }

      const connectionId =
        text(
          account.connectionId,
          '',
        );

      if (!connectionId) {
        continue;
      }

      output.push({
        connectionId,
        connectionName:
          text(
            account.connectionName,
            'Unknown',
          ),
        provider,
        issue: text(
          account.reason,
          'Needs attention',
        ),
      });

      if (
        output.length >=
        safeLimit
      ) {
        return output;
      }
    }
  }

  return output;
}

// ── Recent activity timeline (spec §21) ─────────────────────────────────────

export interface TimelineEntry {
  id: string;
  provider: Provider;
  action: string;
  occurredAt: string;
  actorEmail: string | null;
}

export function mergeActivity(
  dashes: ProviderDashes,
  limit = 12,
): TimelineEntry[] {
  const safeLimit =
    Number.isFinite(limit)
      ? Math.max(
          0,
          Math.floor(limit),
        )
      : 12;

  if (safeLimit === 0) {
    return [];
  }

  const all: TimelineEntry[] =
    [];

  for (const provider of PROVIDERS) {
    arr<
      AwsAccountsDashboard['recentActivity'][number]
    >(
      dashes[provider]
        ?.recentActivity,
    ).forEach(
      (event, index) => {
        if (
          !event ||
          typeof event !==
            'object'
        ) {
          return;
        }

        const id = text(
          event.id,
          `i${index}`,
        );

        all.push({
          id: `${provider}-${id}`,
          provider,
          action: text(
            event.action,
            'activity',
          ),
          occurredAt:
            validIsoOrNull(
              event.occurredAt,
            ) ?? '',
          actorEmail:
            nullableText(
              event.actorEmail,
            ),
        });
      },
    );
  }

  return all
    .sort((left, right) => {
      const leftTime =
        left.occurredAt
          ? Date.parse(
              left.occurredAt,
            )
          : Number.NEGATIVE_INFINITY;

      const rightTime =
        right.occurredAt
          ? Date.parse(
              right.occurredAt,
            )
          : Number.NEGATIVE_INFINITY;

      if (
        rightTime !==
        leftTime
      ) {
        return (
          rightTime -
          leftTime
        );
      }

      return left.id.localeCompare(
        right.id,
      );
    })
    .slice(0, safeLimit);
}

/** Coarse category for activity filter chips (spec §21). */
export function activityCategory(
  action: string,
):
  | 'connections'
  | 'security'
  | 'cost'
  | 'configuration'
  | 'resources'
  | 'accounts' {
  const normalized =
    typeof action ===
    'string'
      ? action.toLowerCase()
      : '';

  if (
    normalized.includes(
      'connect',
    ) ||
    normalized.includes(
      'sync',
    ) ||
    normalized.includes(
      'credential',
    ) ||
    normalized.includes(
      'validat',
    )
  ) {
    return 'connections';
  }

  if (
    normalized.includes(
      'security',
    ) ||
    normalized.includes(
      'finding',
    ) ||
    normalized.includes(
      'vuln',
    ) ||
    normalized.includes(
      'permission',
    )
  ) {
    return 'security';
  }

  if (
    normalized.includes('cost') ||
    normalized.includes(
      'budget',
    ) ||
    normalized.includes(
      'spend',
    )
  ) {
    return 'cost';
  }

  if (
    normalized.includes(
      'discover',
    ) ||
    normalized.includes(
      'resource',
    ) ||
    normalized.includes('scan')
  ) {
    return 'resources';
  }

  if (
    normalized.includes(
      'account',
    ) ||
    normalized.includes(
      'project',
    ) ||
    normalized.includes(
      'subscription',
    ) ||
    normalized.includes(
      'import',
    )
  ) {
    return 'accounts';
  }

  return 'configuration';
}
