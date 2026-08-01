import { describe, it, expect } from 'vitest';
import { LEAST_PRIVILEGE_POLICY, CUR_S3_READ_POLICY_STATEMENT } from './leastPrivilegePolicy';

describe('LEAST_PRIVILEGE_POLICY', () => {
  it('is valid JSON', () => {
    expect(() => JSON.parse(LEAST_PRIVILEGE_POLICY)).not.toThrow();
  });

  it('is a valid-shaped IAM policy document', () => {
    const policy = JSON.parse(LEAST_PRIVILEGE_POLICY);
    expect(policy.Version).toBe('2012-10-17');
    expect(Array.isArray(policy.Statement)).toBe(true);
    expect(policy.Statement.length).toBeGreaterThan(0);
    for (const stmt of policy.Statement) {
      expect(stmt.Effect).toBe('Allow');
      expect(typeof stmt.Sid).toBe('string');
      expect(Array.isArray(stmt.Action)).toBe(true);
    }
  });

  // The doc comment states this explicitly as a security invariant: object
  // *content* access (s3:GetObject) is never granted by the base policy,
  // only in the separate, bucket-scoped CUR statement below. A future edit
  // that casually adds "s3:Get*" or "s3:GetObject" here would silently
  // widen every customer's cross-account role past what they were told
  // they were granting.
  it('never grants s3:GetObject or a wildcard s3:Get* in the base policy', () => {
    const policy = JSON.parse(LEAST_PRIVILEGE_POLICY);
    const allActions = policy.Statement.flatMap((s: { Action: string[] }) => s.Action);
    expect(allActions).not.toContain('s3:GetObject');
    expect(allActions).not.toContain('s3:Get*');
  });

  it('scopes every base-policy statement to Resource: "*" (no accidental bucket-specific grants left over)', () => {
    const policy = JSON.parse(LEAST_PRIVILEGE_POLICY);
    for (const stmt of policy.Statement) {
      expect(stmt.Resource).toBe('*');
    }
  });
});

describe('CUR_S3_READ_POLICY_STATEMENT', () => {
  it('is valid JSON', () => {
    expect(() => JSON.parse(CUR_S3_READ_POLICY_STATEMENT)).not.toThrow();
  });

  it('grants s3:GetObject only scoped to the placeholder CUR bucket, never "*"', () => {
    const stmt = JSON.parse(CUR_S3_READ_POLICY_STATEMENT);
    expect(stmt.Action).toContain('s3:GetObject');
    expect(stmt.Resource).not.toBe('*');
    expect(Array.isArray(stmt.Resource) ? stmt.Resource.every((r: string) => r.includes('YOUR-CUR-BUCKET-NAME')) : false).toBe(true);
  });
});
