import { describe, expect, it } from 'vitest';
import {
  LEAST_PRIVILEGE_POLICY,
  CUR_S3_READ_POLICY_STATEMENT,
} from './leastPrivilegePolicy';

interface IamStatement {
  Sid?: string;
  Effect: string;
  Action: string[];
  Resource?: string | string[];
  [key: string]: unknown;
}

interface IamPolicyDocument {
  Version: string;
  Statement: IamStatement[];
  [key: string]: unknown;
}

function parsePolicy(
  value: string,
  label: string,
): IamPolicyDocument {
  let parsed: unknown;

  expect(() => {
    parsed = JSON.parse(value);
  }, `${label} must be valid JSON`).not.toThrow();

  expect(
    parsed,
    `${label} must parse to an object`,
  ).toBeTruthy();

  const policy = parsed as Partial<IamPolicyDocument>;

  expect(
    policy.Version,
    `${label} must declare an IAM policy version`,
  ).toBe('2012-10-17');

  expect(
    Array.isArray(policy.Statement),
    `${label}.Statement must be an array`,
  ).toBe(true);

  return policy as IamPolicyDocument;
}

function allActions(policy: IamPolicyDocument): string[] {
  return policy.Statement.flatMap((statement) => statement.Action);
}

function statementsWithAction(
  policy: IamPolicyDocument,
  action: string,
): IamStatement[] {
  return policy.Statement.filter((statement) =>
    statement.Action.includes(action),
  );
}

function resourceList(statement: IamStatement): string[] {
  if (Array.isArray(statement.Resource)) {
    return statement.Resource;
  }

  return typeof statement.Resource === 'string'
    ? [statement.Resource]
    : [];
}

describe('LEAST_PRIVILEGE_POLICY — document integrity', () => {
  it('is valid JSON', () => {
    expect(() =>
      parsePolicy(
        LEAST_PRIVILEGE_POLICY,
        'LEAST_PRIVILEGE_POLICY',
      ),
    ).not.toThrow();
  });

  it('is a valid-shaped IAM policy document', () => {
    const policy = parsePolicy(
      LEAST_PRIVILEGE_POLICY,
      'LEAST_PRIVILEGE_POLICY',
    );

    expect(policy.Version).toBe('2012-10-17');
    expect(Array.isArray(policy.Statement)).toBe(true);
    expect(policy.Statement.length).toBeGreaterThan(0);

    for (const statement of policy.Statement) {
      expect(statement.Effect).toBe('Allow');
      expect(typeof statement.Sid).toBe('string');
      expect(statement.Sid?.trim().length).toBeGreaterThan(0);
      expect(Array.isArray(statement.Action)).toBe(true);
      expect(statement.Action.length).toBeGreaterThan(0);
    }
  });

  it('contains unique statement SIDs', () => {
    const policy = parsePolicy(
      LEAST_PRIVILEGE_POLICY,
      'LEAST_PRIVILEGE_POLICY',
    );

    const sids = policy.Statement.map((statement) => statement.Sid);

    expect(sids.every((sid) => typeof sid === 'string')).toBe(true);
    expect(new Set(sids).size).toBe(sids.length);
  });

  /**
   * Object content access is deliberately excluded from the base role.
   * CUR object access is isolated in CUR_S3_READ_POLICY_STATEMENT instead.
   */
  it('never grants s3:GetObject or wildcard s3:Get* in the base policy', () => {
    const policy = parsePolicy(
      LEAST_PRIVILEGE_POLICY,
      'LEAST_PRIVILEGE_POLICY',
    );

    const actions = allActions(policy);

    expect(actions).not.toContain('s3:GetObject');
    expect(actions).not.toContain('s3:Get*');
  });

  it('does not contain an S3 resource grant in the base policy', () => {
    const policy = parsePolicy(
      LEAST_PRIVILEGE_POLICY,
      'LEAST_PRIVILEGE_POLICY',
    );

    for (const statement of policy.Statement) {
      const resources = resourceList(statement);

      if (statement.Resource === '*') {
        continue;
      }

      expect(
        Array.isArray(statement.Resource),
        `${statement.Sid ?? 'unnamed statement'} must use an ARN array when narrowed`,
      ).toBe(true);

      for (const resource of resources) {
        expect(
          resource,
          `${statement.Sid ?? 'unnamed statement'} must contain an ARN`,
        ).toMatch(/^arn:aws:/);

        expect(
          resource,
          'The base policy must not carry an S3-specific resource grant',
        ).not.toMatch(/^arn:aws:s3:/);
      }
    }
  });

  it('has no empty actions or empty narrowed resource arrays', () => {
    const policy = parsePolicy(
      LEAST_PRIVILEGE_POLICY,
      'LEAST_PRIVILEGE_POLICY',
    );

    for (const statement of policy.Statement) {
      expect(statement.Action.length).toBeGreaterThan(0);

      if (Array.isArray(statement.Resource)) {
        expect(statement.Resource.length).toBeGreaterThan(0);
        expect(
          statement.Resource.every(
            (resource) =>
              typeof resource === 'string' &&
              resource.trim().length > 0,
          ),
        ).toBe(true);
      }
    }
  });
});

