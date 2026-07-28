import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Keeps a page's in-page tab state synced to a `?tab=` URL query param.
 * Without this, the sidebar's submenu links (navConfig.ts) and a page's own
 * tab buttons were two disconnected navigation systems — every submenu item
 * for a module pointed at the exact same bare URL, so clicking "Organizations"
 * in the sidebar just reloaded the AWS Accounts page on whatever tab was
 * already showing, never actually switching to the Organizations tab. Now
 * the sidebar links carry `?tab=<value>` and this hook is the single source
 * of truth both directions: reading the URL on load/back-forward, and
 * writing it back when a tab button is clicked in-page.
 */
export function useTabParam<T extends string>(tabs: readonly T[], defaultTab: T): [T, (tab: T) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const fromUrl = searchParams.get('tab');
  const current = fromUrl && (tabs as readonly string[]).includes(fromUrl) ? (fromUrl as T) : defaultTab;

  const setTab = useCallback((tab: T) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (tab === defaultTab) next.delete('tab');
        else next.set('tab', tab);
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams, defaultTab]);

  return [current, setTab];
}
