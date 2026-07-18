// §7.3 hardened least-privilege policy — read-only everywhere, no object/secret
// content access. Offered as the "custom policy" alternative to ReadOnlyAccess +
// SecurityAudit in the connection wizard.
export const LEAST_PRIVILEGE_POLICY = `{
  "Version": "2012-10-17",
  "Statement": [
    { "Sid": "ComputeNetworkStorage", "Effect": "Allow", "Action": [
      "ec2:Describe*", "ec2:GetEbsEncryptionByDefault", "ec2:GetConsoleOutput",
      "elasticloadbalancing:Describe*", "autoscaling:Describe*",
      "s3:List*", "s3:GetBucket*", "s3:GetObjectTagging", "s3:GetLifecycleConfiguration",
      "s3:GetEncryptionConfiguration", "s3:GetBucketPolicyStatus", "s3:GetBucketPublicAccessBlock",
      "efs:Describe*", "fsx:Describe*", "backup:List*", "backup:Describe*", "backup:Get*"
    ], "Resource": "*" },
    { "Sid": "DatabasesAndCaching", "Effect": "Allow", "Action": [
      "rds:Describe*", "rds:List*", "dynamodb:Describe*", "dynamodb:List*",
      "elasticache:Describe*", "redshift:Describe*", "redshift:GetClusterCredentials"
    ], "Resource": "*" },
    { "Sid": "ContainersAndServerless", "Effect": "Allow", "Action": [
      "eks:Describe*", "eks:List*", "ecs:Describe*", "ecs:List*", "lambda:List*", "lambda:Get*",
      "cloudformation:Describe*", "cloudformation:List*", "cloudformation:Get*"
    ], "Resource": "*" },
    { "Sid": "NetworkingEdgeDns", "Effect": "Allow", "Action": [
      "route53:List*", "route53:Get*", "cloudfront:List*", "cloudfront:Get*",
      "acm:List*", "acm:Describe*", "wafv2:List*", "wafv2:Get*",
      "sqs:List*", "sqs:Get*", "sns:List*", "sns:Get*"
    ], "Resource": "*" },
    { "Sid": "IdentityAndKms", "Effect": "Allow", "Action": [
      "iam:List*", "iam:Get*", "iam:GenerateCredentialReport", "iam:GenerateServiceLastAccessedDetails",
      "kms:List*", "kms:Describe*", "kms:GetKeyPolicy", "kms:GetKeyRotationStatus",
      "secretsmanager:List*", "secretsmanager:DescribeSecret", "organizations:List*", "organizations:Describe*"
    ], "Resource": "*" },
    { "Sid": "SecurityAndCompliance", "Effect": "Allow", "Action": [
      "securityhub:Get*", "securityhub:List*", "securityhub:Describe*",
      "guardduty:Get*", "guardduty:List*", "guardduty:Describe*",
      "inspector2:List*", "inspector2:Get*", "inspector2:BatchGetAccountStatus",
      "access-analyzer:List*", "access-analyzer:Get*", "config:Describe*", "config:Get*", "config:List*"
    ], "Resource": "*" },
    { "Sid": "MonitoringAndOps", "Effect": "Allow", "Action": [
      "cloudwatch:Describe*", "cloudwatch:Get*", "cloudwatch:List*",
      "logs:Describe*", "logs:Get*", "logs:FilterLogEvents",
      "cloudtrail:Describe*", "cloudtrail:Get*", "cloudtrail:List*", "cloudtrail:LookupEvents",
      "ssm:Describe*", "ssm:List*", "ssm:Get*", "health:Describe*"
    ], "Resource": "*" },
    { "Sid": "CostAndBilling", "Effect": "Allow", "Action": [
      "ce:Get*", "ce:Describe*", "budgets:View*", "budgets:Describe*",
      "pricing:GetProducts", "pricing:DescribeServices", "pricing:GetAttributeValues",
      "cur:Describe*", "account:GetAccountInformation", "account:ListRegions"
    ], "Resource": "*" },
    { "Sid": "TrustedAdvisorSupport", "Effect": "Allow", "Action": ["support:Describe*", "trustedadvisor:Describe*"], "Resource": "*" },
    { "Sid": "TaggingAndResourceGroups", "Effect": "Allow", "Action": [
      "tag:GetResources", "tag:GetTagKeys", "tag:GetTagValues", "resource-groups:List*", "resource-groups:Get*"
    ], "Resource": "*" }
  ]
}`;
