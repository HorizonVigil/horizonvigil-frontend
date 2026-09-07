import { defineConfig } from 'vitest/config';

export default defineConfig({
  // .tsx added for component-render smoke tests, which need a DOM --
  // jsdom set globally rather than per-file (the `// @vitest-environment`
  // docblock pragma didn't take effect on this vitest version). Verified
  // the existing pure-logic .test.ts suite is unaffected by the switch
  // from the default 'node' environment (163/163 still pass).
  test: { include: ['src/**/*.test.{ts,tsx}'], environment: 'jsdom', setupFiles: ['src/test/setup.ts'] },
});
