import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (relative: string) =>
  readFileSync(resolve(process.cwd(), 'src', relative), 'utf8').replace(/\r/g, '');

describe('production runtime integrity', () => {
  it('keeps the complete authenticated application router as the entrypoint', () => {
    const app = source('App.tsx');
    const requiredRoutes = [
      '/overview',
      '/cloud-accounts',
      '/resources',
      '/finops',
      '/cloud-security',
      '/cloud-compliance',
      '/ai-copilot',
      '/reports',
      '/settings',
      '/organization',
    ];

    expect(app).toContain('<BrowserRouter>');
    expect(app).toContain('<ProtectedRoute>');
    for (const route of requiredRoutes) expect(app).toContain(`path="${route}`);
    expect((app.match(/<Route\b/g) ?? []).length).toBeGreaterThanOrEqual(35);
    expect(app).not.toContain("from './router'");
  });

  it('does not ship mock checkout or placeholder application routes', () => {
    const runtime = [
      source('App.tsx'),
      source('lib/api.ts'),
      source('lib/featureFlags.ts'),
      source('routes/lazyRoutes.ts'),
      source('routes/lazyRoutes.manifest.ts'),
    ].join('\n');

    expect(runtime).not.toMatch(/MockCheckout|mockCompleteCheckout|mock-checkout|VITE_MOCK_CHECKOUT_ENABLED/);
    expect(runtime).not.toMatch(/Architecture Placeholder|\[Placeholder for an Architecture Diagram/);
  });

  it('makes simulated data unavailable in production and keeps V2 demo pages out of V1 routes', () => {
    const demoContext = source('lib/demoData/context.tsx');
    const routeManifest = source('routes/lazyRoutes.manifest.ts');

    expect(demoContext).toContain("import.meta.env.MODE !== 'production'");
    expect(demoContext).toContain('if (!demoDataAvailable) return false');
    expect(routeManifest).not.toMatch(/VulnerabilityManagement|VulnerabilityDetail|demoData/);
  });
});
