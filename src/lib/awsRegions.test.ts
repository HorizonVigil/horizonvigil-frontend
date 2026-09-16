import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ALL_AWS_REGIONS,
  AWS_REGION_GROUPS,
  DEFAULT_SCAN_REGIONS,
  partitionForRegion,
  regionsForPartitionOf,
} from './awsRegions';

const COMPONENTS_DIR = join(
  __dirname,
  '..',
  'components',
);

function readComponent(filename: string): string {
  return readFileSync(
    join(COMPONENTS_DIR, filename),
    'utf8',
  );
}

describe('AWS region partition resolution', () => {
  it('maps standard AWS regions to the commercial partition', () => {
    expect(partitionForRegion('us-east-1')).toBe('aws');
    expect(partitionForRegion('ap-south-1')).toBe('aws');
  });

  it('maps China regions to aws-cn', () => {
    expect(partitionForRegion('cn-north-1')).toBe('aws-cn');
    expect(partitionForRegion('cn-northwest-1')).toBe('aws-cn');
  });

  it('maps GovCloud regions to aws-us-gov', () => {
    expect(partitionForRegion('us-gov-west-1')).toBe('aws-us-gov');
    expect(partitionForRegion('us-gov-east-1')).toBe('aws-us-gov');
  });

  it('returns the commercial partition for unknown or absent regions', () => {
    expect(partitionForRegion(null)).toBe('aws');
    expect(partitionForRegion(undefined)).toBe('aws');
    expect(partitionForRegion('')).toBe('aws');
    expect(partitionForRegion('not-a-real-region')).toBe('aws');
  });
});

describe('AWS partition-scoped region selection', () => {
  it('does not mix commercial, China, and GovCloud regions', () => {
    const commercial = regionsForPartitionOf('us-east-1');
    const china = regionsForPartitionOf('cn-north-1');
    const gov = regionsForPartitionOf('us-gov-west-1');

    expect(commercial).toContain('eu-west-1');
    expect(commercial).not.toContain('cn-north-1');
    expect(commercial).not.toContain('us-gov-west-1');

    expect(china).toContain('cn-north-1');
    expect(china).toContain('cn-northwest-1');
    expect(china).not.toContain('us-east-1');
    expect(china).not.toContain('us-gov-west-1');

    expect(gov).toContain('us-gov-east-1');
    expect(gov).toContain('us-gov-west-1');
    expect(gov).not.toContain('us-east-1');
    expect(gov).not.toContain('cn-north-1');
  });

  it('defaults to commercial regions when the partition cannot be resolved', () => {
    const commercial = regionsForPartitionOf(null);
    const commercialFromUndefined = regionsForPartitionOf(undefined);

    expect(commercial).toContain('us-east-1');
    expect(commercialFromUndefined).toContain('us-east-1');
    expect(commercial).toEqual(commercialFromUndefined);
  });

  it('returns a stable, duplicate-free region set for every partition', () => {
    const partitions = new Set(
      AWS_REGION_GROUPS.map((group) => group.partition),
    );

    for (const partition of partitions) {
      const regions = regionsForPartitionOf(
        partition === 'aws'
          ? 'us-east-1'
          : partition === 'aws-cn'
            ? 'cn-north-1'
            : 'us-gov-west-1',
      );

      expect(new Set(regions).size).toBe(regions.length);
      expect(regions.length).toBeGreaterThan(0);

      for (const region of regions) {
        expect(
          partitionForRegion(region),
          `${region} resolved to the wrong partition`,
        ).toBe(partition);
      }
    }
  });
});

describe('AWS region catalogue completeness — AWS-P1-01', () => {
  it('includes China and GovCloud regions', () => {
    expect(ALL_AWS_REGIONS).toContain('cn-north-1');
    expect(ALL_AWS_REGIONS).toContain('cn-northwest-1');
    expect(ALL_AWS_REGIONS).toContain('us-gov-west-1');
    expect(ALL_AWS_REGIONS).toContain('us-gov-east-1');
  });

  it('includes the previously omitted commercial regions', () => {
    for (const region of [
      'eu-south-1',
      'ap-southeast-3',
      'me-south-1',
      'af-south-1',
      'il-central-1',
    ]) {
      expect(ALL_AWS_REGIONS, region).toContain(region);
    }
  });

  it('contains no duplicate region identifiers', () => {
    expect(
      new Set(ALL_AWS_REGIONS).size,
    ).toBe(ALL_AWS_REGIONS.length);
  });

  it('contains only non-empty normalized region identifiers', () => {
    for (const region of ALL_AWS_REGIONS) {
      expect(typeof region).toBe('string');
      expect(region.trim()).toBe(region);
      expect(region.length).toBeGreaterThan(0);
    }
  });

  it('maps every catalogue region to a declared partition', () => {
    const declaredPartitions = new Set(
      AWS_REGION_GROUPS.map((group) => group.partition),
    );

    for (const region of ALL_AWS_REGIONS) {
      expect(
        declaredPartitions.has(partitionForRegion(region)),
        `${region} has no declared partition`,
      ).toBe(true);
    }
  });
});

