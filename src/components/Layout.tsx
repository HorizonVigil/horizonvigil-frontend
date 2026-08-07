import { Outlet, useLocation } from 'react-router-dom';
import { AppRail } from './AppRail';
import { Sidebar } from './Sidebar';
import { ChatWidget } from './ChatWidget';
import { TopBar } from './TopBar';
import { ErrorBoundary } from './ErrorBoundary';

export function Layout() {
  const location = useLocation();
  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      <AppRail />
      <Sidebar />
      <div className="flex-1 min-w-0">
        <TopBar />
        <main className="px-6 pb-10 max-w-[1400px]">
          {/* Keyed on pathname so navigating to a different page remounts the
              boundary and clears any previous page's crashed state — a class
              error boundary doesn't reset itself just because its children
              changed underneath it. */}
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
      <ChatWidget />
    </div>
  );
}
