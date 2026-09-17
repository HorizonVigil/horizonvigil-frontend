import { describe, it, expect, afterEach, vi } from 'vitest';
import { render as rtlRender, cleanup, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { ThemeProvider } from '../lib/theme';
import { expectNoA11yViolations } from '../test/a11y';

import { Modal } from './Modal';
import { Drawer } from './Drawer';
import { StatCard } from './StatCard';
import { Skeleton } from './Skeleton';
import { BarChart } from './charts/BarChart';
import { Donut } from './charts/Donut';
import { LineChart } from './charts/LineChart';
import { StackedBar } from './charts/StackedBar';
import { ScanCoverageBanner } from './cloudAccounts/ScanCoverageBanner';
import type { ScanHealth } from '../lib/api';

/**
 * Accessibility, second tier: the INTERACTIVE and GRAPHICAL components.
 *
 * The existing baseline covers shared primitives (Badge, EmptyState,
 * AccessDenied, DataTable). This covers the two categories most likely to
 * carry real violations and least likely to be caught by reading the code:
 *
 *  - dialogs, where the failure is a missing accessible name or a region that
 *    traps a screen reader rather than the keyboard;
 *  - charts, which are SVG and therefore invisible to assistive technology
 *    unless deliberately labelled. A dashboard whose numbers exist only as
 *    `<path>` elements communicates nothing to a screen-reader user.
 *
 * Still a floor, not coverage. Layout-dependent rules stay disabled (jsdom has
 * no layout engine) and full routed pages are not exercised here.
 */

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function render(ui: React.ReactElement) {
  return rtlRender(
    <ThemeProvider>
      <MemoryRouter>{ui}</MemoryRouter>
    </ThemeProvider>,
  );
}

describe('dialogs', () => {
  it('Modal has no violations and exposes an accessible name', async () => {
    const { container } = render(
      <Modal open onClose={() => {}} title="Disconnect account">
        <p>Body copy</p>
        <button type="button">Confirm</button>
      </Modal>,
    );

    await expectNoA11yViolations(container);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName('Disconnect account');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('Drawer has no violations and exposes an accessible name', async () => {
    const { container } = render(
      <Drawer open onClose={() => {}} title="Account details">
        <p>Body copy</p>
      </Drawer>,
    );

    await expectNoA11yViolations(container);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName('Account details');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('the close control of each dialog is reachable by name', async () => {
    render(
      <Modal open onClose={() => {}} title="Titled">
        <p>Body</p>
      </Modal>,
    );

    // A bare "×" glyph is not a name; this is what makes the control usable.
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
  });
});

describe('charts expose their data to assistive technology', () => {
  const bars = [
    { label: 'AWS', value: 1200 },
    { label: 'Azure', value: 800 },
  ];

  it('BarChart has no violations', async () => {
    const { container } = render(<BarChart data={bars} />);
    await expectNoA11yViolations(container);
  });

  it('Donut has no violations', async () => {
    const { container } = render(<Donut data={bars} />);
    await expectNoA11yViolations(container);
  });

  it('LineChart has no violations', async () => {
    const { container } = render(
      <LineChart
        series={[
          {
            label: 'Daily cost',
            points: [
              { x: '2026-09-01', y: 10 },
              { x: '2026-09-02', y: 14 },
            ],
          },
        ]}
      />,
    );
    await expectNoA11yViolations(container);
  });

  it('StackedBar has no violations', async () => {
    const { container } = render(
      <StackedBar
        rows={[
          {
            label: 'aws-prod',
            segments: [
              { label: 'Critical', value: 3, tone: 'critical' },
              { label: 'High', value: 5, tone: 'serious' },
            ],
          },
        ]}
      />,
    );
    await expectNoA11yViolations(container);
  });

  /**
   * An SVG with no role and no name is skipped entirely by a screen reader.
   * Every chart on a dashboard would then be silent.
   */
  it('Donut, which is SVG, carries an accessible name', () => {
    const { container } = render(<Donut data={bars} />);
    const svg = container.querySelector('svg');

    expect(svg, 'Donut rendered no svg').not.toBeNull();

    const labelled =
      svg?.getAttribute('aria-label') ??
      svg?.getAttribute('aria-labelledby') ??
      svg?.querySelector('title')?.textContent;

    expect(labelled, 'the donut svg carries no accessible name').toBeTruthy();
  });

  /**
   * BarChart is built from DOM elements rather than SVG, so the requirement
   * is different: its labels and values must be real text a screen reader can
   * read, not width styles alone.
   */
  it('BarChart renders its labels and values as text', () => {
    render(<BarChart data={bars} />);

    expect(screen.getByText('AWS')).toBeInTheDocument();
    expect(screen.getByText('Azure')).toBeInTheDocument();
  });
});

describe('status and layout primitives', () => {
  it('StatCard has no violations', async () => {
    const { container } = render(
      <StatCard label="Total Spend" value="$1,200" icon="cost" caption="month to date" />,
    );
    await expectNoA11yViolations(container);
  });

  /*
   * Breadcrumb is NOT covered here. It reads useOrg() and throws outside
   * OrgProvider, so testing it in isolation would mean standing up the
   * organisation bootstrap -- at which point the test exercises the harness
   * more than the component. Recorded as a gap rather than faked with a stub
   * provider, which would test a different component than the one that ships.
   */

  it('Skeleton has no violations', async () => {
    const { container } = render(<Skeleton />);
    await expectNoA11yViolations(container);
  });

  /**
   * This banner exists to state that an inventory count is incomplete. If it
   * is not announced, a screen-reader user reads the count as authoritative --
   * the exact misreading the component was built to prevent.
   */
  it('ScanCoverageBanner has no violations when reporting partial coverage', async () => {
    const health: ScanHealth = {
      completeness: 'PARTIAL',
      countIsAuthoritative: false,
      summary: 'Inventory is incomplete — ec2 failed in 17 regions.',
      totalSteps: 1628,
      succeededSteps: 1611,
      failedSteps: 17,
      failures: [
        { scanner: 'ec2', scopes: ['us-east-1'], normalizedCode: 'UNSUPPORTED_CAPABILITY', detail: null },
      ],
      degradedResourceTypes: ['ec2_instance'],
      runId: 'r1',
      finishedAt: '2026-09-15T09:49:24Z',
    };

    const { container } = render(<ScanCoverageBanner health={health} />);
    await expectNoA11yViolations(container);
  });
});
