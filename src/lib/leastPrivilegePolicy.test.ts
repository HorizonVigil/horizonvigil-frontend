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

  /**
   * Rewritten: this used to assert EVERY statement was `Resource: "*"`.
   *
   * That encoded the old, broader policy as a requirement, so narrowing
   * `apigateway:GET` away from `/apikeys` failed a test whose stated purpose
   * was catching accidental over-grants. A rule that blocks a permission
   * being tightened is measuring the wrong thing.
   *
   * The real invariant is the one the original comment was reaching for: no
   * leftover bucket-specific S3 grant in the base policy, and any statement
   * that IS narrowed must be narrowed deliberately, not half-scoped.
   */
  it('keeps object-store access out of the base policy and allows deliberate narrowing', () => {
    const policy = JSON.parse(LEAST_PRIVILEGE_POLICY);
    for (const stmt of policy.Statement) {
      if (stmt.Resource === '*') continue;
      // A narrowed statement must list real ARNs, never a bare bucket.
      expect(Array.isArray(stmt.Resource), `${stmt.Sid} must list ARNs`).toBe(true);
      for (const arn of stmt.Resource) {
        expect(arn).toMatch(/^arn:aws:/);
        expect(arn, 'the base policy must not carry an S3 grant').not.toMatch(/^arn:aws:s3:/);
      }
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

/**
 * Acceptance condition 12: "Collection roles contain no execution or
 * credential-producing permission."
 *
 * The audit named `redshift:GetClusterCredentials` — an action that mints
 * temporary database credentials, sitting inside a policy the wizard
 * describes to customers as hardened, least-privilege and read-only. It had
 * been flagged three times before it was removed, which is the argument for
 * pinning it in a test rather than in a comment.
 *
 * Auditing all 177 actions found it was not alone. These assertions cover
 * the whole class, not the one instance, because the next person adding a
 * service will reach for `service:Get*` and a wildcard is how every one of
 * these got in.
 */
describe('the collection role cannot obtain credentials or secret content', () => {
  const actions: string[] = JSON.parse(LEAST_PRIVILEGE_POLICY).Statement
    .flatMap((s: { Action: string[] }) => s.Action);

  it('grants no credential-producing action', () => {
    // Each of these RETURNS a usable credential, not metadata about one.
    for (const action of [
      'redshift:GetClusterCredentials',
      'redshift:GetClusterCredentialsWithIAM',
      'redshift-serverless:GetCredentials',
      'rds-db:connect',
      'secretsmanager:GetSecretValue',
      'ssm:GetParameter',
      'ssm:GetParameters',
      'sts:AssumeRole',
      'sts:GetSessionToken',
      'sts:GetFederationToken',
      'iam:CreateAccessKey',
      'ecr:GetAuthorizationToken',
      'eks:GetToken',
      'gamelift:GetInstanceAccess',
    ]) {
      expect(actions, `${action} is credential-producing`).not.toContain(action);
    }
  });

  it('grants no action that returns secret-bearing content', () => {
    // ec2:GetConsoleOutput returns boot logs, which routinely carry secrets.
    // logs:Get* matches GetLogEvents — raw application log lines.
    // codebuild:BatchGet* matches BatchGetBuilds — build logs and env vars.
    for (const action of ['ec2:GetConsoleOutput', 'logs:Get*', 'logs:GetLogEvents', 'codebuild:BatchGet*', 'secretsmanager:Get*']) {
      expect(actions, `${action} exposes secret-bearing content`).not.toContain(action);
    }
  });

  it('grants no mutating action', () => {
    // Nothing may create, modify or delete. GenerateCredentialReport is the
    // one deliberate exception and is asserted separately below.
    const mutating = actions.filter((a) =>
      /:(Create|Delete|Update|Put|Modify|Terminate|Stop|Start|Reboot|Attach|Detach|Associate|Disassociate|Revoke|Authorize|Run|Invoke|Execute|Restore|Reset|Enable|Disable|Register|Deregister|Tag|Untag)/.test(a));
    expect(mutating).toEqual([]);
  });

  it('scopes apigateway:GET away from /apikeys', () => {
    // `apigateway:GET` on "*" includes GET /apikeys, which returns API key
    // VALUES. The scanner only ever requests /restapis and /v2/apis.
    const policy = JSON.parse(LEAST_PRIVILEGE_POLICY);
    const stmt = policy.Statement.find((s: { Action: string[] }) => s.Action.includes('apigateway:GET'));
    expect(stmt, 'apigateway:GET statement not found').toBeTruthy();
    expect(stmt.Resource, 'apigateway:GET must not be granted on *').not.toBe('*');
    expect(JSON.stringify(stmt.Resource)).not.toContain('apikeys');
    for (const arn of stmt.Resource) expect(arn).toMatch(/\/(restapis|apis)/);
  });

  it('keeps the two job-producing reads, and only those, with a stated reason', () => {
    // The build prompt permits these "with rationale" — IAM will not return
    // a credential report until one is generated, and the on-demand log
    // viewer is a real, per-resource product feature. Named explicitly so
    // neither hides inside a wildcard.
    expect(actions).toContain('iam:GenerateCredentialReport');
    expect(actions).toContain('logs:FilterLogEvents');
    expect(actions).not.toContain('iam:GenerateServiceLastAccessedDetails');
  });
});
