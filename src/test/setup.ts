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
// documented `jsdom` global (see node_modules/vitest/jsdom.d.ts) rather than
// constructing a second, independent JSDOM instance that would disagree
// with the one actually backing `window` elsewhere in a test.
declare const jsdom: import('jsdom').JSDOM;
if (typeof localStorage === 'undefined' && typeof jsdom !== 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', { get: () => jsdom.window.localStorage, configurable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { get: () => jsdom.window.sessionStorage, configurable: true });
}
