import { describe, expect, it } from 'vitest';

import { safeExternalUrl } from './safeUrl';
import { stripComments } from '../test/sourceCode';

describe('safeExternalUrl', () => {
  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    '  javascript:alert(1)  ',
    'java\tscript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
  ])('refuses %s', (value) => {
    expect(safeExternalUrl(value)).toBeNull();
  });

  it.each([null, undefined, 42, {}, [], '', '   '])(
    'refuses the non-URL value %s',
    (value) => {
      expect(safeExternalUrl(value)).toBeNull();
    },
  );

  it('allows ordinary advisory links', () => {
    expect(safeExternalUrl('https://nvd.nist.gov/vuln/detail/CVE-2026-1')).toBe(
      'https://nvd.nist.gov/vuln/detail/CVE-2026-1',
    );
    expect(safeExternalUrl('http://example.test/a')).toBe('http://example.test/a');
    expect(safeExternalUrl('mailto:security@example.test')).toBe(
      'mailto:security@example.test',
    );
  });

  /**
   * A relative path resolves against the app origin rather than being refused:
   * some advisory feeds carry site-relative links, and dropping them would lose
   * real information for no security gain.
   */
  it('resolves a relative path against the app origin', () => {
    const resolved = safeExternalUrl('/docs/remediation');

    expect(resolved).toBe(`${window.location.origin}/docs/remediation`);
  });
});

/**
 * React escapes text but not the `href` attribute, so every link built from a
 * value this app did not author has to go through the check above. These are
 * the sites that render one.
 */
const LINK_SOURCES = import.meta.glob(
  [
    '../pages/VulnerabilityManagement.tsx',
    '../pages/VulnerabilityDetail.tsx',
    '../pages/CostOptimization.tsx',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

describe('externally-sourced URLs are never rendered unchecked', () => {
  it.each(Object.keys(LINK_SOURCES))('%s validates every dynamic href', (path) => {
    const src = stripComments(LINK_SOURCES[path]);

    // Every `href={identifier}` must be a safeExternalUrl(...) call, never a
    // bare field read such as href={finding.remediation_link}.
    const bareHrefs = src.match(/href=\{\s*[A-Za-z_$][\w$]*(?:\??\.[\w$]+)+\s*(?:\?\?[^}]*)?\}/g) ?? [];
    const unchecked = bareHrefs.filter((h) => !h.includes('safeExternalUrl'));

    expect(unchecked, `unvalidated href(s): ${unchecked.join(', ')}`).toEqual([]);
  });
});
