/**
 * AWS region catalogue grouped by AWS partition.
 *
 * This module is the single client-side source of truth for region selection.
 *
 * IMPORTANT BOUNDARIES
 * - This catalogue controls UI selection/filtering only.
 * - The scanner's actual enabled-region discovery remains authoritative.
 * - AWS partitions are isolated. A credential issued for one partition must
 *   not be offered regions from another partition.
 * - Do not duplicate region arrays in individual components.
 *
 * The current catalogue intentionally separates:
 *   aws          → commercial
 *   aws-cn       → China
 *   aws-us-gov   → GovCloud (US)
 */
export type AwsPartition = 'aws' | 'aws-cn' | 'aws-us-gov';

export interface AwsRegionGroup {
  partition: AwsPartition;
  label: string;
  /** Optional customer-facing guidance shown with the partition. */
  note?: string;
  regions: readonly string[];
}

/**
 * Central partition/region catalogue.
 *
 * `as const` is intentionally avoided here so the exported interface remains
 * straightforward for consumers while the runtime assertions below validate
 * the data once at module load.
 */
export const AWS_REGION_GROUPS: readonly AwsRegionGroup[] = [
  {
    partition: 'aws',
    label: 'Commercial (aws)',
    regions: [
      'us-east-1',
      'us-east-2',
      'us-west-1',
      'us-west-2',
      'ca-central-1',
      'sa-east-1',
      'eu-west-1',
      'eu-west-2',
      'eu-west-3',
      'eu-central-1',
      'eu-north-1',
      'eu-south-1',
      'ap-south-1',
      'ap-southeast-1',
      'ap-southeast-2',
      'ap-southeast-3',
      'ap-northeast-1',
      'ap-northeast-2',
      'ap-northeast-3',
      'me-south-1',
      'af-south-1',
      'il-central-1',
    ],
  },
  {
    partition: 'aws-cn',
    label: 'China (aws-cn)',
    note:
      'Requires credentials issued in the AWS China partition, which are separate from your commercial account.',
    regions: [
      'cn-north-1',
      'cn-northwest-1',
    ],
  },
  {
    partition: 'aws-us-gov',
    label: 'GovCloud (aws-us-gov)',
    note:
      'Requires AWS GovCloud (US) credentials, which are separate from your commercial account.',
    regions: [
      'us-gov-west-1',
      'us-gov-east-1',
    ],
  },
];

const VALID_PARTITIONS: readonly AwsPartition[] = [
  'aws',
  'aws-cn',
  'aws-us-gov',
];

const REGION_PARTITION_PREFIXES: ReadonlyArray<{
  prefix: string;
  partition: AwsPartition;
}> = [
  { prefix: 'cn-', partition: 'aws-cn' },
  { prefix: 'us-gov-', partition: 'aws-us-gov' },
];

/**
 * Normalize a region value before partition resolution.
 *
 * Region names are case-sensitive identifiers in provider APIs; normalization
 * here is only for safe UI/input handling. Callers should continue sending
 * the canonical stored region string to backend APIs.
 */
function normalizeRegionInput(region: string | null | undefined): string {
  return typeof region === 'string' ? region.trim().toLowerCase() : '';
}

/**
 * The partition a region belongs to.
 *
 * This mirrors the prefix rule used by the connector admission logic.
 * Unknown region names intentionally fall back to the commercial partition
 * because the historical/default connection flow is commercial-first.
 *
 * Do not treat this function as an authoritative validator that a region
 * actually exists. Catalogue membership must be checked separately.
 */
export function partitionForRegion(
  region: string | null | undefined,
): AwsPartition {
  const normalized = normalizeRegionInput(region);

  if (!normalized) {
    return 'aws';
  }

  for (const rule of REGION_PARTITION_PREFIXES) {
    if (normalized.startsWith(rule.prefix)) {
      return rule.partition;
    }
  }

  return 'aws';
}

/**
 * Return all selectable regions belonging to the partition represented by a
 * known connection region.
 *
 * A missing/unknown region defaults to the commercial partition.
 */
