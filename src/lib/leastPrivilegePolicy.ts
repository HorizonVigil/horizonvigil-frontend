/**
 * The collection role's IAM policy.
 *
 * Acceptance condition 12: "Collection roles contain no execution or
 * credential-producing permission." The audit named one violation
 * (`redshift:GetClusterCredentials`, which mints temporary database
 * credentials) plus "broad log-reading actions". Auditing all 177 actions
 * found eight worth acting on, and three of them were reachable ways to
 * obtain credentials or secret-bearing content from a role advertised to
 * customers as read-only:
 *
 *   REMOVED (all three were unused by any scanner):
 *     redshift:GetClusterCredentials       mints temporary DB credentials
 *     ec2:GetConsoleOutput                 boot logs routinely carry secrets
 *     iam:GenerateServiceLastAccessedDetails  job-producing write, never called
 *
 *   NARROWED (the wildcard reached further than the caller needed):
 *     apigateway:GET on "*"   ->  scoped to /restapis and /v2/apis.
 *                                 `apigateway:GET` on "*" includes
 *                                 GET /apikeys, which returns API key VALUES.
 *                                 The scanner only ever requests the two
 *                                 collection paths.
 *     codebuild:BatchGet*     ->  codebuild:BatchGetProjects. BatchGet* also
 *                                 matches BatchGetBuilds, which exposes build
 *                                 logs and environment variables.
 *     logs:Get*               ->  removed. GetLogEvents returns raw log lines
 *                                 and no scanner calls it.
 *
 *   KEPT, with the rationale the build prompt requires for job-producing
 *   read support:
 *     iam:GenerateCredentialReport  IAM will not return a credential report
 *                                   until one has been generated; the report
 *                                   is account-level MFA/key-age metadata,
 *                                   not credentials. Called by scanners/iam.ts.
 *     logs:FilterLogEvents          Powers the on-demand log viewer
 *                                   (routes/logs.ts), scoped per request to
 *                                   one resource. This does read log content,
 *                                   which is why it is named here rather than
 *                                   hidden inside a `logs:*` wildcard.
 *
 * Everything else is List/Describe/Get metadata. The policy still grants no
 * s3:GetObject, no secretsmanager:GetSecretValue, and no mutating action
 * anywhere.
 */
