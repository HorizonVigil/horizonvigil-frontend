export const STICKY_HEADER_OFFSET = 64;

/** Scrolls to a marketing-page section by id, accounting for the sticky
 * header height. Returns false if the element isn't in the DOM yet. */
export function scrollToSection(id: string): boolean {
  const el = document.getElementById(id);
  if (!el) return false;
  const top = el.getBoundingClientRect().top + window.scrollY - STICKY_HEADER_OFFSET;
  window.scrollTo({ top, behavior: 'smooth' });
  return true;
}
