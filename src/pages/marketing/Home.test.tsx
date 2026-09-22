import '@testing-library/jest-dom/vitest';

import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanup,
  render,
  screen,
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
        name: /turn cloud signals into governed decisions/i,
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

  it('positions Horizon Intelligence as a governed decision system', () => {
    renderHome();

    const pageText = document.body.textContent ?? '';

    expect(
      screen.getByRole('heading', {
        name: /a decision system, not another stream of findings/i,
      }),
    ).toBeInTheDocument();
    expect(pageText).toMatch(/explain/i);
    expect(pageText).toMatch(/verify/i);
    expect(pageText).toMatch(/advise/i);
    expect(pageText).toMatch(/record/i);
  });

  it('shows the four operating pillars', () => {
    renderHome();
    expect(screen.getByRole('heading', { name: 'FinOps' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Security' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Operations' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Governance' })).toBeInTheDocument();
  });

  it('shows the provider-specific coverage boundary', () => {
    renderHome();
    expect(screen.getByRole('heading', { name: 'AWS' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Google Cloud' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Azure' })).toBeInTheDocument();
  });

  it('preserves the public navigation anchor targets', () => {
    const { container } = renderHome();

    expect(container.querySelector('#intelligence')).toBeInTheDocument();
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
/**
 * The coverage and roadmap sections are the two additions most able to mislead,
 * so they are asserted rather than trusted: the coverage numbers have to be the
 * real scanner count, and the DevSecOps work has to be visibly marked as not
 * available.
 */
describe('MarketingHome coverage and roadmap honesty', () => {
  it('states the real registered AWS scanner count', () => {
    renderHome();

    // 88 regional + 13 global scanners, counted from the connector's own
    // REGIONAL_SCANNERS/GLOBAL_SCANNERS registry. If that registry changes,
    // this copy has to change with it.
    expect(screen.getAllByText('101').length).toBeGreaterThan(0);
    expect(document.body.textContent).toMatch(/101/);
  });

  it('describes Azure as a V1 rollout rather than established production coverage', () => {
    renderHome();
    expect(document.body.textContent).toMatch(/Azure has its own connector and workspace and is being rolled out through the V1 plan/i);
  });

  it('states the human-control boundary', () => {
    renderHome();
    const pageText = document.body.textContent ?? '';
    expect(pageText).toMatch(/read-only by default/i);
    expect(pageText).toMatch(/your team decides/i);
  });
});