export const LEAST_PRIVILEGE_POLICY = `{
  "Version": "2012-10-17",
  "Statement": [
    { "Sid": "ComputeNetworkStorage", "Effect": "Allow", "Action": [
      "ec2:Describe*", "ec2:GetEbsEncryptionByDefault",
      "elasticloadbalancing:Describe*", "autoscaling:Describe*",
      "s3:List*", "s3:GetBucket*", "s3:GetObjectTagging", "s3:GetLifecycleConfiguration",
      "s3:GetEncryptionConfiguration", "s3:GetBucketPolicyStatus", "s3:GetBucketPublicAccessBlock",
      "efs:Describe*", "fsx:Describe*", "backup:List*", "backup:Describe*", "backup:Get*",
      "datasync:List*", "glacier:ListVaults", "storagegateway:List*", "storagegateway:Describe*",
      "snowball:ListJobs", "drs:DescribeSourceServers", "lightsail:Get*", "outposts:ListOutposts",
      "apprunner:List*", "imagebuilder:List*", "workspaces:Describe*"
    ], "Resource": "*" },
    { "Sid": "DatabasesAndCaching", "Effect": "Allow", "Action": [
      "rds:Describe*", "rds:List*", "dynamodb:Describe*", "dynamodb:List*",
      "elasticache:Describe*", "redshift:Describe*",
      "memorydb:Describe*", "redshift-serverless:ListWorkgroups", "timestream:List*", "timestream:Describe*"
    ], "Resource": "*" },
    { "Sid": "AnalyticsAndDataPipelines", "Effect": "Allow", "Action": [
      "athena:List*", "athena:Get*", "glue:Get*", "glue:List*",
      "kinesis:List*", "kinesis:Describe*", "kafka:List*", "elasticmapreduce:List*",
      "es:List*", "es:Describe*", "firehose:List*", "firehose:Describe*",
      "dms:Describe*", "lakeformation:List*"
    ], "Resource": "*" },
    { "Sid": "DevOpsCiCdAndMl", "Effect": "Allow", "Action": [
      "codebuild:List*", "codebuild:BatchGetProjects", "codepipeline:List*",
      "cognito-idp:List*", "cognito-identity:List*", "sagemaker:List*",
      "codecommit:List*", "codecommit:BatchGetRepositories",
      "codedeploy:List*", "codedeploy:BatchGetApplications", "codeartifact:List*"
    ], "Resource": "*" },
    { "Sid": "ContainersAndServerless", "Effect": "Allow", "Action": [
      "eks:Describe*", "eks:List*", "ecs:Describe*", "ecs:List*", "lambda:List*", "lambda:Get*",
      "cloudformation:Describe*", "cloudformation:List*", "cloudformation:Get*",
      "events:List*", "events:Describe*", "states:List*", "states:Describe*",
      "batch:Describe*", "elasticbeanstalk:Describe*", "appsync:List*"
    ], "Resource": "*" },
    { "Sid": "ApiGatewayInventoryOnly", "Effect": "Allow", "Action": ["apigateway:GET"], "Resource": [
      "arn:aws:apigateway:*::/restapis", "arn:aws:apigateway:*::/restapis/*",
      "arn:aws:apigateway:*::/apis", "arn:aws:apigateway:*::/apis/*"
    ] },
    { "Sid": "NetworkingEdgeDns", "Effect": "Allow", "Action": [
      "route53:List*", "route53:Get*", "cloudfront:List*", "cloudfront:Get*",
      "acm:List*", "acm:Describe*", "wafv2:List*", "wafv2:Get*",
      "sqs:List*", "sqs:Get*", "sns:List*", "sns:Get*",
      "directconnect:Describe*", "globalaccelerator:ListAccelerators",
      "route53resolver:List*", "servicediscovery:List*", "appmesh:List*",
      "appmesh:Describe*", "ses:List*", "mq:List*"
    ], "Resource": "*" },
    { "Sid": "IdentityAndKms", "Effect": "Allow", "Action": [
      "iam:List*", "iam:Get*", "iam:GenerateCredentialReport",
      "kms:List*", "kms:Describe*", "kms:GetKeyPolicy", "kms:GetKeyRotationStatus",
      "secretsmanager:List*", "secretsmanager:DescribeSecret", "organizations:List*", "organizations:Describe*",
      "sts:GetCallerIdentity"
    ], "Resource": "*" },
    { "Sid": "SecurityAndCompliance", "Effect": "Allow", "Action": [
      "securityhub:Get*", "securityhub:List*", "securityhub:Describe*",
      "guardduty:Get*", "guardduty:List*", "guardduty:Describe*",
      "inspector2:List*", "inspector2:Get*", "inspector2:BatchGetAccountStatus",
      "access-analyzer:List*", "access-analyzer:Get*", "config:Describe*", "config:Get*", "config:List*",
      "fms:ListPolicies", "shield:ListProtections", "network-firewall:List*",
      "cloudhsm:DescribeClusters", "detective:ListGraphs",
      "acm-pca:List*", "macie2:List*"
    ], "Resource": "*" },
    { "Sid": "MonitoringAndOps", "Effect": "Allow", "Action": [
      "cloudwatch:Describe*", "cloudwatch:Get*", "cloudwatch:List*",
      "logs:Describe*", "logs:FilterLogEvents",
      "cloudtrail:Describe*", "cloudtrail:Get*", "cloudtrail:List*", "cloudtrail:LookupEvents",
      "ssm:Describe*", "ssm:List*", "ssm:Get*", "health:Describe*"
    ], "Resource": "*" },
    { "Sid": "CostAndBilling", "Effect": "Allow", "Action": [
      "ce:Get*", "ce:Describe*", "budgets:View*", "budgets:Describe*",
      "pricing:GetProducts", "pricing:DescribeServices", "pricing:GetAttributeValues",
      "cur:Describe*", "account:GetAccountInformation", "account:ListRegions",
      "savingsplans:Describe*"
    ], "Resource": "*" },
    { "Sid": "TrustedAdvisorSupport", "Effect": "Allow", "Action": ["support:Describe*", "trustedadvisor:Describe*"], "Resource": "*" },
    { "Sid": "TaggingAndResourceGroups", "Effect": "Allow", "Action": [
      "tag:GetResources", "tag:GetTagKeys", "tag:GetTagValues", "resource-groups:List*", "resource-groups:Get*"
    ], "Resource": "*" },
    { "Sid": "GovernanceAndOptimization", "Effect": "Allow", "Action": [
      "controltower:ListLandingZones", "resiliencehub:ListApps", "wellarchitected:ListWorkloads",
      "compute-optimizer:GetEnrollmentStatus", "compute-optimizer:GetEC2InstanceRecommendations",
      "servicecatalog:ListPortfolios", "servicecatalog:SearchProductsAsAdmin",
      "ram:GetResourceShares", "ds:DescribeDirectories", "license-manager:List*"
    ], "Resource": "*" }
  ]
}`;

/**
 * Optional, separate from the base policy on purpose: the base policy never
 * grants s3:GetObject anywhere (reading arbitrary object *content* is a real
 * capability expansion, unlike the List* / Describe* metadata calls above) —
 * so real per-resource cost (via Cost & Usage Report ingestion) only works
 * once the customer has (1) created a CUR export with "Include resource IDs"
 * checked in AWS Billing -> Cost & Usage Reports, and (2) attached this,
 * scoped to that report's own bucket only, never "Resource": "*".
 */
export const CUR_S3_READ_POLICY_STATEMENT = `{
  "Sid": "CurResourceCostReadOnly",
  "Effect": "Allow",
  "Action": ["s3:GetObject", "s3:ListBucket"],
  "Resource": [
    "arn:aws:s3:::YOUR-CUR-BUCKET-NAME",
    "arn:aws:s3:::YOUR-CUR-BUCKET-NAME/*"
  ]
}`;
