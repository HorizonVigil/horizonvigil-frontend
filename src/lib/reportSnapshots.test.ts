import { describe, it, expect } from 'vitest';
import { NAV_MODULES } from './navConfig';

/**
 * Phase 11 (§15.4): scheduled reports are absent until a delivery engine
 * exists.
 *
 * The prior arrangement is what makes this worth a regression test. The
 * endpoints were storage-only — no cron trigger, no delivery worker — and
 * everyone involved knew it: the route carried a doc comment saying "do not
 * represent this endpoint as having live scheduling in any response or UI
 * copy", and the tab rendered an amber warning saying nothing would be
 * generated or emailed. Next to a working "New Report" button that saved a
 * schedule anyway.
 *
 * A disclosure beside a working control is not a gate. §15.4: "Do not save
 * schedules that will never execute."
 *
 * Source-level assertions, the same technique v2Isolation.test.ts uses.
 */
const sources = import.meta.glob(['../pages/Reports.tsx', './api.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function source(endsWith: string): string {
  const hit = Object.entries(sources).find(([path]) => path.endsWith(endsWith));
  expect(hit, `source not found for ${endsWith}`).toBeTruthy();
  return hit![1];
}

function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('scheduled reports are not offered', () => {
  const reports = code(source('/Reports.tsx'));

  it('has no Scheduled Reports tab', () => {
    const tabs = reports.match(/const TABS = \[([^\]]+)\]/);
    expect(tabs, 'TABS array not found').toBeTruthy();
    expect(tabs![1]).not.toContain('Scheduled Reports');
  });

  it('has no Scheduled Reports nav entry', () => {
    const reportsModule = NAV_MODULES.find((m) => m.label === 'Reports');
    expect(reportsModule).toBeTruthy();
    expect(reportsModule!.children.map((child) => child.label)).not.toContain('Scheduled Reports');
  });

  it('no longer offers a recurring cadence in New Report', () => {
    // The dropdown offered daily/weekly/monthly/quarterly beside a warning
    // that none of them would ever run.
    for (const cadence of ['daily', 'weekly', 'monthly', 'quarterly']) {
      expect(reports, `${cadence} still offered`).not.toMatch(new RegExp(`'${cadence}'`));
    }
  });

  it('never creates a schedule from the report form', () => {
    expect(reports).not.toMatch(/createScheduledReport/);
  });

  it('has no client method for creating or updating a schedule at all', () => {
    // Not just unused from this page -- removed. A client method for an
    // endpoint the server refuses is a call that can only ever fail, and
    // leaving it invites the next feature to reach for it.
    const client = code(source('/api.ts'));
    expect(client).not.toMatch(/createScheduledReport/);
    expect(client).not.toMatch(/updateScheduledReport/);
  });

  it('keeps the read and delete methods, so an old schedule can be removed', () => {
    const client = code(source('/api.ts'));
    expect(client).toMatch(/getScheduledReports/);
    expect(client).toMatch(/deleteScheduledReport/);
  });

  it('sends scope and period with the request, not just a name (§15.1)', () => {
    // "The current name/category/format-only request is insufficient."
    expect(reports).toMatch(/dateFrom/);
    expect(reports).toMatch(/dateTo/);
    expect(reports).toMatch(/scope: \{ dateFrom/);
  });

  it('previews before generating, so a refusal arrives before the click', () => {
    // Without this, a cost report over an unconfigured billing source is a
    // button press followed by a 409, and the reason lands after the
    // decision rather than before it.
    expect(reports).toMatch(/previewReport|loadPreview/);
    expect(reports).toMatch(/canGenerate/);
    expect(reports).toMatch(/blockedReason/);
  });

  it('disables the submit button when the server says it cannot generate', () => {
    expect(reports).toMatch(/preview\?\.canGenerate === false/);
  });

  it('still lets an org delete a schedule saved before this release', () => {
    // Removing the tab must not trap an org with a row it can neither run
    // nor delete. Renders only when such rows exist.
    expect(reports).toMatch(/scheduled\.length > 0/);
    expect(reports).toMatch(/scheduledColumns/);
  });
});
