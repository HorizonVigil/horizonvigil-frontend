import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AppRail } from './AppRail';
import { Sidebar } from './Sidebar';
import { ChatWidget } from './ChatWidget';
import { TopBar } from './TopBar';
import { ErrorBoundary } from './ErrorBoundary';

export function Layout() {
  const location = useLocation();
  // Sidebar (256px) has no responsive behavior of its own below `lg`
  // (1024px) -- together with AppRail's 64px that's 320px of fixed chrome,
  // which on a 768px tablet leaves too little room for real content. Below
  // `lg`, Sidebar renders as an off-canvas drawer instead of static layout
  // space; this is the only piece of state that decides whether it's open.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      <AppRail />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 min-w-0">
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        <main className="px-4 sm:px-6 pb-10 max-w-[1400px]">
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
