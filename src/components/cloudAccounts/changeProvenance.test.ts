import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * AWS-22.1 — the change feed says HOW a change was made, not just who.
 *
 * Before this, `who` was `username ?? userIdentityType`, so a Terraform
 * change showed an IAM role name and an Auto Scaling replacement showed
 * "AssumedRole". A security group changed by IaC at 14:00 and the same change
 * made by hand in the console at 02:00 rendered identically, while demanding
 * completely different responses.
 *
 * Source-level: the value here is in the rendering rules, which are readable
 * without mounting the panel and its React Query stack.
 */
const PANEL = readFileSync('src/components/cloudAccounts/ChangesPanel.tsx', 'utf8');
const API = readFileSync('src/lib/api.ts', 'utf8');

describe('the change feed surfaces provenance', () => {
  it('carries the server classification rather than re-deriving it', () => {
    // Re-deriving in the browser would let the two disagree about the same
    // event, and the server is where the raw CloudTrail detail actually is.
    expect(PANEL).toContain('provenance: event.provenance');
    expect(PANEL).toContain('ActorBadge');
    expect(PANEL).not.toMatch(/userAgent\s*\.\s*(includes|match)/);
  });

  it('types the classification instead of accepting any shape', () => {
    expect(API).toContain('export interface ChangeProvenance');
    expect(API).toMatch(/actorClass:\s*'human' \| 'automation' \| 'aws_service' \| 'unknown'/);
  });

  it('projects invokedBy, the only signal naming an AWS-initiated change', () => {
    expect(API).toMatch(/invokedBy:\s*string \| null/);
  });

  /**
   * The honesty rule at the render layer. `unknown` means a signal was
   * missing, not that the change is suspicious -- colouring it as a warning
   * would train people to chase CloudTrail's gaps instead of their estate.
   */
  it('does not style an unattributed change as a problem', () => {
    const badge = /function ActorBadge[\s\S]*?\n}/.exec(PANEL)?.[0] ?? '';
    expect(badge).toBeTruthy();
    expect(badge).not.toMatch(/red|danger|destructive/i);
  });

  it('never prints "unknown" as if it were a person', () => {
    const badge = /function ActorBadge[\s\S]*?\n}/.exec(PANEL)?.[0] ?? '';
    expect(badge).toContain('Unattributed');
  });

  it('exposes the reason behind every verdict', () => {
    // A classification a reviewer cannot interrogate is a claim, not evidence.
    const badge = /function ActorBadge[\s\S]*?\n}/.exec(PANEL)?.[0] ?? '';
    expect(badge).toMatch(/title=\{provenance\.summary\}/);
  });

  /**
   * GCP and Azure feeds do not carry CloudTrail's signals. Rendering an
   * 'unknown' badge for them would claim we classified something we never
   * looked at -- so the field is optional and simply absent.
   */
  it('does not fabricate a badge for providers it never classified', () => {
    expect(PANEL).toMatch(/provenance\?: ChangeProvenance/);
    expect(PANEL).toContain('{event.provenance ? (');
  });

  it('keeps the raw actor line alongside the badge', () => {
    // The badge is the verdict; `who` is what a reviewer checks it against.
    expect(PANEL).toContain('<span>{who}</span>');
  });
});