describe('CUR_S3_READ_POLICY_STATEMENT — isolated object access', () => {
  it('is valid JSON and has a scoped resource', () => {
    let statement: unknown;

    expect(() => {
      statement = JSON.parse(CUR_S3_READ_POLICY_STATEMENT);
    }).not.toThrow();

    expect(statement).toBeTruthy();

    const parsed = statement as {
      Effect?: unknown;
      Action?: unknown;
      Resource?: unknown;
      Sid?: unknown;
    };

    expect(parsed.Effect).toBe('Allow');
    expect(typeof parsed.Sid).toBe('string');
    expect(Array.isArray(parsed.Action)).toBe(true);
    expect(
      (parsed.Action as string[]).length,
    ).toBeGreaterThan(0);

    expect(parsed.Action).toContain('s3:GetObject');
    expect(parsed.Resource).not.toBe('*');
  });

  it('scopes s3:GetObject to the documented placeholder CUR bucket', () => {
    const statement = JSON.parse(
      CUR_S3_READ_POLICY_STATEMENT,
    ) as {
      Action: string[];
      Resource: string | string[];
    };

    const resources = Array.isArray(statement.Resource)
      ? statement.Resource
      : [statement.Resource];

    expect(resources.length).toBeGreaterThan(0);

    for (const resource of resources) {
      expect(resource).toMatch(
        /^arn:aws:s3:::[^*]+\/?\*?$/,
      );
      expect(resource).toContain(
        'YOUR-CUR-BUCKET-NAME',
      );
    }
  });

  it('does not grant wildcard S3 object access', () => {
    const statement = JSON.parse(
      CUR_S3_READ_POLICY_STATEMENT,
    ) as {
      Action: string[];
      Resource: string | string[];
    };

    const resources = Array.isArray(statement.Resource)
      ? statement.Resource
      : [statement.Resource];

    expect(resources).not.toContain('*');
  });
});

/**
 * Acceptance condition 12:
 * collection roles must not obtain credentials, secret values, or mutation
 * capabilities.
 *
 * These assertions intentionally cover classes of dangerous permissions,
 * rather than pinning the test to only the original redshift credential bug.
 */
describe('collection role — credential and secret-content boundaries', () => {
  const policy = parsePolicy(
    LEAST_PRIVILEGE_POLICY,
    'LEAST_PRIVILEGE_POLICY',
  );

  const actions = allActions(policy);

  it('grants no known credential-producing action', () => {
    const credentialProducingActions = [
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
    ];

    for (const action of credentialProducingActions) {
      expect(
        actions,
        `${action} must not be granted by the collection role`,
      ).not.toContain(action);
    }
  });

  it('grants no known secret-bearing content retrieval action', () => {
    const secretBearingActions = [
      'ec2:GetConsoleOutput',
      'logs:Get*',
      'logs:GetLogEvents',
      'codebuild:BatchGet*',
      'secretsmanager:Get*',
    ];

    for (const action of secretBearingActions) {
      expect(
        actions,
        `${action} must not be granted by the collection role`,
      ).not.toContain(action);
    }
  });

  it('grants no mutating permission', () => {
    /**
     * The collection role is intended for discovery/read operations.
     * GenerateCredentialReport is deliberately handled by the explicit
     * exception test below, rather than being silently accepted as a mutation.
     */
    const mutatingActions = actions.filter((action) =>
      /:(Create|Delete|Update|Put|Modify|Terminate|Stop|Start|Reboot|Attach|Detach|Associate|Disassociate|Revoke|Authorize|Run|Invoke|Execute|Restore|Reset|Enable|Disable|Register|Deregister|Tag|Untag)/i.test(
        action,
      ),
    );

    expect(mutatingActions).toEqual([
      // Intentionally empty: any newly introduced mutation requires an
      // explicit policy/test review rather than silently expanding access.
    ]);
  });

  it('does not allow credential-producing wildcard action families', () => {
    const dangerousPrefixes = [
      'secretsmanager:Get',
      'ssm:GetParameter',
      'sts:Assume',
      'iam:CreateAccessKey',
      'ecr:GetAuthorizationToken',
      'redshift:GetClusterCredentials',
      'rds-db:connect',
    ];

    for (const action of actions) {
      for (const prefix of dangerousPrefixes) {
        expect(
          action.startsWith(prefix),
          `${action} overlaps forbidden credential-producing prefix ${prefix}`,
        ).toBe(false);
      }
    }
  });

  it('scopes apigateway:GET away from /apikeys', () => {
    const statements = statementsWithAction(
      policy,
      'apigateway:GET',
    );

    expect(
      statements.length,
      'apigateway:GET statement not found',
    ).toBeGreaterThan(0);

    for (const statement of statements) {
      expect(
        statement.Resource,
        `${statement.Sid ?? 'apigateway statement'} must not use Resource "*"`,
      ).not.toBe('*');

      const resources = resourceList(statement);

      expect(resources.length).toBeGreaterThan(0);
      expect(
        JSON.stringify(resources).toLowerCase(),
      ).not.toContain('apikeys');

      for (const arn of resources) {
        expect(arn).toMatch(/\/(restapis|apis)(\/|$)/);
      }
    }
  });

  it('keeps the two explicitly permitted job-producing reads', () => {
    expect(actions).toContain(
      'iam:GenerateCredentialReport',
    );

    expect(actions).toContain(
      'logs:FilterLogEvents',
    );

    expect(actions).not.toContain(
      'iam:GenerateServiceLastAccessedDetails',
    );
  });
});
