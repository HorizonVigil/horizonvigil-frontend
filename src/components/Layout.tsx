import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AppRail } from './AppRail';
import { ChatWidget } from './ChatWidget';
import { TopBar } from './TopBar';
import { ErrorBoundary } from './ErrorBoundary';
import { isCloudOnlyMode } from '../lib/featureFlags';

export function Layout() {
  const location = useLocation();

  // Without this, a screen-reader/keyboard user lands back at whatever DOM
  // position they were at before navigating (often deep in the old page's
  // content, or nowhere in particular) instead of at the top of the new
  // page -- forcing a re-traversal of AppRail's nav on every single route
  // change to get back to page content. Skipped on the very first mount so
  // it doesn't steal focus from, say, someone who arrived via the
  // skip-to-content link above.
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
          straight past AppRail's nav links to page content. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-brand-600 focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to content
      </a>
      <AppRail />
      <div className="flex-1 min-w-0">
        <TopBar />
        <main id="main-content" tabIndex={-1} className="px-4 sm:px-6 pb-10 outline-none">
          {/* Keyed on pathname so navigating to a different page remounts the
              boundary and clears any previous page's crashed state — a class
              error boundary doesn't reset itself just because its children
              changed underneath it. */}
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
      {/* cloudops-ai-gateway + cloudops-llm (this widget's whole backend) were
          deleted 2026-09-07 as part of the cloud-only go-live scope cut --
          unlike the sidebar's own hiddenInCloudOnlyMode entries (whose
          backends are all still alive, just unlinked from nav), there is no
          real service left for this to call. Gating it here rather than
          deleting the component: same "hidden, not removed" convention as
          the rest of cloud-only mode (see featureFlags.ts's isCloudOnlyMode
          doc comment) -- restorable the same way, by flipping the flag back,
          once/if the AI Copilot backend returns. */}
      {!isCloudOnlyMode() && <ChatWidget />}
    </div>
  );
}
