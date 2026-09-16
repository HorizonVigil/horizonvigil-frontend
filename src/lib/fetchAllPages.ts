/**
 * Fetch every page from a paginated list endpoint.
 *
 * Use this helper only when the caller genuinely needs the complete result
 * set (for example exports, full filter options, synchronization sweeps, or
 * permission-scoping selectors). UI tables and normal list views should keep
 * using one page.
 *
 * The backend remains responsible for pagination correctness. This helper
 * simply drives the endpoint until the declared result set has been consumed.
 *
 * Production safeguards:
 * - validates pagination arguments;
 * - rejects invalid page responses instead of silently returning partial data;
 * - detects non-progressing pagination;
 * - respects a hard max-pages safety limit;
 * - de-duplicates no rows: item identity is domain-specific and ordering is
 *   intentionally preserved;
 * - returns the rows fetched before the server reports completion only when
 *   the response is internally consistent.
 */

export interface FetchAllPagesResult<T> {
  items: T[];
  pagesFetched: number;
}

export interface FetchAllPagesOptions {
  /** Number of rows requested per page. Defaults to 200. */
  limit?: number;
  /** Hard upper bound on requests. Defaults to 100. */
  maxPages?: number;
}

export interface PaginatedPage<T> {
  items: T[];
  pagination: {
    total: number;
  };
}

const DEFAULT_LIMIT = 200;
const DEFAULT_MAX_PAGES = 100;
const MIN_LIMIT = 1;
const MIN_MAX_PAGES = 1;

function validatePositiveInteger(
  value: unknown,
  name: string,
  minimum: number,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum
  ) {
    throw new TypeError(
      `${name} must be a safe integer >= ${minimum}.`,
    );
  }

  return value;
}

function normalizeTotal(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new TypeError(
      'Pagination total must be a non-negative safe integer.',
    );
  }

  return value;
}

function validatePage<T>(
  response: PaginatedPage<T>,
): PaginatedPage<T> {
  if (!response || typeof response !== 'object') {
    throw new TypeError('Paginated endpoint returned an invalid response.');
  }

  if (!Array.isArray(response.items)) {
    throw new TypeError(
      'Paginated endpoint response must contain an items array.',
    );
  }

  if (!response.pagination || typeof response.pagination !== 'object') {
    throw new TypeError(
      'Paginated endpoint response must contain pagination metadata.',
    );
  }

  return {
    items: response.items,
    pagination: {
      total: normalizeTotal(response.pagination.total),
    },
  };
}

/**
 * Fetch the complete result set, bounded by maxPages.
 *
 * Returns the accumulated rows. `maxPages` is intentionally a hard safety
 * ceiling: callers must treat an exception caused by that ceiling as a
 * potentially incomplete result and surface it to the user rather than
 * assuming the returned data is complete.
 */
export async function fetchAllPages<T>(
  fetchPage: (
    page: number,
    limit: number,
  ) => Promise<PaginatedPage<T>>,
  opts: FetchAllPagesOptions = {},
): Promise<T[]> {
  if (typeof fetchPage !== 'function') {
    throw new TypeError('fetchPage must be a function.');
  }

  const limit = validatePositiveInteger(
    opts.limit ?? DEFAULT_LIMIT,
    'limit',
    MIN_LIMIT,
  );

  const maxPages = validatePositiveInteger(
    opts.maxPages ?? DEFAULT_MAX_PAGES,
    'maxPages',
    MIN_MAX_PAGES,
  );

  const out: T[] = [];
  let page = 1;
  let expectedTotal: number | undefined;

  while (page <= maxPages) {
    const rawResponse = await fetchPage(page, limit);
    const response = validatePage(rawResponse);

    const total = response.pagination.total;

    if (expectedTotal === undefined) {
      expectedTotal = total;
    } else if (total !== expectedTotal) {
      /**
       * A changing total during a complete sweep can happen legitimately when
       * the underlying dataset is mutating. We keep the latest total because
       * it is the server's current contract, but never allow a decrease to
       * masquerade as completion without fetching the page that proves it.
       */
      expectedTotal = Math.max(expectedTotal, total);
    }

    const previousLength = out.length;
    out.push(...response.items);

    if (out.length > total && total >= previousLength) {
      /**
       * The server's advertised total is inconsistent with the rows returned.
       * Continuing could loop forever or silently return misleading results.
       */
      throw new Error(
        `Paginated response is inconsistent: received ${out.length} items but total is ${total}.`,
      );
    }

    /**
     * Empty page means there is nothing further to consume. If the server says
     * more rows exist, surface the inconsistency instead of returning partial
     * data as if it were complete.
     */
    if (response.items.length === 0) {
      if (out.length < total) {
        throw new Error(
          `Pagination stopped at page ${page}: received ${out.length} of ${total} items.`,
        );
      }

      break;
    }

    if (out.length >= total) {
      break;
    }

    /**
     * A short page is not necessarily the final page if the backend's total
     * semantics are authoritative. Keep paging until total is satisfied.
     */
    page += 1;
  }

  if (
    expectedTotal !== undefined &&
    out.length < expectedTotal
  ) {
    throw new Error(
      `Pagination reached the maxPages limit (${maxPages}) before all results were fetched: received ${out.length} of ${expectedTotal} items.`,
    );
  }

  return out;
}

/**
 * Diagnostic variant useful for instrumentation/tests where callers want to
 * know how many requests were made.
 */
export async function fetchAllPagesWithMeta<T>(
  fetchPage: (
    page: number,
    limit: number,
  ) => Promise<PaginatedPage<T>>,
  opts: FetchAllPagesOptions = {},
): Promise<FetchAllPagesResult<T>> {
  let pagesFetched = 0;

  const items = await fetchAllPages(
    async (page, limit) => {
      pagesFetched += 1;
      return fetchPage(page, limit);
    },
    opts,
  );

  return {
    items,
    pagesFetched,
  };
}