export function regionsForPartitionOf(
  knownRegion: string | null | undefined,
): readonly string[] {
  const partition = partitionForRegion(knownRegion);

  return (
    AWS_REGION_GROUPS.find(
      (group) => group.partition === partition,
    )?.regions ?? []
  );
}

/**
 * Flat catalogue used by filters, reporting, and other read-only selectors.
 *
 * It is intentionally broader than DEFAULT_SCAN_REGIONS because selecting a
 * region in a filter does not authorize or trigger collection in that region.
 */
export const ALL_AWS_REGIONS: readonly string[] =
  Object.freeze(
    AWS_REGION_GROUPS.flatMap((group) => group.regions),
  );

/**
 * Default regions for a newly created commercial connection.
 *
 * Deliberately excludes China and GovCloud so a typical commercial
 * connection does not start with guaranteed cross-partition authorization
 * failures.
 */
export const DEFAULT_SCAN_REGIONS: readonly string[] =
  Object.freeze(
    [...(
      AWS_REGION_GROUPS.find(
        (group) => group.partition === 'aws',
      )?.regions ?? []
    )],
  );

/**
 * Fast membership lookup for consumers that need to validate a region against
 * the catalogue.
 */
const ALL_AWS_REGION_SET: ReadonlySet<string> = new Set(
  ALL_AWS_REGIONS,
);

/**
 * Return whether the supplied value is a known region in this client
 * catalogue.
 */
export function isKnownAwsRegion(
  region: string | null | undefined,
): region is string {
  const normalized = normalizeRegionInput(region);
  return normalized.length > 0 && ALL_AWS_REGION_SET.has(normalized);
}

/**
 * Return the canonical catalogue entry for a region, or undefined when this
 * client version does not know the region yet.
 */
export function getAwsRegionGroup(
  region: string | null | undefined,
): AwsRegionGroup | undefined {
  const normalized = normalizeRegionInput(region);

  if (!normalized) return undefined;

  return AWS_REGION_GROUPS.find((group) =>
    group.regions.includes(normalized),
  );
}

/**
 * Validate the static catalogue once at module load.
 *
 * This catches accidental duplicate regions, invalid partition labels, and
 * region/partition mismatches during development/tests rather than producing
 * subtle UI drift.
 */
function assertAwsRegionCatalogue(): void {
  const seenRegions = new Set<string>();

  for (const group of AWS_REGION_GROUPS) {
    if (!VALID_PARTITIONS.includes(group.partition)) {
      throw new Error(
        `Invalid AWS partition "${String(group.partition)}" in region catalogue`,
      );
    }

    if (!group.label.trim()) {
      throw new Error(
        `AWS region group "${group.partition}" has an empty label`,
      );
    }

    if (group.regions.length === 0) {
      throw new Error(
        `AWS region group "${group.partition}" contains no regions`,
      );
    }

    for (const region of group.regions) {
      const normalized = normalizeRegionInput(region);

      if (normalized !== region) {
        throw new Error(
          `AWS region "${region}" must be stored in canonical lowercase form`,
        );
      }

      if (seenRegions.has(normalized)) {
        throw new Error(
          `AWS region "${normalized}" appears more than once in the catalogue`,
        );
      }

      seenRegions.add(normalized);

      const resolvedPartition = partitionForRegion(normalized);

      if (resolvedPartition !== group.partition) {
        throw new Error(
          `AWS region "${normalized}" is assigned to "${group.partition}" but resolves to "${resolvedPartition}"`,
        );
      }
    }
  }

  if (new Set(ALL_AWS_REGIONS).size !== ALL_AWS_REGIONS.length) {
    throw new Error('ALL_AWS_REGIONS contains duplicate entries');
  }

  const commercialRegions = regionsForPartitionOf('us-east-1');

  for (const region of DEFAULT_SCAN_REGIONS) {
    if (!commercialRegions.includes(region)) {
      throw new Error(
        `DEFAULT_SCAN_REGIONS contains a non-commercial region "${region}"`,
      );
    }
  }
}

assertAwsRegionCatalogue();
