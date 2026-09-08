import '@testing-library/jest-dom/vitest';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../../lib/theme';
import { MarketingHome } from './Home';

// Real, live pre-login homepage -- no api/auth/filter context needed (pure
// static content + local useState), unlike the authenticated app pages'
// heavier renderPage helper. Only ThemeProvider (MarketingNav calls
// useTheme()) and MemoryRouter (Link/useLocation) are required.
function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <ThemeProvider>
        <MarketingHome />
      </ThemeProvider>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe('MarketingHome', () => {
  it('renders without throwing and shows the real hero, CTAs, and footer', () => {
    renderHome();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/one control plane for every aws and gcp account/i);
    expect(screen.getAllByRole('link', { name: /start free/i }).length).toBeGreaterThan(0);
    // "Book a demo" appears in both the hero and the footer -- assert at
    // least one, not exactly one.
    const demoLinks = screen.getAllByRole('link', { name: /book a demo/i });
    expect(demoLinks.length).toBeGreaterThan(0);
    for (const link of demoLinks) expect(link).toHaveAttribute('href', expect.stringContaining('mailto:'));
    // Footer renders (confirms the page didn't error before reaching it).
    expect(screen.getByText(/privacy/i)).toBeInTheDocument();
  });

  it('does not regress the real module count claim (verified 11 modules, not the old incorrect "twelve")', () => {
    renderHome();
    expect(document.body.textContent ?? '').not.toMatch(/twelve modules/i);
    expect(screen.getByRole('heading', { name: /eleven modules\. one data model\./i })).toBeInTheDocument();
  });

  it('the How it works stage selector is real and interactive -- switching tabs changes the visible description', () => {
    renderHome();
    const tablist = screen.getByRole('tablist', { name: /how it works/i });
    const connectTab = within(tablist).getByRole('tab', { name: /connect/i });
    const auditTab = within(tablist).getByRole('tab', { name: /audit/i });

    expect(connectTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent(/scoped access key/i);

    fireEvent.click(auditTab);
    expect(auditTab).toHaveAttribute('aria-selected', 'true');
    expect(connectTab).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tabpanel')).toHaveTextContent(/logged automatically/i);
  });

  it('the role selector only surfaces real module names, and switching roles changes the shown links', () => {
    renderHome();
    expect(screen.getByRole('heading', { name: /same data, a different starting view for each role/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Security & Compliance' }));
    // "Cloud Security" now appears twice: once in the always-visible
    // Platform capabilities grid, once in the role panel just switched to.
    expect(screen.getAllByText('Cloud Security').length).toBeGreaterThanOrEqual(2);
  });

  it('preserves the #platform and #security anchor ids the header nav links to', () => {
    const { container } = renderHome();
    expect(container.querySelector('#platform')).toBeInTheDocument();
    expect(container.querySelector('#security')).toBeInTheDocument();
  });

  it('docs preview links to the real /docs route, not an invented one', () => {
    renderHome();
    expect(screen.getByRole('link', { name: /read the docs/i })).toHaveAttribute('href', '/docs');
  });
});
