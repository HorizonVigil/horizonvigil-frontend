/**
 * The transport layer for every API call.
 *
 * `api` is the existing, security-reviewed client (Supabase bearer auth,
 * X-Org-Id injection, the `{ ok, data }` envelope, ApiError mapping). The
 * TanStack Query layer is built on top of it: domain modules in
 * `src/api/*.api.ts` call `api.*`, and hooks in `src/hooks/**` wrap those.
 *
 * New code should import the transport from here, not from `../lib/api`, so
 * that the day `lib/api.ts` is retired only this file changes.
 */
export { api, ApiError, friendlyErrorMessage } from '../lib/api';
export type { Paginated, Pagination, NotIntegrated } from '../lib/api';
