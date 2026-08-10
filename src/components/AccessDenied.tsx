import { Link } from 'react-router-dom';
import { Icon } from './icons';

export function AccessDenied() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      <div className="w-full max-w-md text-center">
        <div className="h-14 w-14 rounded-full bg-red-50 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
          <Icon name="shield" size={24} className="text-red-500" />
        </div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">Access Denied</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          You don't have permission to access this page. If you believe this is a mistake, contact your organization administrator.
        </p>
        <Link
          to="/overview"
          className="inline-flex items-center gap-2 rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2"
        >
          <Icon name="overview" size={16} />
          Go to Overview
        </Link>
      </div>
    </div>
  );
}