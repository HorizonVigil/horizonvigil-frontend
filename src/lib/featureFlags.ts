/**
 * Deliberately dependency-free — anything that imports api.ts also imports
 * supabase.ts, which creates a live Supabase client at module load time and
 * throws if VITE_SUPABASE_URL isn't set (e.g. in the vitest environment,
 * which doesn't load .env). navConfig.ts needs this single boolean without
 * pulling in that whole chain just to render (or hide) one nav item.
 */
export function isBillingEnabled(): boolean {
  return Boolean(import.meta.env.VITE_BILLING_API_URL);
}

/**
 * The mock hosted-checkout screen simulates payment success/failure with no
 * real payment provider behind it (see its own doc comment in
 * MockCheckout.tsx) — reachable by anyone who knows the URL unless gated.
 * Off by default; set VITE_MOCK_CHECKOUT_ENABLED=true only in test/staging
 * environments that don't have a real payment provider connected yet.
 */
export function isMockCheckoutEnabled(): boolean {
  return import.meta.env.VITE_MOCK_CHECKOUT_ENABLED === 'true';
}

/**
 * Cloud-only go-live mode: temporarily hides non-cloud modules (Vulnerability
 * Management, Custom Dashboards, Issues, Incidents, Users & Groups,
 * Organization Management, Subscription) from the sidebar and Cmd+K. This is
 * a render-layer-only filter (see getVisibleModules()/CommandPalette.tsx) --
 * it deliberately does NOT remove anything from NAV_MODULES itself, so
 * ProtectedRoute's independent module lookup is untouched and every hidden
 * page stays reachable by direct URL for anyone who already had access. Off
 * (full nav) unless explicitly set -- flip VITE_CLOUD_ONLY_MODE back to
 * unset/false to instantly restore the full nav, nothing to undo in code.
 */
export function isCloudOnlyMode(): boolean {
  return import.meta.env.VITE_CLOUD_ONLY_MODE === 'true';
}

/**
 * Vulnerability/scanner data (V2) — the single gate every V1 surface must
 * consult before reading `vulnerability_findings` or the vulnerability
 * dashboard/attack-path endpoints.
 *
 * Why this exists as its own named capability rather than another scattered
 * isCloudOnlyMode() call: the V1 scope decision (2026-09-08 production
 * readiness audit) is that Cloud Security V1 is posture-only —
 * misconfigurations, exposure, IAM risk and provider-native compliance
 * evidence. CVEs, container-image findings, secrets/SAST/SCA/IaC scanner
 * results, and vulnerability attack paths are V2. Gating the *routes*
 * (App.tsx redirects, added earlier) was not sufficient: several V1
 * surfaces read that data directly and kept rendering it after the routes
 * were gated -- Overview's SignalCenter banner, Cloud Security's own
 * Posture tab and risk score, the Issues queue, the Open Issues KPI, and a
 * custom-dashboard widget. Verified against production 2026-09-08: all
 * 4,075 open rows in vulnerability_findings come from trivy /
 * scanner_trufflehog / scanner_checkov / scanner_grype / scanner_trivy /
 * scanner_semgrep, i.e. 100% V2, and zero rows come from the V1 posture
 * sources (aws_config, iam_access_analyzer, gcp_scc, defender). So in V1
 * this data is not "mostly V2" -- it is entirely V2, and every count it
 * produced on a V1 screen (167 critical, 3,615 findings, 3,619 issues)
 * was V2 presented as V1 work.
 *
 * Tied to cloud-only mode because that is exactly the V1 release posture
 * today; when vulnerability management is rebuilt for V2 this becomes its
 * own entitlement rather than a build-time flag.
 */
export function isVulnerabilityDataEnabled(): boolean {
  return !isCloudOnlyMode();
}
