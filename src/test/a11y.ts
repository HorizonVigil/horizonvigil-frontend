import axe, { type AxeResults, type Result, type RunOptions } from 'axe-core';

/**
 * Accessibility assertions for component tests.
 *
 * WHAT THIS CAN AND CANNOT CATCH
 *
 * axe runs against jsdom, which has no layout engine: no element has a real
 * size, position, or computed colour. Rules that need any of those cannot
 * produce a trustworthy result here, so they are DISABLED rather than left
 * to pass vacuously. A suite that reports "no colour-contrast violations"
 * from an environment that cannot measure colour contrast is worse than one
 * that admits it did not check — it is the same false-clean problem this
 * codebase has been removing everywhere else.
 *
 * What remains is still the majority of WCAG's machine-checkable surface and
 * the part that catches real bugs in this app: unlabelled controls, missing
 * alt text, broken ARIA, inputs with no accessible name, headings out of
 * order, and duplicate ids.
 *
 * Layout-dependent rules need a real browser. `e2e/` already has Playwright
 * configured; running axe there is the follow-up, and is named in the
 * certification rather than implied by this file.
 */

/**
 * Rules jsdom cannot evaluate honestly. Each is disabled for a stated
 * reason, not because it was noisy.
 */
export const RULES_REQUIRING_LAYOUT = {
  /** Needs computed colour and font size; jsdom has neither. */
  'color-contrast': { enabled: false },
  /** Needs geometry to know whether a target is large enough. */
  'target-size': { enabled: false },
} as const;

export interface A11yOptions {
  /**
   * Additional rules to disable, each of which MUST be justified at the call
   * site. Suppressing a rule without a reason is how a suite quietly stops
   * testing the thing it was written for.
   */
  disable?: Record<string, { enabled: false; reason: string }>;
}

export interface A11yViolation {
  id: string;
  impact: string;
  help: string;
  nodes: number;
  targets: string[];
}

/** Runs axe over a container and returns violations in a readable shape. */
export async function findA11yViolations(container: Element, opts: A11yOptions = {}): Promise<A11yViolation[]> {
  const rules: RunOptions['rules'] = { ...RULES_REQUIRING_LAYOUT };
  for (const [id, cfg] of Object.entries(opts.disable ?? {})) rules[id] = { enabled: cfg.enabled };

  const results: AxeResults = await axe.run(container, {
    rules,
    // The rulesets a customer-facing product is actually held to.
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
  });

  return results.violations.map((v: Result) => ({
    id: v.id,
    impact: v.impact ?? 'unknown',
    help: v.help,
    nodes: v.nodes.length,
    targets: v.nodes.slice(0, 5).map((n) => String(n.target)),
  }));
}

/**
 * Asserts a container has no violations, failing with the specific rule and
 * element rather than a bare boolean — "expected true to be false" tells the
 * next person nothing about what to fix.
 */
export async function expectNoA11yViolations(container: Element, opts: A11yOptions = {}): Promise<void> {
  const violations = await findA11yViolations(container, opts);
  if (violations.length === 0) return;

  const detail = violations
    .map((v) => `  [${v.impact}] ${v.id}: ${v.help}\n    ${v.nodes} element(s), e.g. ${v.targets.join(', ')}`)
    .join('\n');
  throw new Error(`${violations.length} accessibility violation(s):\n${detail}`);
}
