import { Link } from 'react-router-dom';

export function BillingCanceled() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="max-w-sm text-center">
        <div className="text-3xl mb-3">·</div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Checkout canceled</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">No charge was made. You can pick a plan again whenever you're ready.</p>
        <Link to="/subscription" className="text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline">
          Back to Subscription →
        </Link>
      </div>
    </div>
  );
}
