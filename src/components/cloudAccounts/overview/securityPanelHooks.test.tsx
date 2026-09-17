import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { SecurityPanel } from './SecurityPanel';
import { ThemeProvider } from '../../../lib/theme';

/**
 * `security` is null while the dashboard is loading and an object once it
 * arrives, so this component is re-rendered across that boundary on every
 * normal page load.
 *
 * The null branch returns early. Any hook declared after that early return is
 * therefore called on one render and not the other, and React compares hook
 * counts between renders of the same mounted component -- so the transition
 * throws "Rendered more hooks than during the previous render" and takes the
 * panel down with it.
 *
 * This test drives exactly that transition.
 */

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const LOADED = {
  openFindings: 3,
  bySeverity: { critical: 1, high: 2, medium: 0, low: 0 },
  riskScore: 55,
} as unknown as Parameters<typeof SecurityPanel>[0]['security'];

function wrap(security: Parameters<typeof SecurityPanel>[0]['security']) {
  return (
    <ThemeProvider>
      <MemoryRouter>
        <SecurityPanel security={security} />
      </MemoryRouter>
    </ThemeProvider>
  );
}

function renderPanel(security: Parameters<typeof SecurityPanel>[0]['security']) {
  return render(wrap(security));
}

describe('SecurityPanel hook order', () => {
  it('survives the null -> loaded transition without a hook-count error', () => {
    const { rerender } = renderPanel(null);

    expect(() => rerender(wrap(LOADED))).not.toThrow();
  });

  it('survives the loaded -> null transition', () => {
    const { rerender } = renderPanel(LOADED);

    expect(() => rerender(wrap(null))).not.toThrow();
  });
});
