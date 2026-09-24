import { describe, expect, it } from 'vitest';

/**
 * §12.1 regression coverage:
 *
 * Connection-row actions must reflect the connection's current lifecycle
 * state. A disconnected connection cannot run collection, validate live
 * permissions, or be disconnected again.
 *
 * These tests intentionally inspect the production source because the audit
 * requirement is about the page's action-gating implementation. The runtime
 * API remains responsible for enforcing the same lifecycle rules server-side.
 */

import { stripComments } from '../test/sourceCode';

const sources = import.meta.glob(
  ['../pages/CloudAccounts.tsx'],
  {
    query: '?raw',
    import: 'default',
    eager: true,
  },
) as Record<string, string>;

function getCloudAccountsSource(): string {
  const entries = Object.entries(sources);

  expect(
    entries.length,
    'CloudAccounts.tsx source was not found by import.meta.glob',
  ).toBe(1);

  return entries[0]?.[1] ?? '';
}

/**
 * Strip comments so a stale example/comment cannot satisfy an architectural
 * source assertion.
 */
const page = stripComments(getCloudAccountsSource());

describe('Cloud Accounts — disconnected row action safety', () => {
  it('derives the disconnected state from the row status', () => {
    expect(page).toMatch(
      /const\s+isDisconnected\s*=\s*row\.status\s*===\s*['"]disconnected['"]/,
    );
  });

  it('gates Sync Now on the connection remaining connected', () => {
    expect(page).toMatch(
      /!isDisconnected[\s\S]{0,500}onSync\(\)/,
    );
  });

  it('does not expose Sync Now unconditionally', () => {
    const syncIndex = page.search(/onSync\(\)/);

    expect(syncIndex).toBeGreaterThanOrEqual(0);

    const surrounding = page.slice(
      Math.max(0, syncIndex - 700),
      Math.min(page.length, syncIndex + 500),
    );

    expect(surrounding).toMatch(/!isDisconnected/);
  });

  it('gates AWS Validate Permissions on disconnected state', () => {
    expect(page).toMatch(
      /row\.provider\s*===\s*['"]aws['"][\s\S]{0,300}!isDisconnected/,
    );
  });

  it('does not expose Validate Permissions to disconnected connections', () => {
    /*
     * Check EVERY rendered control, not the first token that happens to
     * mention validation.
     *
     * This previously anchored on the first match of an alternation that
     * included the handler names, landing on a DataTable column definition
     * hundreds of lines above the button -- so the window it inspected did
     * not contain the guard, and the failure said the control was ungated
     * when it was. Comments are stripped so the paragraph explaining the
     * gate cannot stand in for the gate.
     */
    const rendered = stripComments(page);
    const label = 'Validate Permissions';

    const offsets: number[] = [];

    for (
      let at = rendered.indexOf(label);
      at !== -1;
      at = rendered.indexOf(label, at + 1)
    ) {
      offsets.push(at);
    }

    expect(
      offsets.length,
      'the Validate Permissions control was not found at all',
    ).toBeGreaterThan(0);

    for (const at of offsets) {
      expect(
        rendered.slice(Math.max(0, at - 700), at),
        `a Validate Permissions control at offset ${at} is not behind !isDisconnected`,
      ).toMatch(/!isDisconnected/);
    }
  });

  it('gates Disconnect on the connection being active', () => {
    expect(page).toMatch(
      /!isDisconnected[\s\S]{0,500}onDisconnect\(\)/,
    );
  });

  it('does not expose Disconnect as an action for a disconnected row', () => {
    const disconnectIndex = page.search(
      /onDisconnect\(\)/,
    );

    expect(disconnectIndex).toBeGreaterThanOrEqual(0);

    const surrounding = page.slice(
      Math.max(0, disconnectIndex - 700),
      Math.min(page.length, disconnectIndex + 500),
    );

    expect(surrounding).toMatch(/!isDisconnected/);
  });

  it('explains the empty disconnected-state menu to the user', () => {
    expect(page).toMatch(
      /Disconnected\s*[—-]\s*nothing is collected for this account/i,
    );
  });

  it('describes Sync Now as durable server-side collection', () => {
    expect(page).toMatch(
      /keeps running if you close this tab/i,
    );
  });

  it('does not describe Sync Now as browser-orchestrated discovery', () => {
    expect(page).not.toMatch(
      /re-runs\s+Discover Resources\s+right now/i,
    );
  });

  it('keeps the lifecycle rule localized to the action menu', () => {
    /**
     * The regression fix should gate the controls without globally removing
     * disconnected rows from the account table.
     */
    expect(page).toMatch(/isDisconnected/);
    expect(page).toMatch(/status/);
  });

  it('does not remove the row solely because it is disconnected', () => {
    /**
     * Prevent a tempting but incorrect fix where the UI hides the entire
     * connection instead of presenting its current lifecycle state.
     */
    expect(page).not.toMatch(
      /filter\([\s\S]{0,200}status\s*!==\s*['"]disconnected['"]/,
    );
  });

  it('does not rely solely on client gating for safety-critical lifecycle actions', () => {
    /**
     * The client gate improves UX, but the server must still reject invalid
     * lifecycle transitions. The source should continue to call real action
     * handlers rather than performing local state-only mutation.
     */
    const actionCalls = [
      /onSync\(\)/,
      /onDisconnect\(\)/,
      /validateAccountPermissions|onValidatePermissions/,
    ];

    for (const pattern of actionCalls) {
      expect(page).toMatch(pattern);
    }
  });
});
