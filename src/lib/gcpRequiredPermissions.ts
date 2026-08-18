/**
 * GCP's equivalent of leastPrivilegePolicy.ts — but GCP's permission model
 * is role-based (grant a predefined role, not author a policy document), so
 * this is a role reference and a short "how to grant it" checklist, not a
 * giant JSON policy blob like AWS's IAM version.
 */

export const GCP_RECOMMENDED_ROLE = 'roles/viewer';

export const GCP_ROLE_DESCRIPTION =
  'GCP\'s built-in read-only role. Covers list/get access across Compute Engine, Cloud Storage, Cloud SQL, GKE, and effectively every other resource type in the project — the equivalent of AWS\'s ReadOnlyAccess managed policy. HorizonVigil only ever calls read (list/get) operations.';

export const SERVICE_ACCOUNT_KEY_STEPS = [
  'IAM & Admin → Service Accounts → Create Service Account (e.g. horizonvigil-readonly), no console access needed.',
  `Grant it the "${GCP_RECOMMENDED_ROLE}" role (Viewer) on the project.`,
  'Open the new service account → Keys → Add Key → Create new key → JSON. Downloads immediately — the private key is shown once.',
  'Paste the full JSON file contents here. We encrypt it at rest and never show it again.',
];

export const SERVICE_ACCOUNT_IMPERSONATION_STEPS = [
  'IAM & Admin → Service Accounts → Create Service Account (e.g. horizonvigil-readonly), no keys needed for this method.',
  `Grant it the "${GCP_RECOMMENDED_ROLE}" role (Viewer) on the project.`,
  'On that same service account, open the Permissions tab and grant HorizonVigil\'s platform service account (shown after you submit this form) the "Service Account Token Creator" role (roles/iam.serviceAccountTokenCreator) — this is what lets us mint short-lived tokens without ever storing a key.',
  'Paste the service account\'s email address here (the one you just created, not the platform\'s).',
];
