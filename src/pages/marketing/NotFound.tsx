import { Link } from 'react-router-dom';
import { MarketingNav } from '../../components/marketing/MarketingNav';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

const PAGE_TITLE_ID = 'not-found-page-title';

/**
 * Catch-all route (App.tsx `path="*"`).
 *
 * Provides a consistent marketing shell for unmatched routes,
 * whether the visitor is authenticated or not.
 */
export function NotFound() {
  return (
    <div className="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-white flex flex-col">
      <MarketingNav />

      <main
        id="main-content"
        aria-labelledby={PAGE_TITLE_ID}
        className="flex flex-1 items-center justify-center px-5 py-24 sm:px-6 lg:px-8"
      >
        <section
          aria-describedby="not-found-description"
          className="w-full max-w-md text-center"
        >
          <p
            aria-label="Error 404"
            className="mb-3 text-sm font-semibold text-brand-600 dark:text-brand-400"
          >
            404
          </p>

          <h1
            id={PAGE_TITLE_ID}
            className="text-balance text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl"
          >
            Page not found
          </h1>

          <p
            id="not-found-description"
            className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300"
          >
            The page you're looking for doesn't exist, or may have moved.
            Double-check the URL, or head back to somewhere that does.
          </p>

          <nav
            aria-label="404 page navigation"
            className="mt-8 flex flex-wrap items-center justify-center gap-3"
          >
            <Link
              to="/"
              className={[
                'rounded-md bg-brand-600 px-6 py-3 text-sm font-semibold text-white',
                'transition-colors hover:bg-brand-700',
                'focus-visible:outline-none focus-visible:ring-2',
                'focus-visible:ring-brand-600 focus-visible:ring-offset-2',
                'dark:focus-visible:ring-offset-slate-950',
              ].join(' ')}
            >
              Back to homepage
            </Link>

            <Link
              to="/docs"
              className={[
                'rounded-md border border-slate-200 px-6 py-3 text-sm font-semibold',
                'text-slate-700 transition-colors hover:bg-slate-50',
                'dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900',
                'focus-visible:outline-none focus-visible:ring-2',
                'focus-visible:ring-brand-600 focus-visible:ring-offset-2',
                'dark:focus-visible:ring-offset-slate-950',
              ].join(' ')}
            >
              Browse docs
            </Link>
          </nav>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}