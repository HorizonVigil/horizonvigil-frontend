import { Link } from 'react-router-dom';
import { MarketingNav } from '../../components/marketing/MarketingNav';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

/** Catch-all route (App.tsx's `path="*"`) -- shown for any unmatched URL, logged in or not, so it uses the same marketing shell as Docs/PrivacyPolicy rather than assuming an app or marketing context. */
export function NotFound() {
  return (
    <div className="bg-white dark:bg-slate-950 min-h-screen flex flex-col">
      <MarketingNav />
      <main className="flex-grow flex items-center justify-center px-5 py-24">
        <div className="text-center max-w-md">
          <div className="text-sm font-semibold text-brand-600 dark:text-brand-400 mb-3">404</div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white text-balance">Page not found</h1>
          <p className="text-slate-600 dark:text-slate-300 mt-4">
            The page you're looking for doesn't exist, or may have moved. Double-check the URL, or head back to somewhere that does.
          </p>
          <div className="flex items-center justify-center gap-3 mt-8 flex-wrap">
            <Link to="/" className="text-sm font-semibold px-6 py-3 rounded-md bg-brand-600 hover:bg-brand-700 text-white">
              Back to homepage
            </Link>
            <Link to="/docs" className="text-sm font-semibold px-6 py-3 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900">
              Browse docs
            </Link>
          </div>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
