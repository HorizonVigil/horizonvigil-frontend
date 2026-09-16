import '@testing-library/jest-dom/vitest';

import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { ThemeProvider } from '../../lib/theme';
import { MarketingHome } from './Home';

/**
 * Renders the real pre-login marketing homepage with only the providers
 * required by the page itself.
 *
 * MarketingHome is intentionally tested without application API/auth
 * providers because the page uses static marketing content and local state.
 */
function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <ThemeProvider>
        <MarketingHome />
      </ThemeProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
});

describe('MarketingHome', () => {
  it('renders the real homepage hero, primary CTAs, and footer', () => {
    renderHome();

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /one control plane for every aws and gcp account/i,
      }),
    ).toBeInTheDocument();

    const startFreeLinks = screen.getAllByRole('link', {
      name: /start free/i,
    });

    expect(startFreeLinks.length).toBeGreaterThan(0);

    const demoLinks = screen.getAllByRole('link', {
      name: /book a demo/i,
    });

    expect(demoLinks.length).toBeGreaterThan(0);

    for (const link of demoLinks) {
      expect(link).toHaveAttribute(
        'href',
        expect.stringContaining('mailto:'),
      );
    }

    expect(screen.getByText(/privacy/i)).toBeInTheDocument();
  });

  it('preserves the current eleven-module product claim', () => {
    renderHome();

    const pageText = document.body.textContent ?? '';

    expect(pageText).not.toMatch(/twelve modules/i);

    expect(
      screen.getByRole('heading', {
        name: /eleven modules\. one data model\./i,
      }),
    ).toBeInTheDocument();
  });

  it('provides an accessible and interactive How It Works tablist', () => {
    renderHome();

    const tablist = screen.getByRole('tablist', {
      name: /how it works/i,
    });

    const connectTab = within(tablist).getByRole('tab', {
      name: /connect/i,
    });

    const auditTab = within(tablist).getByRole('tab', {
      name: /audit/i,
    });

    expect(connectTab).toHaveAttribute('aria-selected', 'true');
    expect(auditTab).toHaveAttribute('aria-selected', 'false');

    const tabpanel = screen.getByRole('tabpanel');

    expect(tabpanel).toBeInTheDocument();
    expect(tabpanel).toHaveTextContent(/scoped access key/i);

    fireEvent.click(auditTab);

    expect(auditTab).toHaveAttribute('aria-selected', 'true');
    expect(connectTab).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tabpanel')).toHaveTextContent(
      /logged automatically/i,
    );
  });

  it('keeps the role selector limited to real product roles and updates the role view', () => {
    renderHome();

    expect(
      screen.getByRole('heading', {
        name: /same data, a different starting view for each role/i,
      }),
    ).toBeInTheDocument();

    const securityRoleButton = screen.getByRole('button', {
      name: 'Security & Compliance',
    });

    expect(securityRoleButton).toBeInTheDocument();

    fireEvent.click(securityRoleButton);

    expect(
      screen.getAllByText('Cloud Security').length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('preserves the public navigation anchor targets', () => {
    const { container } = renderHome();

    expect(container.querySelector('#platform')).toBeInTheDocument();
    expect(container.querySelector('#security')).toBeInTheDocument();
  });

  it('links the documentation preview to the real docs route', () => {
    renderHome();

    const docsLink = screen.getByRole('link', {
      name: /read the docs/i,
    });

    expect(docsLink).toHaveAttribute('href', '/docs');
  });
});
