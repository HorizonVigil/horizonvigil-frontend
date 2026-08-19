/**
 * Azure's equivalent of leastPrivilegePolicy.ts (AWS) / gcpRequiredPermissions.ts
 * (GCP) — Azure's permission model is role-based like GCP's (assign a role,
 * don't author a policy document), so this is a role reference and a short
 * "how to grant it" checklist, not a JSON policy blob.
 */

export const AZURE_RECOMMENDED_ROLE = 'Reader';

export const AZURE_ROLE_DESCRIPTION =
  "Azure's built-in read-only role. Covers list/get access across every resource type in the subscription — the equivalent of AWS's ReadOnlyAccess managed policy or GCP's roles/viewer. It does NOT grant read access to Key Vault secret/key/certificate values (a separate, more sensitive permission) — HorizonVigil never requests that, only Key Vault's own metadata (name, URI, configuration).";

export const SERVICE_PRINCIPAL_STEPS = [
  'Microsoft Entra ID → App registrations → New registration (e.g. horizonvigil-readonly). Single tenant is fine; no redirect URI needed.',
  'Open the new app → Certificates & secrets → New client secret. Copy the secret VALUE immediately — it is shown once.',
  'Copy the app\'s "Application (client) ID" and "Directory (tenant) ID" from its Overview page.',
  `Subscriptions → (your subscription) → Access control (IAM) → Add role assignment → "${AZURE_RECOMMENDED_ROLE}" → assign it to the app you just created.`,
  'Paste the subscription ID, tenant ID, application (client) ID, and client secret here. We encrypt the secret at rest and never show it again.',
];
