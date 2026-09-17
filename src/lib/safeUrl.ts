/**
 * Protocol validation for URLs that did not originate in this codebase.
 *
 * THE PROBLEM
 *
 * React escapes text, but it does NOT sanitise the `href` attribute. Putting a
 * backend-supplied string straight into `href` means a value of
 * `javascript:...` runs when the link is clicked — a stored XSS that needs no
 * innerHTML and no eval, only a link the user trusts enough to click.
 *
 * The values this guards are not ours:
 *
 * - `remediation_link` on a finding is a reference URL carried out of scanner
 *   output (Trivy, Grype, Semgrep, ...), which in turn ingests third-party
 *   advisory feeds. It is attacker-influenceable several hops upstream.
 * - `prUrl` and the Jira issue URL come back from external APIs.
 *
 * `Subscription.tsx` already did exactly this check inline before rendering an
 * invoice link. This is that same check, extracted so every external link gets
 * it rather than one.
 *
 * WHAT IT RETURNS
 *
 * The URL when it is safe to render, or null when it is not. Null means the
 * caller must render NO link — not a disabled one, and never the raw string as
 * an href. Callers are expected to fall back to plain text or omit the link,
 * which keeps a malformed value visible rather than silently dropping
 * information the user may need.
 */

/** Only these may appear in an href built from untrusted input. */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

export function safeExternalUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  let parsed: URL;

  try {
    /*
     * Parsed against the app origin so a relative path stays valid, and so
     * that a scheme-relative or malformed value resolves to something
     * inspectable instead of throwing.
     */
    parsed = new URL(trimmed, window.location.origin);
  } catch {
    return null;
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return null;

  /*
   * Returning `parsed.toString()` rather than the original string is
   * deliberate: it is the normalised form of the value that was actually
   * validated. Handing back the raw input would let a value that parsed one
   * way be re-parsed differently by the browser.
   */
  return parsed.toString();
}
