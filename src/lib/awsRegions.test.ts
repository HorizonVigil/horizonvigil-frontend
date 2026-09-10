import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AWS_REGION_GROUPS, ALL_AWS_REGIONS, DEFAULT_SCAN_REGIONS,
  partitionForRegion, regionsForPartitionOf,
} from './awsRegions';

describe('partitions', () => {
  it('maps regions to partitions by AWS naming convention', () => {
    expect(partitionForRegion('us-east-1')).toBe('aws');
    expect(partitionForRegion('ap-south-1')).toBe('aws');
    expect(partitionForRegion('cn-north-1')).toBe('aws-cn');
    expect(partitionForRegion('us-gov-west-1')).toBe('aws-us-gov');
  });

  it('agrees with the connector admission rule', () => {
    /**
     * The picker must not be able to offer something the Phase 2 admission
     * pipeline would quarantine as INVALID_PARTITION. Both use the same
     * prefix rule; this pins the shapes that matter.
     */
    expect(partitionForRegion('us-gov-east-1')).toBe('aws-us-gov');
    expect(partitionForRegion('cn-northwest-1')).toBe('aws-cn');
  });

  it('narrows to one partition, because credentials cannot cross them', () => {
    // A commercial key cannot reach cn-north-1; offering it is offering a
    // choice guaranteed to fail on every scan.
    const commercial = regionsForPartitionOf('us-east-1');
    expect(commercial).toContain('eu-west-1');
    expect(commercial).not.toContain('cn-north-1');
    expect(commercial).not.toContain('us-gov-west-1');

    const gov = regionsForPartitionOf('us-gov-west-1');
    expect(gov).toContain('us-gov-east-1');
    expect(gov).not.toContain('us-east-1');
  });

  it('defaults to commercial when the partition is unknown', () => {
    expect(regionsForPartitionOf(null)).toContain('us-east-1');
    expect(regionsForPartitionOf(undefined)).toContain('us-east-1');
  });
});

describe('the gap this closes (AWS-P1-01)', () => {
  it('now includes China and GovCloud regions, which were absent entirely', () => {
    expect(ALL_AWS_REGIONS).toContain('cn-north-1');
    expect(ALL_AWS_REGIONS).toContain('us-gov-west-1');
  });

  it('includes the commercial regions the old 17-entry list omitted', () => {
    for (const r of ['eu-south-1', 'ap-southeast-3', 'me-south-1', 'af-south-1', 'il-central-1']) {
      expect(ALL_AWS_REGIONS, r).toContain(r);
    }
  });

  it('does NOT default a new connection to scan other partitions', () => {
    /**
     * Defaulting to every region would produce permission errors on every
     * scan for the overwhelming majority of customers, and a wall of those
     * is its own false signal about account health.
     */
    expect(DEFAULT_SCAN_REGIONS).not.toContain('cn-north-1');
    expect(DEFAULT_SCAN_REGIONS).not.toContain('us-gov-west-1');
    expect(DEFAULT_SCAN_REGIONS.length).toBeGreaterThan(15);
  });

  it('labels the partitions that need separate credentials', () => {
    for (const g of AWS_REGION_GROUPS.filter((x) => x.partition !== 'aws')) {
      expect(g.note, g.partition).toMatch(/separate from your commercial account/);
    }
  });
});

describe('the three duplicated copies are gone', () => {
  /**
   * The same list was hardcoded in three components with no cn-/us-gov-
   * entries. Three copies is three chances to drift — which had already
   * happened once, per FilterBar's own comment about omitting ap-south-1.
   */
  const read = (p: string) => readFileSync(join(__dirname, '..', 'components', p), 'utf8');

  it('no component declares its own region array', () => {
    for (const f of ['ConnectAwsAccountWizard.tsx', 'EditAccountModal.tsx', 'FilterBar.tsx']) {
      const src = read(f);
      expect(src, f).not.toMatch(/const REGIONS = \[\s*\n\s*'us-east-1'/);
      expect(src, f).toContain("from '../lib/awsRegions'");
    }
  });

  it('the connect wizard groups the dropdown by partition', () => {
    const src = read('ConnectAwsAccountWizard.tsx');
    expect(src).toContain('optgroup');
    expect(src).toContain('selectableRegions');
  });

  it('the edit modal keeps a saved region that is not in the list', () => {
    // An opt-in region AWS added after this shipped must not silently vanish
    // from a connection already using it.
    const src = read('EditAccountModal.tsx');
    expect(src).toContain('regionOptions.includes(region) ? regionOptions : [region, ...regionOptions]');
  });
});
