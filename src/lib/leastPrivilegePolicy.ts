/**
 * AWS collection-role IAM policy.
 *
 * This policy is intended for HorizonVigil discovery/inventory and other
 * read-only collection workflows. It deliberately avoids:
 * - arbitrary S3 object-content access;
 * - secret-value retrieval;
 * - credential minting/exchange;
 * - IAM/resource mutation.
 *
 * IMPORTANT:
 * This is a customer-facing least-privilege baseline, not a guarantee that
 * every future scanner can run without an additional permission. When a new
 * scanner needs access, add the narrowest documented action needed by that
 * scanner and add a regression test for the exact permission boundary.
 *
 * Keep the base role separate from CUR object access. CUR needs an additional
 * bucket-scoped statement and must never be widened to Resource:"*".
 */

export const LEAST_PRIVILEGE_POLICY = `{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ComputeNetworkStorage",
      "Effect": "Allow",
      "Action": [
        "ec2:Describe*",
        "ec2:GetEbsEncryptionByDefault",
        "elasticloadbalancing:Describe*",
        "autoscaling:Describe*",
        "s3:List*",
        "s3:GetBucket*",
        "s3:GetObjectTagging",
        "s3:GetLifecycleConfiguration",
        "s3:GetEncryptionConfiguration",
        "s3:GetBucketPolicyStatus",
        "s3:GetBucketPublicAccessBlock",
        "efs:Describe*",
        "fsx:Describe*",
        "backup:List*",
        "backup:Describe*",
        "backup:Get*",
        "datasync:List*",
        "glacier:ListVaults",
        "storagegateway:List*",
        "storagegateway:Describe*",
        "snowball:ListJobs",
        "drs:DescribeSourceServers",
        "lightsail:Get*",
        "outposts:ListOutposts",
        "apprunner:List*",
        "imagebuilder:List*",
        "workspaces:Describe*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "DatabasesAndCaching",
      "Effect": "Allow",
      "Action": [
        "rds:Describe*",
        "rds:List*",
        "dynamodb:Describe*",
        "dynamodb:List*",
        "elasticache:Describe*",
        "redshift:Describe*",
        "memorydb:Describe*",
        "redshift-serverless:ListWorkgroups",
        "timestream:List*",
        "timestream:Describe*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "AnalyticsAndDataPipelines",
      "Effect": "Allow",
      "Action": [
        "athena:List*",
        "athena:Get*",
        "glue:Get*",
        "glue:List*",
        "kinesis:List*",
        "kinesis:Describe*",
        "kafka:List*",
        "elasticmapreduce:List*",
        "es:List*",
        "es:Describe*",
        "firehose:List*",
        "firehose:Describe*",
        "dms:Describe*",
        "lakeformation:List*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "DevOpsCiCdAndMl",
      "Effect": "Allow",
      "Action": [
        "codebuild:List*",
        "codebuild:BatchGetProjects",
        "codepipeline:List*",
        "cognito-idp:List*",
        "cognito-identity:List*",
        "sagemaker:List*",
        "codecommit:List*",
        "codecommit:BatchGetRepositories",
        "codedeploy:List*",
        "codedeploy:BatchGetApplications",
        "codeartifact:List*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "ContainersAndServerless",
      "Effect": "Allow",
      "Action": [
        "eks:Describe*",
        "eks:List*",
        "ecs:Describe*",
        "ecs:List*",
        "lambda:List*",
        "lambda:Get*",
        "cloudformation:Describe*",
        "cloudformation:List*",
        "cloudformation:Get*",
        "events:List*",
        "events:Describe*",
        "states:List*",
        "states:Describe*",
        "batch:Describe*",
        "elasticbeanstalk:Describe*",
        "appsync:List*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "ApiGatewayInventoryOnly",
      "Effect": "Allow",
      "Action": [
        "apigateway:GET"
      ],
      "Resource": [
        "arn:aws:apigateway:*::/restapis",
        "arn:aws:apigateway:*::/restapis/*",
        "arn:aws:apigateway:*::/apis",
        "arn:aws:apigateway:*::/apis/*"
      ]
    },
    {
      "Sid": "NetworkingEdgeDns",
      "Effect": "Allow",
      "Action": [
        "route53:List*",
        "route53:Get*",
        "cloudfront:List*",
        "cloudfront:Get*",
        "acm:List*",
        "acm:Describe*",
        "wafv2:List*",
        "wafv2:Get*",
        "sqs:List*",
        "sqs:Get*",
        "sns:List*",
        "sns:Get*",
        "directconnect:Describe*",
        "globalaccelerator:ListAccelerators",
        "route53resolver:List*",
        "servicediscovery:List*",
        "appmesh:List*",
        "appmesh:Describe*",
        "ses:List*",
        "mq:List*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "IdentityAndKms",
      "Effect": "Allow",
      "Action": [
        "iam:List*",
        "iam:Get*",
        "iam:GenerateCredentialReport",
        "kms:List*",
        "kms:Describe*",
        "kms:GetKeyPolicy",
        "kms:GetKeyRotationStatus",
        "secretsmanager:List*",
        "secretsmanager:DescribeSecret",
        "organizations:List*",
        "organizations:Describe*",
        "sts:GetCallerIdentity"
      ],
      "Resource": "*"
    },
    {
      "Sid": "SecurityAndCompliance",
      "Effect": "Allow",
      "Action": [
        "securityhub:Get*",
        "securityhub:List*",
        "securityhub:Describe*",
        "guardduty:Get*",
        "guardduty:List*",
        "guardduty:Describe*",
        "inspector2:List*",
        "inspector2:Get*",
        "inspector2:BatchGetAccountStatus",
        "access-analyzer:List*",
        "access-analyzer:Get*",
        "config:Describe*",
        "config:Get*",
        "config:List*",
        "fms:ListPolicies",
        "shield:ListProtections",
        "network-firewall:List*",
        "cloudhsm:DescribeClusters",
        "detective:ListGraphs",
        "acm-pca:List*",
        "macie2:List*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "MonitoringAndOps",
      "Effect": "Allow",
      "Action": [
        "cloudwatch:Describe*",
        "cloudwatch:Get*",
        "cloudwatch:List*",
        "logs:Describe*",
        "logs:FilterLogEvents",
        "cloudtrail:Describe*",
        "cloudtrail:Get*",
        "cloudtrail:List*",
        "cloudtrail:LookupEvents",
        "ssm:Describe*",
        "ssm:List*",
        "ssm:GetInventory",
        "health:Describe*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "CostAndBilling",
      "Effect": "Allow",
      "Action": [
        "ce:Get*",
        "ce:Describe*",
        "budgets:View*",
        "budgets:Describe*",
        "pricing:GetProducts",
        "pricing:DescribeServices",
        "pricing:GetAttributeValues",
        "cur:Describe*",
        "account:GetAccountInformation",
        "account:ListRegions",
        "savingsplans:Describe*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "TrustedAdvisorSupport",
      "Effect": "Allow",
      "Action": [
        "support:Describe*",
        "trustedadvisor:Describe*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "TaggingAndResourceGroups",
      "Effect": "Allow",
      "Action": [
        "tag:GetResources",
        "tag:GetTagKeys",
        "tag:GetTagValues",
        "resource-groups:List*",
        "resource-groups:Get*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "GovernanceAndOptimization",
      "Effect": "Allow",
      "Action": [
        "controltower:ListLandingZones",
        "resiliencehub:ListApps",
        "wellarchitected:ListWorkloads",
        "compute-optimizer:GetEnrollmentStatus",
        "compute-optimizer:GetEC2InstanceRecommendations",
        "servicecatalog:ListPortfolios",
        "servicecatalog:SearchProductsAsAdmin",
        "ram:GetResourceShares",
        "ds:DescribeDirectories",
        "license-manager:List*"
      ],
      "Resource": "*"
    }
  ]
}`;

