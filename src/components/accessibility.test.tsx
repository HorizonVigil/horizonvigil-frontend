import { describe, it, expect, afterEach } from 'vitest';
import { render as rtlRender, cleanup, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../lib/theme';
import { expectNoA11yViolations, findA11yViolations, RULES_REQUIRING_LAYOUT } from '../test/a11y';
import { Badge } from './Badge';
import { EmptyState } from './EmptyState';
import { AccessDenied } from './AccessDenied';
import { DataTable, type Column } from './DataTable';

/**
 * Accessibility baseline.
 *
 * This repo had ZERO accessibility tests. This is a starting floor over the
 * shared primitives that appear on nearly every screen — a violation in
 * `DataTable` or `EmptyState` is a violation repeated across dozens of pages,
 * so these are the highest-leverage components to hold.
 *
 * It is a floor, not coverage. What it does NOT cover is stated in the
 * certification rather than left to be assumed: full pages, routed views,
 * focus management through real interactions, and every layout-dependent
 * rule (see RULES_REQUIRING_LAYOUT — jsdom has no layout engine, so those are
 * disabled rather than allowed to pass vacuously).
 */
afterEach(cleanup);

/**
 * Components under test are rendered inside the providers the real app
 * supplies. Two of these (Badge via useTheme, AccessDenied via react-router)
 * threw without them -- which is itself worth knowing: a component that
 * cannot render outside its providers cannot be accessibility-tested in
 * isolation either, and stubbing the providers away would have tested a
 * different component than the one that ships.
 */
function render(ui: React.ReactElement) {
  return rtlRender(<ThemeProvider><MemoryRouter>{ui}</MemoryRouter></ThemeProvider>);
}

describe('the harness is honest about what it cannot check', () => {
  it('disables layout-dependent rules rather than passing them vacuously', () => {
    /**
     * jsdom cannot compute colour or geometry. A suite reporting "no
     * colour-contrast violations" from an environment that cannot measure
     * contrast is the same false-clean problem this codebase keeps removing.
     */
    expect(RULES_REQUIRING_LAYOUT['color-contrast'].enabled).toBe(false);
    expect(RULES_REQUIRING_LAYOUT['target-size'].enabled).toBe(false);
  });

  it('actually detects a real violation, so a pass is not vacuous', async () => {
    // Without this, every assertion below could be passing because axe never
    // ran. An <img> with no alt text is an unambiguous WCAG failure.
    const { container } = render(<img src="/x.png" />);
    const violations = await findA11yViolations(container);
    expect(violations.map((v) => v.id)).toContain('image-alt');
  });

  it('names the rule and element when it fails', async () => {
    const { container } = render(
      <div>
        <input type="text" />
      </div>,
    );
    await expect(expectNoA11yViolations(container)).rejects.toThrow(/accessibility violation/);
  });
});

describe('shared primitives', () => {
  it('Badge has no violations', async () => {
    const { container } = render(<Badge tone="good">Connected</Badge>);
    await expectNoA11yViolations(container);
  });

  it('EmptyState has no violations, including its action button', async () => {
    const { container } = render(
      <EmptyState
        title="No cloud accounts yet"
        description="Connect an AWS account to start collecting inventory."
        action={{ label: 'Connect account', onClick: () => {} }}
      />,
    );
    await expectNoA11yViolations(container);
    // The action must be a real, nameable control -- an icon-only div with a
    // click handler passes axe's structural rules but is unusable by anyone
    // navigating with a keyboard or screen reader.
    expect(screen.getByRole('button', { name: /connect account/i })).toBeTruthy();
  });

  it('AccessDenied has no violations', async () => {
    const { container } = render(<AccessDenied />);
    await expectNoA11yViolations(container);
  });
});

describe('DataTable', () => {
  interface Row { id: string; name: string; region: string }
  const rows: Row[] = [
    { id: '1', name: 'prod-web', region: 'us-east-1' },
    { id: '2', name: 'prod-db', region: 'eu-west-1' },
  ];
  const columns: Column<Row>[] = [
    { key: 'name', header: 'Name', render: (r) => r.name, sortValue: (r) => r.name },
    { key: 'region', header: 'Region', render: (r) => r.region },
  ];

  it('has no violations with rows', async () => {
    /**
     * The highest-leverage component in the app: a table-structure or
     * header-association violation here repeats on every inventory, findings
     * and cost screen.
     */
    const { container } = render(<DataTable rows={rows} columns={columns} rowKey={(r) => r.id} />);
    await expectNoA11yViolations(container);
  });

  it('has no violations when empty', async () => {
    // The empty state is a different render path and is where a table
    // frequently loses its header semantics.
    const { container } = render(<DataTable rows={[]} columns={columns} rowKey={(r: Row) => r.id} />);
    await expectNoA11yViolations(container);
  });

  it('exposes column headers to assistive technology', async () => {
    render(<DataTable rows={rows} columns={columns} rowKey={(r) => r.id} />);
    // getByRole('columnheader') fails if the header is a styled div rather
    // than a real <th>, which axe alone would not flag.
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Name', 'Region']);
  });
});
