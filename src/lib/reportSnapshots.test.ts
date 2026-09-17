import { describe, expect, it } from 'vitest';
import { NAV_MODULES } from './navConfig';
import { stripComments } from '../test/sourceCode';

/** Source-level guards must read code, never the prose documenting it. */
const code = stripComments;

/**
 * Phase 11 (§15.4): scheduled reports remain unavailable until a real delivery
 * engine exists.
 *
 * The regression protected here is architectural, not cosmetic:
 * - no UI control may create a schedule that cannot execute;
 * - no client API method should invite callers to persist an unsupported
 *   schedule;
 * - existing legacy schedules remain readable/deletable so customers are not
 *   trapped by the feature removal;
 * - report generation is preview-gated and scope/period-aware.
 *
 * These are source-level assertions because the relevant invariant is the
 * absence of a browser control/API contract, not a particular runtime result.
 */

const sources = import.meta.glob(
  ['../pages/Reports.tsx', './api.ts'],
  {
    query: '?raw',
    import: 'default',
    eager: true,
  },
) as Record<string, string>;

function source(endsWith: string): string {
  const hit = Object.entries(sources).find(([filePath]) =>
    filePath.endsWith(endsWith),
  );

  expect(
    hit,
    `source not found for ${endsWith}; verify the glob path and repository layout`,
  ).toBeTruthy();

  return hit![1];
}

function compact(text: string): string {
  return text.replace(/\s+/g, ' ');
}

describe('scheduled reports are not offered without a delivery engine', () => {
  const reports = code(source('/Reports.tsx'));
  const client = code(source('/api.ts'));
  const compactReports = compact(reports);
  const compactClient = compact(client);

  it('loads the expected source files', () => {
    expect(Object.keys(sources).some((path) => path.endsWith('/Reports.tsx'))).toBe(
      true,
    );
    expect(Object.keys(sources).some((path) => path.endsWith('/api.ts'))).toBe(
      true,
    );
  });

  it('has no Scheduled Reports tab', () => {
    const tabs =
      reports.match(
        /(?:const|let)\s+TABS\s*=\s*\[([\s\S]*?)\]/,
      ) ??
      reports.match(
        /TABS\s*:\s*readonly[^=]*=\s*\[([\s\S]*?)\]/,
      );

    expect(
      tabs,
      'Reports.tsx TABS declaration was not found; verify the source structure',
    ).toBeTruthy();

    expect(tabs![1]).not.toMatch(/Scheduled Reports/i);
  });

  it('has no Scheduled Reports navigation entry', () => {
    const reportsModule = NAV_MODULES.find(
      (module) => module.label === 'Reports',
    );

    expect(reportsModule).toBeTruthy();

    expect(
      reportsModule!.children.some(
        (child) => child.label === 'Scheduled Reports',
      ),
    ).toBe(false);
  });

  it('does not expose recurring cadence choices in the report form', () => {
    for (const cadence of [
      'daily',
      'weekly',
      'monthly',
      'quarterly',
    ]) {
      expect(
        reports,
        `${cadence} cadence is still present as a report-scheduling value`,
      ).not.toMatch(
        new RegExp(
          `(?:['"]${cadence}['"]|value\\s*=\\s*['"]${cadence}['"])`,
          'i',
        ),
      );
    }
  });

  it('does not offer generic schedule/save controls under alternate names', () => {
    const schedulingTerms = [
      /\bcreateScheduledReport\b/,
      /\bupdateScheduledReport\b/,
      /\bscheduleReport\b/,
      /\bsaveSchedule\b/,
      /\bcreateReportSchedule\b/,
    ];

    for (const term of schedulingTerms) {
      expect(reports, `unsupported scheduling API/control found: ${term}`).not.toMatch(
        term,
      );
    }
  });

  it('does not create or update scheduled reports from the client API', () => {
    for (const method of [
      'createScheduledReport',
      'updateScheduledReport',
      'scheduleReport',
      'saveSchedule',
      'createReportSchedule',
    ]) {
      expect(
        client,
        `${method} should not exist in the browser API`,
      ).not.toMatch(new RegExp(`\\b${method}\\s*\\(`));
    }
  });

  it('retains read/delete support for legacy scheduled reports', () => {
    expect(client).toMatch(/\bgetScheduledReports\s*\(/);
    expect(client).toMatch(/\bdeleteScheduledReport\s*\(/);
  });

  it('does not expose a scheduled-report UI action that invokes a delete/create mismatch', () => {
    /**
     * Legacy deletion is intentionally supported, but a "new schedule" path
     * must not remain hidden behind a generic submit handler.
     */
    expect(compactReports).not.toMatch(
      /(?:onSubmit|handleSubmit)[^]{0,1200}\b(?:createScheduledReport|saveSchedule|scheduleReport)\b/,
    );
  });

  it('passes an explicit report period and scope to generation/preview', () => {
    expect(reports).toMatch(/\bdateFrom\b/);
    expect(reports).toMatch(/\bdateTo\b/);
    expect(reports).toMatch(/\bscope\b/);

    expect(
      compactReports,
      'report generation should send date range and scope together',
    ).toMatch(
      /scope\s*:\s*\{[^}]*dateFrom[^}]*dateTo[^}]*\}|\bdateFrom\b[^]{0,500}\bdateTo\b[^]{0,500}\bscope\b/i,
    );
  });

  it('has a preview/capability check before generation', () => {
    expect(
      reports,
      'Reports.tsx should load or call a report preview/capability function',
    ).toMatch(/\b(?:previewReport|loadPreview)\s*\(/);

    expect(reports).toMatch(/\bcanGenerate\b/);
    expect(reports).toMatch(/\bblockedReason\b/);
  });

  it('disables generation when the server says the report cannot be generated', () => {
    expect(compactReports).toMatch(
      /\bpreview\??\.\s*canGenerate\s*===\s*false\b/,
    );
  });

  it('does not treat a missing preview as permission to generate', () => {
    /**
     * A failed/not-yet-loaded preview must not become an accidental fail-open
     * path where the submit button remains enabled.
     */
    expect(compactReports).not.toMatch(
      // `!preview` must mean the preview itself is absent -- NOT the prefix of
      // a field test such as `!preview.completeness.complete`, which is a
      // legitimate read of a preview that loaded fine. Without the boundary
      // this matched that field test and reported a fail-open that was not
      // there.
      /(?:!preview(?![\w.?])|preview\s*==\s*null|null\s*===\s*preview)[^;]{0,300}(?:canGenerate|Generate|generate)/i,
    );
  });

  it('keeps legacy scheduled rows visible when they still exist', () => {
    expect(compactReports).toMatch(
      /\bscheduled\.length\s*>\s*0\b/,
    );
    expect(reports).toMatch(/\bscheduledColumns\b/);
  });

  it('does not render a "new schedule" affordance alongside legacy deletion', () => {
    expect(compactReports).not.toMatch(
      /\bscheduled\.length\s*>\s*0[^]{0,1000}(?:New Schedule|Schedule Report|Create Schedule)/i,
    );
  });

  it('keeps the Reports module itself present and owned by the central navigation config', () => {
    const reportsModule = NAV_MODULES.find(
      (module) => module.label === 'Reports',
    );

    expect(reportsModule).toBeTruthy();
    expect(reportsModule!.to).toBe('/reports');
  });
});
