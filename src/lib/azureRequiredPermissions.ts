/**
 * Azure least-privilege connection guidance.
 *
 * Azure uses RBAC role assignments rather than a customer-supplied policy
 * document. This module therefore exposes:
 *   1. the recommended built-in subscription role;
 *   2. the role's intended scope/limitations;
 *   3. the exact setup checklist shown by the connection flow.
 *
 * IMPORTANT:
 * - A client-side recommendation is not an authorization boundary.
 * - The connected service principal's actual permissions are determined by
 *   Azure RBAC and must be validated server-side when the connection is
 *   tested.
 * - `Reader` is a control-plane/read-only role. Data-plane permissions for
 *   services such as Key Vault are intentionally not requested here.
 */

/** Recommended built-in Azure RBAC role for read-only discovery. */
export const AZURE_RECOMMENDED_ROLE = 'Reader' as const;

/**
 * Customer-facing explanation of the recommended role.
 *
 * Keep this wording scoped to Azure Resource Manager/control-plane access.
 * Do not imply that Reader grants access to every underlying service data
 * plane.
 */
export const AZURE_ROLE_DESCRIPTION =
  'Azure’s built-in read-only management-plane role. It provides read access to Azure Resource Manager resources at the assigned scope, without granting write or delete permissions. It does not grant access to sensitive data-plane values such as Key Vault secrets, keys, or certificates. HorizonVigil only requires Key Vault resource metadata/configuration for discovery.';

/**
 * Setup checklist for connecting an Azure subscription with a service
 * principal.
 *
 * The secret value is displayed by Azure only at creation time; customers
 * should store it securely and provide it through the application's
 * credential flow.
 */
export const SERVICE_PRINCIPAL_STEPS: readonly string[] = [
  'Microsoft Entra ID → App registrations → New registration (for example, "horizonvigil-readonly"). A redirect URI is not required for this client-credential connection flow.',
  'Open the new app → Certificates & secrets → New client secret. Copy the secret VALUE immediately because Azure shows it only at creation time.',
  'Copy the Application (client) ID and Directory (tenant) ID from the app registration Overview page.',
  `Subscriptions → select the target subscription → Access control (IAM) → Add role assignment → "${AZURE_RECOMMENDED_ROLE}" → assign it to the app registration/service principal.`,
  'Enter the subscription ID, tenant ID, application (client) ID, and client secret in HorizonVigil. The application should protect the credential material and should not expose the secret again after secure storage.',
];

/**
 * Supported credential fields for the Azure service-principal connection
 * form. Keeping the names centralized reduces drift between UI and API
 * adapters.
 */
export const AZURE_SERVICE_PRINCIPAL_FIELDS = [
  'subscriptionId',
  'tenantId',
  'clientId',
  'clientSecret',
] as const;

export type AzureServicePrincipalField =
  (typeof AZURE_SERVICE_PRINCIPAL_FIELDS)[number];

/**
 * Human-readable labels for the connection form.
 */
export const AZURE_SERVICE_PRINCIPAL_FIELD_LABELS: Readonly<
  Record<AzureServicePrincipalField, string>
> = {
  subscriptionId: 'Subscription ID',
  tenantId: 'Directory (tenant) ID',
  clientId: 'Application (client) ID',
  clientSecret: 'Client secret',
};

/**
 * Validate a service-principal input at the UI boundary.
 *
 * This only checks presence/shape at a basic level; it does not authenticate
 * the credentials. Live validation must remain server-side.
 */
export function validateAzureServicePrincipalInput(input: {
  subscriptionId?: unknown;
  tenantId?: unknown;
  clientId?: unknown;
  clientSecret?: unknown;
}): { valid: true } | { valid: false; missing: AzureServicePrincipalField[] } {
  const missing = AZURE_SERVICE_PRINCIPAL_FIELDS.filter((field) => {
    const value = input[field];
    return typeof value !== 'string' || value.trim().length === 0;
  });

  return missing.length === 0
    ? { valid: true }
    : { valid: false, missing };
}
