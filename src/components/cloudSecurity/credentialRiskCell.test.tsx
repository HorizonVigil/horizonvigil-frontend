import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { CredentialRiskCell, RiskFactorList } from './CredentialRiskCell';

afterEach(cleanup);

const creds = (over: Partial<Parameters<typeof CredentialRiskCell>[0]['credentials']> = {}) => ({
  assessed: true, activeKeyCount: 1, oldestActiveKeyAgeDays: 10, neverUsedActiveKeys: 0, ...over,
});

describe('CredentialRiskCell', () => {
  /**
   * The load-bearing case. An identity with no credential metadata was never
   * examined; a blank cell or a reassuring "0 stale" would make that
   * indistinguishable from a clean result.
   */
  it('says "not assessed" rather than rendering an unexamined identity as clean', () => {
    render(<CredentialRiskCell credentials={creds({ assessed: false })} />);
    expect(screen.getByText('not assessed')).toBeTruthy();
  });

  it('treats a missing credentials object as unassessed, not clean', () => {
    render(<CredentialRiskCell credentials={undefined as never} />);
    expect(screen.getByText('not assessed')).toBeTruthy();
  });

  /** Distinct from "not assessed": examined, and there genuinely are none. */
  it('distinguishes no active keys from not assessed', () => {
    render(<CredentialRiskCell credentials={creds({ activeKeyCount: 0, oldestActiveKeyAgeDays: null })} />);
    expect(screen.getByText('no active keys')).toBeTruthy();
    expect(screen.queryByText('not assessed')).toBeNull();
  });

  it('reports the real production shape: two keys, one never used', () => {
    render(<CredentialRiskCell credentials={creds({ activeKeyCount: 2, neverUsedActiveKeys: 1, oldestActiveKeyAgeDays: 55 })} />);
    expect(screen.getByText(/2 active keys · 1 never used · oldest 55d/)).toBeTruthy();
  });

  it('omits an age it does not know instead of printing a placeholder', () => {
    render(<CredentialRiskCell credentials={creds({ oldestActiveKeyAgeDays: null })} />);
    expect(screen.getByText('1 active key')).toBeTruthy();
  });
});

describe('RiskFactorList', () => {
  it('states plainly when there are none', () => {
    render(<RiskFactorList factors={[]} />);
    expect(screen.getByText('No risk factors')).toBeTruthy();
  });

  /**
   * The server orders factors worst-first — privilege and MFA decide the
   * headline, credential hygiene follows. Re-sorting here would let a stale
   * key outrank administrator-equivalent access.
   */
  it('preserves the server ordering', () => {
    render(<RiskFactorList factors={['Administrator-equivalent privileges', 'No MFA', 'Active access key has never been used']} />);
    const text = screen.getByText(/Administrator-equivalent privileges/).textContent ?? '';
    expect(text.indexOf('Administrator-equivalent')).toBeLessThan(text.indexOf('No MFA'));
    expect(text.indexOf('No MFA')).toBeLessThan(text.indexOf('never been used'));
  });

  it('truncates with a count rather than silently dropping factors', () => {
    render(<RiskFactorList factors={['a', 'b', 'c', 'd', 'e']} max={3} />);
    expect(screen.getByText(/\+2 more/)).toBeTruthy();
  });
});
