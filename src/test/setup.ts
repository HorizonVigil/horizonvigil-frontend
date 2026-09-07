// Global vitest setup (see vitest.config.ts's `setupFiles`).
//
// Works around a real environment conflict, not an app bug: Node 22+ ships
// its own native, experimental `localStorage` global that requires
// `--localstorage-file` to actually function. Vitest's jsdom environment
// also defines a working `localStorage` on `window`, but under this
// Node/vitest/jsdom combination the two collide and the bare `localStorage`
// global ends up present-but-nonfunctional (`typeof localStorage ===
// 'undefined'` at read time) instead of jsdom's version winning. Confirmed
// via a minimal reproduction outside this app entirely (a bare `new
// JSDOM(...)` has a working `.window.localStorage`; only vitest's globalThis
// copy of it is broken) -- so this rebinds it explicitly from vitest's own
// documented `jsdom` global rather than constructing a second, independent
// JSDOM instance that would disagree with the one actually backing `window`
// elsewhere in a test.
//
// Worth knowing for whoever revisits this: vitest 2.1.9's own package.json
// declares `"jsdom": "^25.0.1"` as its tested peer range -- this repo has
// jsdom ^30.0.1 installed, a major version past what vitest 2.1.9 was built
// against, which is the likely deeper cause of the populateGlobal mismatch
// this file patches around. Pinning jsdom back to ^25, or upgrading vitest
// past this version once one exists with jsdom 30 support, would be the
// more thorough fix; this is the safe, narrow one for now.
//
// `/// <reference>` (not `import('jsdom')`) deliberately avoids needing
// @types/jsdom as a dependency just for this one ambient type -- vitest
// already ships this exact declaration for exactly this purpose.
/// <reference types="vitest/jsdom" />
if (typeof localStorage === 'undefined' && typeof jsdom !== 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', { get: () => jsdom.window.localStorage, configurable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { get: () => jsdom.window.sessionStorage, configurable: true });
}
