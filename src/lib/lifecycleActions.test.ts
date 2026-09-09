import { describe, it, expect } from 'vitest';

/**
 * §12.1: row actions must be state-aware. The audit found a DISCONNECTED
 * connection still offering Sync Now, Validate Permissions and Disconnect --
 * all three meaningless for it. Since Phase 3 the server also refuses a
 * collection run on a disconnected connection (409), so offering the control
 * guarantees an error.
 */
const sources = import.meta.glob(['../pages/CloudAccounts.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const page = Object.values(sources)[0];

describe('disconnected connections do not offer collection actions', () => {
  it('derives the disconnected state from the row', () => {
    expect(page).toMatch(/const isDisconnected = row\.status === 'disconnected'/);
  });

  it('hides Sync Now', () => {
    expect(page).toMatch(/\{!isDisconnected && \(\s*<button role="menuitem" onClick=\{\(\) => \{ setOpen\(false\); onSync\(\); \}\}/);
  });

  it('hides Validate Permissions', () => {
    expect(page).toMatch(/row\.provider === 'aws' && !isDisconnected/);
  });

  it('hides Disconnect, which would be a no-op that looks destructive', () => {
    expect(page).toMatch(/\{!isDisconnected && \(\s*<button role="menuitem" onClick=\{\(\) => \{ setOpen\(false\); onDisconnect\(\); \}\}/);
  });

  it('explains why the menu is empty rather than showing nothing', () => {
    // A menu that silently loses its items reads as a bug.
    expect(page).toMatch(/Disconnected — nothing is collected for this account/);
  });

  it('describes Sync Now as server-side work that survives closing the tab', () => {
    // The old tooltip said it "re-runs Discover Resources right now", which
    // described browser orchestration.
    expect(page).toMatch(/keeps running if you close this tab/);
  });
});
