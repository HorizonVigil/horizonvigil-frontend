import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AppRail } from './AppRail';
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

  // Without this, a screen-reader/keyboard user lands back at whatever DOM
  // position they were at before navigating (often deep in the old page's
  // content, or nowhere in particular) instead of at the top of the new
  // page -- forcing a re-traversal of AppRail + Sidebar's nav on every
  // single route change to get back to page content. Skipped on the very
  // first mount so it doesn't steal focus from, say, someone who arrived
  // via the skip-to-content link above.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    document.getElementById('main-content')?.focus();
  }, [location.pathname]);
  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Off-screen until focused — lets a keyboard/screen-reader user jump
          straight past AppRail + Sidebar's nav links instead of tabbing
          through both on every single page. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-brand-600 focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to content
      </a>
      <AppRail />

      <div className="flex-1 min-w-0">
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        <main id="main-content" tabIndex={-1} className="px-4 sm:px-6 pb-10 max-w-[1400px] outline-none">
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
