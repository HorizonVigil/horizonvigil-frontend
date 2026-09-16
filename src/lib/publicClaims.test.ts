import { describe, expect, it } from 'vitest';

/**
 * Acceptance condition 27: public claims must remain aligned with the
 * certified production capability registry/state.
 *
 * These source-level assertions intentionally guard customer-facing marketing
 * copy because this copy has historically drifted back toward capabilities
 * that the production server currently denies or does not certify.
 *
 * Protected claims:
 * - no "one-click" remediation / customer-side fix execution
 * - no presentation of cross-account IAM role as an available connection method
 * - no V2 vulnerability framing that is not part of the certified surface
 * - no routing of Compliance under Vulnerability Management
 * - no promise of inventory completion "in minutes"
 *
 * Comments are ignored so explanatory engineering notes do not affect the
 * customer-facing copy assertions.
 */

const sources = import.meta.glob(
  [
    '../pages/marketing/Home.tsx',
    '../pages/marketing/Docs.tsx',
    '../pages/marketing/Pricing.tsx',
    './marketingContent.ts',
  ],
  {
    query: '?raw',
    import: 'default',
    eager: true,
  },
) as Record<string, string>;

function stripComments(text: string): string {
  return text
    // Block comments.
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    // Line comments that are not URL protocol text.
    .replace(/(^|[^:\\])\/\/.*$/gm, '$1 ');
}

function prose(): string {
  const sourceEntries = Object.entries(sources);

  expect(
    sourceEntries.length,
    'No marketing source files were loaded; verify the import.meta.glob paths.',
  ).toBeGreaterThan(0);

  return sourceEntries
    .map(([, text]) => stripComments(text))
    .join('\n');
}

describe('public marketing claims stay within certified production capability', () => {
  const copy = prose();

  it('does not advertise one-click remediation', () => {
    expect(copy).not.toMatch(/\bone[-\s]click\b/i);
  });

  it('does not claim customer-side fix execution', () => {
    const prohibitedClaims = [
      /\bapply a fix in one click\b/i,
      /\bfixes apply\b/i,
      /\bremediation applied\b/i,
      /\bautomatically applies?\s+(?:the\s+)?fix\b/i,
      /\bauto(?:matically)?[-\s]?remediat(?:e|ion)\b/i,
    ];

    for (const claim of prohibitedClaims) {
      expect(copy, `customer-facing execution claim found: ${claim}`).not.toMatch(
        claim,
      );
    }
  });

  it('does not present cross-account IAM role as an available connection method', () => {
    const prohibitedClaims = [
      /\bor a cross-account IAM role\b/i,
      /\baccess[-\s]?key,\s*cross[-\s]?account role(?:,|\s|or)/i,
      /\bpick a method:\s*.*cross[-\s]?account/i,
      /\bchoose\s+(?:a|an)\s+cross[-\s]?account(?: IAM)? role\b/i,
      /\bconnect(?:ing)?\s+(?:with|using)\s+(?:a|an)\s+cross[-\s]?account(?: IAM)? role\b/i,
    ];

    for (const claim of prohibitedClaims) {
      expect(
        copy,
        `customer-facing AssumeRole availability claim found: ${claim}`,
      ).not.toMatch(claim);
    }
  });

  it('does not advertise V2 vulnerability framing', () => {
    expect(copy).not.toMatch(/\bprioritized by exposure\b/i);
    expect(copy).not.toMatch(/\bcritical findings\b/i);
  });

  it('does not place Compliance under Vulnerability Management', () => {
    expect(copy).not.toMatch(
      /Vulnerability Management\s*[›>]\s*Compliance/i,
    );
  });

  it('does not promise full inventory completion within minutes', () => {
    expect(copy).not.toMatch(
      /\binventory in (?:a few )?minutes\b/i,
    );
    expect(copy).not.toMatch(
      /\bfull inventory\b[^.\n]{0,100}\b(?:in|within)\s+(?:a few\s+)?minutes\b/i,
    );
  });

  it('still communicates certified capabilities instead of becoming empty marketing copy', () => {
    expect(copy).toMatch(/\bAuto-PR\b/i);
    expect(copy).toMatch(/\bread-only\b/i);
  });

  it('does not expose internal acceptance/audit terminology in customer copy', () => {
    const internalTerms = [
      /AWS-P[01]-\d+/i,
      /\bAcceptance condition\b/i,
      /\bcertified production state\b/i,
      /\bserver denies\b/i,
      /\bproduction audit\b/i,
    ];

    for (const term of internalTerms) {
      expect(copy, `internal implementation term leaked into source copy: ${term}`).not.toMatch(
        term,
      );
    }
  });

  it('loads each expected marketing source so a renamed/missing file cannot silently weaken coverage', () => {
    const loadedPaths = Object.keys(sources);

    for (const expectedPath of [
      '/Home.tsx',
      '/Docs.tsx',
      '/Pricing.tsx',
      '/marketingContent.ts',
    ]) {
      expect(
        loadedPaths.some((filePath) => filePath.endsWith(expectedPath)),
        `${expectedPath} was not included in the marketing-source glob`,
      ).toBe(true);
    }
  });
});
