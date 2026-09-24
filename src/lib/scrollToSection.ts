/**
 * Height of the sticky marketing-page header in CSS pixels.
 *
 * Keep this as the single source of truth for imperative section scrolling.
 * The actual header should use the same value in its layout contract.
 */
export const STICKY_HEADER_OFFSET = 64;

/**
 * Scrolls to a marketing-page section by element id, accounting for the
 * sticky header.
 *
 * Returns `true` only when a valid target element was found and a scroll was
 * requested. Returns `false` when called outside a browser context or when the
 * target does not exist.
 *
 * The target's current document position is calculated at call time so the
 * helper remains correct after layout shifts above the section.
 */
export function scrollToSection(id: string): boolean {
  if (
    typeof document === 'undefined' ||
    typeof window === 'undefined'
  ) {
    return false;
  }

  const normalizedId = id.trim();

  if (!normalizedId) {
    return false;
  }

  const element = document.getElementById(normalizedId);

  if (!element) {
    return false;
  }

  const targetTop =
    element.getBoundingClientRect().top +
    window.scrollY -
    STICKY_HEADER_OFFSET;

  /**
   * Respect the user's reduced-motion preference. Smooth scrolling is a
   * navigation enhancement, not a requirement for the interaction.
   */
  const prefersReducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  window.scrollTo({
    top: Math.max(0, targetTop),
    behavior: prefersReducedMotion ? 'auto' : 'smooth',
  });

  return true;
}
