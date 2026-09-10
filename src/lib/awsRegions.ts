/**
 * AWS regions, grouped by partition.
 *
 * WHY THIS FILE EXISTS
 *
 * The same 17-region list was hardcoded in three components
 * (ConnectAwsAccountWizard, EditAccountModal, FilterBar) with no `cn-*` or
 * `us-gov-*` entries at all — AWS-P1-01. Three copies is three chances to
 * drift, and the omission meant a customer in China or GovCloud could not
 * select their own regions in the connect wizard.
 *
 * WHAT THIS DOES AND DOES NOT FIX
 *
 * The SCAN path was never limited by this list: the connector reads
 * `cloud_connections.scan_regions` and independently confirms a connection's
 * real enabled regions via `ec2:DescribeRegions` at connect time, including
 * opt-in regions. So this was a picker-completeness gap, not data loss — and
 * saying so matters, because "17 hardcoded regions" reads like the scanner
 * was blind to the rest, and it was not.
 *
 * PARTITIONS ARE NOT INTERCHANGEABLE
 *
 * Credentials are issued within one partition. A commercial (`aws`) access
 * key cannot call a `cn-north-1` endpoint, and vice versa. Listing every
 * region in one flat dropdown would therefore offer choices that are
 * guaranteed to fail — so regions are grouped, and the caller narrows to the
 * partition the connection actually belongs to.
 */

export type AwsPartition = 'aws' | 'aws-cn' | 'aws-us-gov';

export interface AwsRegionGroup {
  partition: AwsPartition;
  label: string;
  /** Shown when a customer might not know whether this applies to them. */
  note?: string;
  regions: readonly string[];
}

export const AWS_REGION_GROUPS: readonly AwsRegionGroup[] = [
  {
    partition: 'aws',
    label: 'Commercial (aws)',
    regions: [
      'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
      'ca-central-1', 'sa-east-1',
      'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-north-1', 'eu-south-1',
      'ap-south-1', 'ap-southeast-1', 'ap-southeast-2', 'ap-southeast-3',
      'ap-northeast-1', 'ap-northeast-2', 'ap-northeast-3',
      'me-south-1', 'af-south-1', 'il-central-1',
    ],
  },
  {
    partition: 'aws-cn',
    label: 'China (aws-cn)',
    note: 'Requires credentials issued in the AWS China partition, which are separate from your commercial account.',
    regions: ['cn-north-1', 'cn-northwest-1'],
  },
  {
    partition: 'aws-us-gov',
    label: 'GovCloud (aws-us-gov)',
    note: 'Requires AWS GovCloud (US) credentials, which are separate from your commercial account.',
    regions: ['us-gov-west-1', 'us-gov-east-1'],
  },
];

/**
 * The partition a region belongs to, by AWS's own naming convention.
 *
 * Mirrors `partitionForRegion` in horizonvigil-connector-aws/src/lib/lineage.ts.
 * The two are deliberately the same rule so the picker cannot offer something
 * the admission pipeline would quarantine as INVALID_PARTITION.
 */
export function partitionForRegion(region: string): AwsPartition {
  if (region.startsWith('cn-')) return 'aws-cn';
  if (region.startsWith('us-gov-')) return 'aws-us-gov';
  return 'aws';
}

/**
 * Regions selectable for a connection, given a region it is already known to
 * use (usually `default_region`).
 *
 * Narrowing to one partition is the point: offering a GovCloud region to a
 * commercial connection is offering a choice that cannot work.
 */
export function regionsForPartitionOf(knownRegion: string | null | undefined): readonly string[] {
  const partition = knownRegion ? partitionForRegion(knownRegion) : 'aws';
  return AWS_REGION_GROUPS.find((g) => g.partition === partition)?.regions ?? [];
}

/**
 * Every region, flat. For filters, where the user is narrowing data that has
 * already been collected rather than choosing what to collect — there, a
 * region from any partition is a legitimate thing to filter on.
 */
export const ALL_AWS_REGIONS: readonly string[] = AWS_REGION_GROUPS.flatMap((g) => g.regions);

/**
 * The commercial default, matching what a new connection gets today.
 *
 * Deliberately not ALL_AWS_REGIONS: defaulting a new connection to scan
 * GovCloud and China would produce failing calls on every scan for the
 * overwhelming majority of customers, and a wall of permission errors is its
 * own kind of false signal.
 */
export const DEFAULT_SCAN_REGIONS: readonly string[] =
  AWS_REGION_GROUPS.find((g) => g.partition === 'aws')!.regions;
