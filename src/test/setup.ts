// Global vitest setup (see vitest.config.ts's `setupFiles`).

// `@testing-library/jest-dom` is a declared dependency of this repo but was
// never registered, so every `toBeInTheDocument` / `toBeEmptyDOMElement`
// assertion failed with "Invalid Chai property". That reads like a broken
// component, not a missing matcher, which is how ten real ScanCoverageBanner
// assertions were left red for the wrong reason.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Unmount between tests. Without this, a component rendered by an earlier
// test stays in document.body and the next `getByText` finds two matches --
// "Found multiple elements" is a leaked render, not a duplicated element.
afterEach(() => {
  cleanup();
});

/*
 * A localStorage/sessionStorage shim used to live here.
 *
 * Under vitest 2.1.9 the bare `localStorage` global came out
 * present-but-nonfunctional, because that release declared `jsdom ^25` as its
 * tested peer while this repo runs jsdom 30, and the two disagreed about
 * populating globals. The shim rebound both from vitest's own `jsdom` global.
 *
 * Its own note said the thorough fix was to upgrade vitest once a release
 * supported jsdom 30. That upgrade has now happened (vitest 5, taken to clear
 * the @vitest/mocker path-traversal advisory), and the shim was verified
 * unnecessary by removing it and running the full suite: 596/596 still pass.
 * It is gone rather than left behind as cargo.
 */