/**
 * Optional, separate CUR access.
 *
 * The base collection role deliberately does not grant s3:GetObject. Add this
 * statement only when the customer has configured a CUR export with resource
 * IDs and replace YOUR-CUR-BUCKET-NAME with the actual report bucket.
 *
 * This statement intentionally scopes both:
 * - ListBucket to the bucket itself;
 * - GetObject to objects inside that same bucket.
 *
 * Never change either Resource to "*".
 */
export const CUR_S3_READ_POLICY_STATEMENT = `{
  "Sid": "CurResourceCostReadOnly",
  "Effect": "Allow",
  "Action": [
    "s3:GetObject",
    "s3:ListBucket"
  ],
  "Resource": [
    "arn:aws:s3:::YOUR-CUR-BUCKET-NAME",
    "arn:aws:s3:::YOUR-CUR-BUCKET-NAME/*"
  ]
}`;

/**
 * Security invariants for the static policy.
 *
 * These are intentionally executable so tests and local development can
 * validate the baseline without duplicating the policy parsing rules.
 */
export function validateLeastPrivilegePolicy(): {
  valid: boolean;
  violations: string[];
} {
  const violations: string[] = [];

  let policy: {
    Version?: unknown;
    Statement?: Array<{
      Sid?: unknown;
      Effect?: unknown;
      Action?: unknown;
      Resource?: unknown;
    }>;
  };

  try {
    policy = JSON.parse(LEAST_PRIVILEGE_POLICY);
  } catch {
    return {
      valid: false,
      violations: ['LEAST_PRIVILEGE_POLICY is not valid JSON'],
    };
  }

  if (policy.Version !== '2012-10-17') {
    violations.push('IAM policy Version must be 2012-10-17');
  }

  if (!Array.isArray(policy.Statement) || policy.Statement.length === 0) {
    violations.push('IAM policy must contain at least one Statement');
    return {
      valid: violations.length === 0,
      violations,
    };
  }

  const seenSids = new Set<string>();

  const forbiddenExactActions = new Set([
    's3:GetObject',
    's3:Get*',
    'secretsmanager:GetSecretValue',
    'secretsmanager:Get*',
    'sts:AssumeRole',
    'sts:GetSessionToken',
    'sts:GetFederationToken',
    'iam:CreateAccessKey',
    'ecr:GetAuthorizationToken',
    'eks:GetToken',
    'rds-db:connect',
    'redshift:GetClusterCredentials',
    'redshift:GetClusterCredentialsWithIAM',
    'redshift-serverless:GetCredentials',
    'gamelift:GetInstanceAccess',
    'ssm:GetParameterByPath',
    'ec2:GetConsoleOutput',
    'logs:Get*',
    'logs:GetLogEvents',
    'codebuild:BatchGet*',
  ]);

  for (const statement of policy.Statement) {
    const sid =
      typeof statement.Sid === 'string'
        ? statement.Sid
        : '';

    if (!sid) {
      violations.push('Every statement must have a non-empty Sid');
    } else if (seenSids.has(sid)) {
      violations.push(`Duplicate statement Sid: ${sid}`);
    } else {
      seenSids.add(sid);
    }

    if (statement.Effect !== 'Allow') {
      violations.push(
        `${sid || 'unnamed statement'} must have Effect Allow`,
      );
    }

    if (!Array.isArray(statement.Action) || statement.Action.length === 0) {
      violations.push(
        `${sid || 'unnamed statement'} must contain actions`,
      );
      continue;
    }

    for (const action of statement.Action) {
      if (typeof action !== 'string' || !action.trim()) {
        violations.push(
          `${sid || 'unnamed statement'} contains an invalid action`,
        );
        continue;
      }

      if (forbiddenExactActions.has(action)) {
        violations.push(
          `${sid} contains forbidden action ${action}`,
        );
      }

      if (
        /:(Create|Delete|Update|Put|Modify|Terminate|Stop|Start|Reboot|Attach|Detach|Associate|Disassociate|Revoke|Authorize|Run|Invoke|Execute|Restore|Reset|Enable|Disable|Register|Deregister|Tag|Untag)/i.test(
          action,
        )
      ) {
        violations.push(
          `${sid} appears to contain a mutating action: ${action}`,
        );
      }
    }

    if (sid === 'ApiGatewayInventoryOnly') {
      if (statement.Resource === '*') {
        violations.push(
          'ApiGatewayInventoryOnly cannot use Resource "*"',
        );
      }

      const resources = Array.isArray(statement.Resource)
        ? statement.Resource
        : [];

      if (resources.length === 0) {
        violations.push(
          'ApiGatewayInventoryOnly must contain explicit resources',
        );
      }

      for (const resource of resources) {
        if (
          typeof resource !== 'string' ||
          !/^arn:aws:apigateway:/.test(resource) ||
          /apikeys/i.test(resource)
        ) {
          violations.push(
            `ApiGatewayInventoryOnly contains invalid resource: ${String(resource)}`,
          );
        }
      }
    }

    if (
      Array.isArray(statement.Resource) &&
      statement.Resource.some(
        (resource) =>
          typeof resource !== 'string' ||
          !/^arn:aws:/.test(resource),
      )
    ) {
      violations.push(
        `${sid} contains a non-AWS resource ARN`,
      );
    }

    if (
      sid !== 'ApiGatewayInventoryOnly' &&
      Array.isArray(statement.Resource) &&
      statement.Resource.some((resource) =>
        typeof resource === 'string'
          ? resource.startsWith('arn:aws:s3:')
          : false,
      )
    ) {
      violations.push(
        `${sid} must not contain an S3 resource grant`,
      );
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}
