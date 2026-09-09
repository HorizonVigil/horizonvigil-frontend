import { describe, it, expect } from 'vitest';

/**
 * Acceptance condition 27: "Public claims match the capability registry and
 * certified production state." AWS-P1-08 and §16 list the specific
 * statements to remove.
 *
 * These are asserted rather than reviewed because the marketing copy has
 * drifted back from the product three separate times. Each string below
 * describes something the SERVER actively refuses, verified in production:
 *
 *   "one-click remediation"      every remediation endpoint returns 403
 *                                (PROVIDER_REMEDIATION_ENABLED, fail-closed)
 *   "cross-account role"         ASSUME_ROLE_ENABLED is off; the wizard
 *                                disables the option and bulk import 403s
 *   "prioritized by exposure"    V2 vulnerability surfaces are denied 403
 *   "Vulnerability Management"   gated module; §16 names the
 *     "› Compliance"             "Vulnerability Management > Compliance"
 *                                string explicitly for removal
 *
 * A claim on a marketing page is not a smaller kind of falsehood than a
 * number on a dashboard. It reaches people who cannot check it.
 */
const sources = import.meta.glob(
  ['../pages/marketing/Home.tsx', '../pages/marketing/Docs.tsx', '../pages/marketing/Pricing.tsx', './marketingContent.ts'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

/** Comments are stripped: a doc comment explaining why a claim was removed must not fail the test that removed it. */
function prose(): string {
  return Object.values(sources)
    .map((text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''))
    .join('\n');
}

describe('public copy does not claim capabilities the server denies', () => {
  const copy = prose();

  it('does not advertise one-click remediation', () => {
    expect(copy).not.toMatch(/one[- ]click/i);
  });

  it('does not claim a fix is applied for the customer', () => {
    for (const claim of [/Apply a fix in one click/i, /Fixes apply/i, /Remediation applied/i]) {
      expect(copy, `${claim} claims execution`).not.toMatch(claim);
    }
  });

  it('does not offer cross-account role as an available connection method', () => {
    // Naming it is fine — and necessary, since customers ask. Offering it as
    // a choice they can make today is not.
    for (const claim of [
      /or a cross-account IAM role —/i,
      /access-key, cross-account role, or/i,
      /pick a method: a scoped access key .* or a cross-account/i,
    ]) {
      expect(copy, `${claim} presents AssumeRole as available`).not.toMatch(claim);
    }
  });

  it('carries no V2 vulnerability framing', () => {
    expect(copy).not.toMatch(/prioritized by exposure/i);
    expect(copy).not.toMatch(/critical findings/i);
  });

  it('does not route customers to Vulnerability Management for compliance', () => {
    // The exact string §16 names for removal. Compliance is its own module
    // at /cloud-compliance as of Phase 10.
    expect(copy).not.toMatch(/Vulnerability Management\s*[›>]\s*Compliance/i);
  });

  it('does not promise a full inventory in minutes', () => {
    expect(copy).not.toMatch(/inventory in (a few )?minutes/i);
  });

  it('still says what the product DOES do, rather than going silent', () => {
    // Removing a false claim must not leave a blank. The honest capability
    // — hand-off via commands or an Auto-PR — is real and still advertised.
    expect(copy).toMatch(/Auto-PR/);
    expect(copy).toMatch(/read-only/i);
  });
});
