/**
 * Loops a paginated list endpoint until every matching row is fetched, for
 * callers that genuinely need the full result set (an export, an org-wide
 * filter dropdown, an auto-sync sweep, a permission-scoping account picker)
 * rather than one page to render. The backend already paginates correctly
 * per request (every `GET /accounts`-shaped route uses the shared
 * `parsePagination`/`paginatedEnvelope` helpers) -- this just drives it to
 * completion instead of assuming everything fits in one request, which was
 * the actual bug: several callers fetched once with a large `limit` and
 * silently got the server's per-request cap back instead of the real total.
 *
 * `maxPages` is a hard safety backstop (default 100 pages) against a
 * runaway loop if a backend ever returns an inconsistent/non-advancing
 * total -- at the default 200-per-page size that's a 20,000-row ceiling,
 * comfortably above any account count a real customer has connected today.
 */
export async function fetchAllPages<T>(
  fetchPage: (page: number, limit: number) => Promise<{ items: T[]; pagination: { total: number } }>,
  opts: { limit?: number; maxPages?: number } = {},
): Promise<T[]> {
  const limit = opts.limit ?? 200;
  const maxPages = opts.maxPages ?? 100;
  const out: T[] = [];
  let page = 1;
  while (page <= maxPages) {
    const res = await fetchPage(page, limit);
    out.push(...res.items);
    if (res.items.length === 0 || out.length >= res.pagination.total) break;
    page++;
  }
  return out;
}
