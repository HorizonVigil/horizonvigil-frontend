/**
 * GCP least-privilege connection guidance.
 *
 * GCP uses IAM role assignments rather than customer-authored policy
 * documents. This module therefore provides:
 * - the recommended predefined role;
 * - a concise description of the intended permission boundary;
 * - setup instructions for either a service-account key or keyless
 *   service-account impersonation flow.
 *
 * IMPORTANT:
 * - These are setup recommendations, not an authorization boundary.
 * - The effective permissions are determined by the project's IAM policy and
 *   any inherited/resource-specific permissions.
 * - Live credential/permission validation must be performed by the backend.
 * - Keyless impersonation is preferred where the customer's environment can
 *   support it because it avoids storing a long-lived private key.
 */

/**
 * Predefined GCP IAM role recommended for read-only discovery.
 */
export const GCP_RECOMMENDED_ROLE = 'roles/viewer' as const;

/**
 * Customer-facing explanation of the recommended role.
 *
 * Keep this scoped to IAM permissions rather than claiming that every
 * underlying service's data plane is readable. A project-level Viewer grant
 * is a broad read-only control-plane role, while some products expose
 * additional data-plane permissions through separate IAM roles.
 */
export const GCP_ROLE_DESCRIPTION =
  "GCP's predefined Viewer role is a broad read-only IAM role for resource metadata and configuration at the assigned scope. It grants no ordinary create, update, or delete permissions. HorizonVigil uses the read/list APIs required for supported discovery and inventory; access to service-specific data planes may require additional product roles and is not implied by this recommendation.";

/**
 * Service-account key setup.
 *
 * Private keys are long-lived credentials and should only be used where the
 * customer's environment requires them. The application should protect key
 * material at rest and never redisplay it after secure storage.
 */
export const SERVICE_ACCOUNT_KEY_STEPS: readonly string[] = [
  'IAM & Admin → Service Accounts → Create Service Account (for example, "horizonvigil-readonly"). No Google Cloud Console user access is required for the service account.',
  `Grant the service account the "${GCP_RECOMMENDED_ROLE}" role (Viewer) at the target project scope.`,
  'Open the service account → Keys → Add Key → Create new key → JSON. Download the JSON immediately because the private key is shown only at creation time.',
  'Provide the service-account JSON through HorizonVigil’s credential flow. Protect the private key as a secret and do not reuse or commit it to source control.',
];

/**
 * Keyless service-account impersonation setup.
 *
 * No private key is stored by HorizonVigil in this flow. The platform
 * identity must have Service Account Token Creator on the target service
 * account so it can mint short-lived access tokens.
 */
export const SERVICE_ACCOUNT_IMPERSONATION_STEPS: readonly string[] = [
  'IAM & Admin → Service Accounts → Create Service Account (for example, "horizonvigil-readonly"). No service-account key is required for this method.',
  `Grant the target service account the "${GCP_RECOMMENDED_ROLE}" role (Viewer) at the target project scope.`,
  'On the target service account, open Permissions and grant HorizonVigil’s platform service account the "Service Account Token Creator" role (roles/iam.serviceAccountTokenCreator) at the narrowest appropriate scope. This allows short-lived token impersonation instead of storing a long-lived private key.',
  'Provide the target service account email address in HorizonVigil. The target service account email is the identity HorizonVigil will impersonate; do not enter the platform service account email here.',
];

/**
 * Credential method identifiers used by the connection form/API.
 */
export const GCP_CONNECTION_METHODS = [
  'service_account_key',
  'service_account_impersonation',
] as const;

export type GcpConnectionMethod =
  (typeof GCP_CONNECTION_METHODS)[number];

/**
 * Required fields for each supported GCP connection method.
 */
export const GCP_CONNECTION_FIELDS: Readonly<
  Record<GcpConnectionMethod, readonly string[]>
> = {
  service_account_key: [
    'gcpProjectId',
    'serviceAccountKeyJson',
  ],
  service_account_impersonation: [
    'gcpProjectId',
    'impersonatedServiceAccount',
  ],
};

/**
 * Basic UI-boundary validation.
 *
 * This validates presence only. It does not prove that a project exists,
 * that the service account is correctly assigned, or that the credentials can
 * access the required APIs. Those checks belong to live server-side
 * connection/permission validation.
 */
export function validateGcpConnectionInput(input: {
  method?: unknown;
  gcpProjectId?: unknown;
  serviceAccountKeyJson?: unknown;
  impersonatedServiceAccount?: unknown;
}):
  | { valid: true }
  | {
      valid: false;
      missing: readonly string[];
      reason?: string;
    } {
  if (
    typeof input.method !== 'string' ||
    !(GCP_CONNECTION_METHODS as readonly string[]).includes(input.method)
  ) {
    return {
      valid: false,
      missing: [],
      reason: 'A supported GCP connection method is required.',
    };
  }

  const method = input.method as GcpConnectionMethod;
  const requiredFields = GCP_CONNECTION_FIELDS[method];

  const missing = requiredFields.filter((field) => {
    const value = input[field as keyof typeof input];

    return (
      typeof value !== 'string' ||
      value.trim().length === 0
    );
  });

  return missing.length === 0
    ? { valid: true }
    : { valid: false, missing };
}
