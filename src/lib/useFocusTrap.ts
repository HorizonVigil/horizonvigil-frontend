import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function isHTMLElement(value: Element | null): value is HTMLElement {
  return value instanceof HTMLElement;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(element => {
    if (element.hasAttribute('disabled')) return false;
    if (element.getAttribute('aria-hidden') === 'true') return false;

    const style = window.getComputedStyle(element);

    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      element.getClientRects().length > 0
    );
  });
}

/**
 * Standard modal/drawer keyboard behavior:
 * - remembers the element that opened the overlay
 * - focuses the first usable control, or the container itself
 * - traps Tab / Shift+Tab inside the overlay
 * - closes on Escape
 * - restores focus to the triggering element when the overlay closes
 *
 * The returned ref should be attached to the dialog/drawer container.
 *
 * Accessibility note:
 * The dialog itself should still provide the appropriate `role`,
 * `aria-modal="true"`, accessible name, and labelled/described-by attributes.
 */
export function useFocusTrap(
  open: boolean,
  onClose: () => void,
): React.RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);

  // Keep the latest callback without forcing the keyboard listener to be
  // recreated every time a parent component creates a new callback reference.
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement;
    triggerRef.current = isHTMLElement(previouslyFocused)
      ? previouslyFocused
      : null;

    const container = containerRef.current;

    if (!container) {
      return () => {
        restoreFocus(triggerRef.current);
        triggerRef.current = null;
      };
    }

    // Move focus after the current render has committed. This also gives
    // dialogs containing auto-focused controls a chance to settle.
    const focusTimer = window.setTimeout(() => {
      const currentContainer = containerRef.current;

      if (!currentContainer) return;

      const focusable = getFocusableElements(currentContainer);
      const target = focusable[0] ?? currentContainer;

      if (
        target === currentContainer &&
        !currentContainer.hasAttribute('tabindex')
      ) {
        currentContainer.setAttribute('tabindex', '-1');
      }

      target.focus({ preventScroll: true });
    }, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      const currentContainer = containerRef.current;

      if (!currentContainer) return;

      // Only handle keyboard events while focus is inside this active trap.
      // This prevents an unmounted/hidden overlay from hijacking Escape.
      const target = event.target;

      if (
        target instanceof Node &&
        !currentContainer.contains(target)
      ) {
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = getFocusableElements(currentContainer);

      if (focusable.length === 0) {
        event.preventDefault();
        currentContainer.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      // Focus may be moved programmatically to the container itself or to a
      // descendant that is not currently focusable. Normalize the next Tab
      // transition rather than allowing focus to escape the overlay.
      if (event.shiftKey) {
        if (active === first || !currentContainer.contains(active)) {
          event.preventDefault();
          last.focus({ preventScroll: true });
        }
      } else if (active === last || !currentContainer.contains(active)) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown, true);

      restoreFocus(triggerRef.current);
      triggerRef.current = null;
    };
  }, [open]);

  return containerRef;
}

function restoreFocus(element: HTMLElement | null): void {
  if (!element) return;

  // Do not steal focus from a newer interaction if the original trigger was
  // removed/disabled while the dialog was open.
  if (
    !element.isConnected ||
    element.hasAttribute('disabled') ||
    element.getAttribute('aria-hidden') === 'true'
  ) {
    return;
  }

  try {
    element.focus({ preventScroll: true });
  } catch {
    // Some custom elements/browsers may reject focus options. The overlay
    // should never fail to unmount merely because focus restoration failed.
    try {
      element.focus();
    } catch {
      // Best-effort focus restoration.
    }
  }
}
