import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Keeps a page's in-page tab state synchronized with a `?tab=` query
 * parameter.
 *
 * This provides one URL-backed source of truth for:
 * - sidebar submenu navigation
 * - in-page tab buttons
 * - browser back/forward navigation
 * - bookmarked/shared tab URLs
 *
 * The hook validates URL values against the supplied tab catalogue, so an
 * unknown/stale tab never becomes an invalid application state.
 *
 * Query parameters unrelated to `tab` are preserved.
 */
export function useTabParam<T extends string>(
  tabs: readonly T[],
  defaultTab: T,
): readonly [T, (tab: T) => void] {
  const [searchParams, setSearchParams] = useSearchParams();

  const validTabs = useMemo(
    () => new Set<string>(tabs),
    [tabs],
  );

  const current = useMemo<T>(() => {
    const fromUrl = searchParams.get('tab');

    if (fromUrl !== null && validTabs.has(fromUrl)) {
      return fromUrl as T;
    }

    return defaultTab;
  }, [searchParams, validTabs, defaultTab]);

  const setTab = useCallback(
    (tab: T) => {
      // Defensively ignore a caller passing a value outside the current tab
      // catalogue. This protects the URL from becoming an invalid state even
      // when the runtime value came from an untyped boundary.
      if (!validTabs.has(tab)) {
        return;
      }

      setSearchParams(
        previous => {
          const next = new URLSearchParams(previous);

          if (tab === defaultTab) {
            next.delete('tab');
          } else {
            next.set('tab', tab);
          }

          return next;
        },
        { replace: true },
      );
    },
    [defaultTab, setSearchParams, validTabs],
  );

  return [current, setTab] as const;
}
