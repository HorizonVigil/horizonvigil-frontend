/**
 * API transport boundary.
 *
 * This module is the single import boundary for application API transport.
 *
 * Architecture:
 *   UI / components
 *        ↓
 *   TanStack Query hooks
 *        ↓
 *   Domain API modules (`src/api/*.api.ts`)
 *        ↓
 *   This transport boundary
 *        ↓
 *   `src/lib/api.ts`
 *        ↓
 *   Supabase / backend API
 *
 * The underlying `api` client remains the source of truth for:
 * - Supabase bearer authentication
 * - `X-Org-Id` organization scoping
 * - `{ ok, data }` response envelopes
 * - API error normalization
 *
 * New application code should import the transport from this module rather
 * than importing `../lib/api` directly. This keeps the rest of the application
 * independent from the current transport implementation and makes a future
 * transport migration a localized change.
 *
 * IMPORTANT:
 * Do not add business logic, authentication logic, request mutation, caching,
 * retries, or response transformation here. Those concerns belong to the
 * underlying transport client, domain API modules, or TanStack Query layer.
 */

export {
  api,
  ApiError,
  friendlyErrorMessage,
} from '../lib/api';

export type {
  Paginated,
  Pagination,
  NotIntegrated,
} from '../lib/api';