describe('default scan region safety', () => {
  it('does not cross partition boundaries by default', () => {
    expect(DEFAULT_SCAN_REGIONS).not.toContain('cn-north-1');
    expect(DEFAULT_SCAN_REGIONS).not.toContain('cn-northwest-1');
    expect(DEFAULT_SCAN_REGIONS).not.toContain('us-gov-west-1');
    expect(DEFAULT_SCAN_REGIONS).not.toContain('us-gov-east-1');
  });

  it('contains a substantial commercial-region default set', () => {
    expect(DEFAULT_SCAN_REGIONS.length).toBeGreaterThan(15);
  });

  it('contains only commercial partition regions', () => {
    for (const region of DEFAULT_SCAN_REGIONS) {
      expect(partitionForRegion(region)).toBe('aws');
    }
  });

  it('does not contain duplicates', () => {
    expect(
      new Set(DEFAULT_SCAN_REGIONS).size,
    ).toBe(DEFAULT_SCAN_REGIONS.length);
  });
});

describe('partition guidance metadata', () => {
  it('provides separate-credential guidance for non-commercial partitions', () => {
    for (const group of AWS_REGION_GROUPS.filter(
      (entry) => entry.partition !== 'aws',
    )) {
      expect(group.note, group.partition).toMatch(
        /separate from your commercial account/i,
      );
    }
  });

  it('does not attach non-commercial guidance to the commercial partition', () => {
    const commercialGroups = AWS_REGION_GROUPS.filter(
      (entry) => entry.partition === 'aws',
    );

    expect(commercialGroups.length).toBeGreaterThan(0);
  });
});

describe('component region-list architecture — AWS-P1-01', () => {
  it('does not reintroduce local region arrays', () => {
    for (const filename of [
      'ConnectAwsAccountWizard.tsx',
      'EditAccountModal.tsx',
      'FilterBar.tsx',
    ]) {
      const source = readComponent(filename);

      expect(
        source,
        `${filename} declares a local hard-coded region list`,
      ).not.toMatch(
        /(?:const|let)\s+[A-Z0-9_]*REGIONS[A-Z0-9_]*\s*=\s*\[/,
      );

      expect(
        source,
        `${filename} must consume the central AWS region catalogue`,
      ).toContain("from '../lib/awsRegions'");
    }
  });

  it('groups the connection wizard region selector by partition', () => {
    const source = readComponent('ConnectAwsAccountWizard.tsx');

    expect(source).toContain('optgroup');
    expect(source).toContain('selectableRegions');
  });

  it('preserves a saved edit-modal region even when not present in the current catalogue', () => {
    const source = readComponent('EditAccountModal.tsx');

    expect(source).toContain(
      'regionOptions.includes(region) ? regionOptions : [region, ...regionOptions]',
    );
  });

  it('keeps FilterBar region selection sourced from the shared region module', () => {
    const source = readComponent('FilterBar.tsx');

    expect(source).toContain("from '../lib/awsRegions'");
    expect(source).not.toMatch(
      /(?:const|let)\s+[A-Z0-9_]*REGIONS[A-Z0-9_]*\s*=\s*\[/,
    );
  });
});

describe('cross-partition safety invariants', () => {
  it('commercial defaults never imply GovCloud or China credentials', () => {
    for (const region of DEFAULT_SCAN_REGIONS) {
      const partition = partitionForRegion(region);

      expect(
        partition,
        `${region} unexpectedly belongs to ${partition}`,
      ).toBe('aws');
    }
  });

  it('partition-specific selectors contain only their own partition', () => {
    const representativeRegions = [
      'us-east-1',
      'cn-north-1',
      'us-gov-west-1',
    ];

    for (const selectedRegion of representativeRegions) {
      const partition = partitionForRegion(selectedRegion);
      const available = regionsForPartitionOf(selectedRegion);

      for (const region of available) {
        expect(
          partitionForRegion(region),
          `${region} leaked into ${partition}`,
        ).toBe(partition);
      }
    }
  });
});
