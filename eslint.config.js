// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

/**
 * ESLint was not configured in this repository at all — no config, no
 * dependency, no script — so nothing had ever been statically analysed beyond
 * `tsc`. The rules below are deliberately the recommended sets rather than a
 * hand-picked selection: a ruleset assembled to fit the existing code would
 * only ratify whatever is already there.
 *
 * Two additions beyond the defaults, both chosen because they catch classes of
 * defect this codebase has actually shipped:
 *
 * - `react-hooks/exhaustive-deps` as an ERROR, not the default warning. Stale
 *   closures and missing cleanup are exactly what the production-readiness
 *   review asks about, and a warning in a repo with no lint step is invisible.
 * - `no-console` limited to warn/error/debug. `console.error` is the real
 *   reporting path for the error boundaries, so banning it outright would push
 *   people toward swallowing errors instead.
 */
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      // Emitted by `tsc -b` from tsconfig.node.json; not authored source.
      'vite.config.js',
      'vite.config.d.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.es2021 },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // ── Correctness rules: errors, and all currently clean ──────────────
      // rules-of-hooks caught four conditional useCallbacks in OverviewPanel
      // and two in SecurityPanel. Those were real crashes: hooks declared
      // after an early return change the hook count between renders, and the
      // loading -> loaded transition threw "Rendered more hooks than during
      // the previous render". Reproduced in securityPanelHooks.test.tsx.
      'react-hooks/exhaustive-deps': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/refs': 'error',

      /*
       * ── React Compiler rules: OFF, because the compiler is not enabled ──
       *
       * vite.config.ts runs @vitejs/plugin-react with no
       * babel-plugin-react-compiler, so these rules report compiler
       * ELIGIBILITY, not defects. Each was reviewed before being switched
       * off rather than disabled in bulk:
       *
       * - purity (3): `Date.now()` read during render to decide whether a
       *   sync is stale. Recomputing that per render is the intended
       *   behaviour; memoising it would freeze "now".
       * - immutability (1): a local `cumulative` accumulator inside Donut's
       *   arc calculation. Deterministic and confined to one map().
       * - static-components (1): WidgetFrame renders a component resolved
       *   from the widget registry. Dynamic by design.
       * - preserve-manual-memoization (4): reports that the compiler could
       *   not preserve an existing useMemo. Meaningless without the compiler.
       *
       * If React Compiler is ever adopted, turn these back on first — they
       * are the adoption checklist.
       */
      'react-hooks/purity': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/preserve-manual-memoization': 'off',

      /*
       * ── set-state-in-effect: WARN, and tracked ─────────────────────────
       *
       * 107 occurrences across 52 files. These are true positives of a real
       * anti-pattern (a synchronous setState in an effect body causes a
       * second render pass), but they are this application's entire
       * data-loading shape: `useEffect(() => { void load(); }, [load])`,
       * where `load` sets a loading flag before awaiting.
       *
       * It is a warning rather than an error because converting 52 files to
       * a fetch-on-render or query-library shape is an architectural change,
       * and bundling that into a correctness pass would make both harder to
       * review. It is NOT silenced: it stays visible on every lint run and
       * is reported as an open performance item.
       */
      'react-hooks/set-state-in-effect': 'warn',

      // Unused code is dead code. `_`-prefixed args stay allowed so a callback
      // can keep a positional signature it does not use.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // `any` defeats the point of the typecheck gate.
      '@typescript-eslint/no-explicit-any': 'error',

      'no-console': ['error', { allow: ['error', 'warn'] }],

      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },

  {
    // Plain browser scripts served from /public. They are not modules and are
    // not part of the TS project, so they need the browser globals declared.
    files: ['public/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { ...globals.browser },
    },
  },

  {
    // Tests legitimately reach for shapes the app never builds, and a test
    // file is not a fast-refresh boundary.
    files: ['**/*.test.{ts,tsx}', 'src/test/**/*', 'e2e/**/*'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      'react-refresh/only-export-components': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },
);
