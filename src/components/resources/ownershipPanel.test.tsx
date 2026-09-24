import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { OwnershipPanel } from './OwnershipPanel';
import { api, ApiError, type OwnershipCoverage } from '../../lib/api';
import { useMenuPermission } from '../../lib/useMenuPermission';

/**
 * The panel's write controls are gated on `resources: write`, which the real
 * hook reads from OrgProvider. These tests render the panel on its own, so the
 * permission under test is stated explicitly here rather than standing up the
 * whole organisation bootstrap -- and the read-only case gets its own test
 * below instead of being an accident of the harness.
 */
vi.mock('../../lib/useMenuPermission', () => ({
  useMenuPermission: vi.fn(() => true),
}));

const mockedUseMenuPermission = vi.mocked(useMenuPermission);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  mockedUseMenuPermission.mockReturnValue(true);
});

/** Shaped from production 2026-09-16: 515 real assets, zero owners. */
const PROD_COVERAGE: OwnershipCoverage = {
  totalAssets: 515,
  ownership: [
    { relation: 'owner', covered: 0, percent: 0, explanation: 'None of your 515 resources have an owner yet.' },
    { relation: 'team', covered: 0, percent: 0, explanation: 'None of your 515 resources have a team yet.' },
    { relation: 'application', covered: 0, percent: 0, explanation: 'None of your 515 resources have an application yet.' },
  ],
  iac: { covered: 0, percent: 0, byDriftState: {}, explanation: 'None of your 515 resources are linked to infrastructure-as-code yet.' },
};

const stub = (over: Partial<OwnershipCoverage> = {}) => {
  vi.spyOn(api, 'getOwnershipCoverage').mockResolvedValue({ ...PROD_COVERAGE, ...over });
  vi.spyOn(api, 'getOwnershipRules').mockResolvedValue({ items: [] });
};

describe('OwnershipPanel', () => {
  /**
   * Coverage is the deliverable. "None of your 515 resources have an owner
   * yet" is actionable; the word "Unassigned" repeated 515 times hides it.
   */
  it('states coverage against real assets, not raw row count', async () => {
    stub();
    render(<OwnershipPanel />);
    await waitFor(() => expect(screen.getByText(/measured against 515 real assets/)).toBeTruthy());
    expect(screen.getByText(/None of your 515 resources have an owner yet/)).toBeTruthy();
  });

  it('reports IaC linkage as its own statement', async () => {
    stub();
    render(<OwnershipPanel />);
    await waitFor(() => expect(screen.getByText(/linked to infrastructure-as-code yet/)).toBeTruthy());
  });

  /** A failed coverage read must not render as 0% coverage. */
  it('says coverage could not be measured rather than showing zeros', async () => {
    vi.spyOn(api, 'getOwnershipCoverage').mockRejectedValue(new ApiError(500, 'boom'));
    vi.spyOn(api, 'getOwnershipRules').mockResolvedValue({ items: [] });
    render(<OwnershipPanel />);
    await waitFor(() => expect(screen.getByText(/could not be loaded, so nothing here has been measured/)).toBeTruthy());
    expect(screen.queryByText(/0%/)).toBeNull();
  });

  /**
   * The server explains a zero — "none of the resources in scope carry any
   * tags, so no rule could match" — and that explanation is shown rather than
   * replaced with a bare count that looks like a broken job.
   */
  it('shows the server explanation when a rule run assigns nothing', async () => {
    stub();
    vi.spyOn(api, 'getOwnershipRules').mockResolvedValue({
      items: [{ id: 'r1', relation: 'owner', tag_key: 'Owner', priority: 100, created_at: '2026-09-16T00:00:00Z' }],
    });
    vi.spyOn(api, 'applyOwnershipRules').mockResolvedValue({
      resourcesWithAnyTag: 0, assignmentsWritten: 0, skippedBecauseDirectlyAssigned: 0,
      explanation: 'None of the 1,799 resources in scope carry any tags, so no rule could match. Assign owners directly, or start tagging in AWS.',
    });

    render(<OwnershipPanel />);
    await waitFor(() => expect(screen.getByRole('button', { name: /apply rules/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /apply rules/i }));

    await waitFor(() => expect(screen.getByText(/carry any tags, so no rule could match/)).toBeTruthy());
  });

  /** Removing a rule means "stop applying it", not "forget who owns these". */
  it('says assignments are retained when a rule is removed', async () => {
    stub();
    vi.spyOn(api, 'getOwnershipRules').mockResolvedValue({
      items: [{ id: 'r1', relation: 'team', tag_key: 'Team', priority: 100, created_at: '2026-09-16T00:00:00Z' }],
    });
    vi.spyOn(api, 'deleteOwnershipRule').mockResolvedValue({ id: 'r1', assignmentsRetained: 12 });

    render(<OwnershipPanel />);
    await waitFor(() => expect(screen.getByRole('button', { name: /remove/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /remove/i }));

    await waitFor(() => expect(screen.getByText(/12 existing assignment\(s\) were kept/)).toBeTruthy());
    expect(screen.getByText(/does not unassign anyone/)).toBeTruthy();
  });

  /** Applying rules with none configured would be a no-op that looks like a failure. */
  it('cannot apply rules when none are configured', async () => {
    stub();
    render(<OwnershipPanel />);
    await waitFor(() => expect(screen.getByRole('button', { name: /apply rules/i })).toBeTruthy());
    expect(screen.getByRole('button', { name: /apply rules/i })).toHaveProperty('disabled', true);
  });

  /**
   * The ownership mutations are guarded server-side by
   * requireMenuPermission('resources', 'write'). A viewer used to be offered
   * the controls and told no only after clicking.
   */
  it('offers no write controls to a read-only user, and says why', async () => {
    mockedUseMenuPermission.mockReturnValue(false);
    stub();
    vi.spyOn(api, 'getOwnershipRules').mockResolvedValue({
      items: [{ id: 'r1', relation: 'owner', tag_key: 'Owner', priority: 100, created_at: '2026-09-16T00:00:00Z' }],
    });

    render(<OwnershipPanel />);

    await waitFor(() =>
      expect(screen.getByText(/read-only access to resources/i)).toBeTruthy());

    expect(screen.getByRole('button', { name: /add rule/i })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: /apply rules/i })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: /remove/i })).toHaveProperty('disabled', true);
  });

  it('shows a real percentage when coverage exists', async () => {
    stub({ ownership: [{ relation: 'owner', covered: 103, percent: 20, explanation: '103 of 515 resources have an owner.' }] });
    render(<OwnershipPanel />);
    await waitFor(() => expect(screen.getByText('20%')).toBeTruthy());
  });
});
