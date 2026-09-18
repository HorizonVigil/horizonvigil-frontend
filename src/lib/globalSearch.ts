import { useEffect, useRef, useState } from 'react';

import { api } from './api';

/**
 * Global search across real data, for the command palette.
 *
 * The palette could previously only jump to a page -- it searched navigation
 * labels, so "i-0abc123" or the name of an account found nothing. On an estate
 * with thousands of resources, a search that only knows page names is a
 * table-of-contents, not a search.
 *
 * WHAT THIS DOES NOT DO
 *
 * It invents no endpoint. Both sources already exist and are already used
 * elsewhere in the product:
 *   - api.searchResources(q)  -> /api/resources/search
 *   - api.getAccounts({search}) -> the connector account list
 *
 * There is no cross-entity search API, so this queries the two that exist and
 * merges them client-side. If one fails, its section says so rather than
 * silently contributing nothing -- a search that quietly drops a whole source
 * reads as "no such resource", which is the wrong answer.
 */

export type GlobalSearchKind = 'resource' | 'account';

export interface GlobalSearchHit {
  id: string;
  kind: GlobalSearchKind;
  label: string;
  /** Secondary line: provider, type, region — whatever identifies it. */
  detail: string;
  to: string;
}

export interface GlobalSearchState {
  hits: GlobalSearchHit[];
  loading: boolean;
  /** Sources that could not be read, named so the UI can say which. */
  failedSources: string[];
  /** True when the backend capped the result set. */
  capped: boolean;
}

const EMPTY: GlobalSearchState = {
  hits: [],
  loading: false,
  failedSources: [],
  capped: false,
};

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;
const PER_SOURCE_LIMIT = 8;

/**
 * @param query Raw user input.
 * @param enabled Skip all work when the palette is closed.
 */
export function useGlobalSearch(query: string, enabled: boolean): GlobalSearchState {
  const [state, setState] = useState<GlobalSearchState>(EMPTY);

  /*
   * Guards against a slow earlier request overwriting a newer one. Without
   * it, typing "ec2" then "ec2-prod" can render the results for "ec2" last.
   */
  const requestRef = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();

    if (!enabled || trimmed.length < MIN_QUERY_LENGTH) {
      setState(EMPTY);
      return;
    }

    const requestId = ++requestRef.current;
    let cancelled = false;

    setState((s) => ({ ...s, loading: true }));

    const timer = window.setTimeout(() => {
      void (async () => {
        const [resourceResult, accountResult] = await Promise.allSettled([
          api.searchResources(trimmed),
          api.getAccounts({ search: trimmed, limit: PER_SOURCE_LIMIT }),
        ]);

        if (cancelled || requestId !== requestRef.current) return;

        const hits: GlobalSearchHit[] = [];
        const failedSources: string[] = [];
        let capped = false;

        if (resourceResult.status === 'fulfilled') {
          capped = Boolean(resourceResult.value.capped);

          for (const r of resourceResult.value.items.slice(0, PER_SOURCE_LIMIT)) {
            hits.push({
              id: `resource:${r.id}`,
              kind: 'resource',
              label: r.resource_name || r.resource_id,
              detail: [r.resource_type_key, r.region].filter(Boolean).join(' · '),
              to: `/resources/all?q=${encodeURIComponent(r.resource_id)}`,
            });
          }
        } else {
          failedSources.push('resources');
        }

        if (accountResult.status === 'fulfilled') {
          for (const a of accountResult.value.items.slice(0, PER_SOURCE_LIMIT)) {
            hits.push({
              id: `account:${a.id}`,
              kind: 'account',
              label: a.connection_name || a.aws_account_id,
              detail: ['AWS', a.aws_account_id, a.status].filter(Boolean).join(' · '),
              to: `/cloud-accounts/${a.id}`,
            });
          }
        } else {
          failedSources.push('cloud accounts');
        }

        setState({ hits, loading: false, failedSources, capped });
      })();
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, enabled]);

  return state;
}
