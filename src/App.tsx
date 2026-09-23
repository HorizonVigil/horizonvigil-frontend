import { ReactNode } from 'react';
import {
  BrowserRouter,
} from 'react-router-dom';
import {
  QueryClientProvider,
} from '@tanstack/react-query';
// import { ReactQueryDevtools } from '@tanstack/react-query-devtools'; // Removed for simplicity in this task

import { queryClient } from './api/queryClient';
// import { AuthProvider, useAuth } from './lib/auth'; // OLD: Replaced by SupabaseAuthProvider
import { SupabaseAuthProvider } from './lib/supabaseAuth'; // NEW: Supabase Auth Provider
import { ThemeProvider } from './lib/theme';
import { OrgProvider } from './lib/orgContext';
import { FilterProvider } from './lib/filterContext';
import { SyncProvider } from './lib/syncContext';
import { ToastProvider } from './lib/toast';
import { DemoDataProvider } from './lib/demoData/context';

import { Suspense } from 'react';

// OLD: Replaced by new Supabase-aware components and router
// import { RequireAuth, RequireOrg } from './pages/auth/RequireAuth';
// import { Login } from './pages/auth/Login';
// import { MarketingHome } from './pages/marketing/Home';

// NEW: Import the main application router
import { AppRouter } from './router';

// Route components are code-split; see routes/lazyRoutes.ts.
// For this task, we are simplifying the routing significantly.
// The original lazy imports are commented out to focus on the Supabase auth flow.
/*
import {
  AcceptInvite,
  AiCopilot,
  AksConsole,
  Alerts,
  Automation,
  BillingCanceled,
  BillingSuccess,
  CloudAccountDetail,
  CloudAccounts,
  CloudCompliance,
  CloudSecurity,
  CustomDashboards,
  Docs,
  EksConsole,
  FinOps,
  ForgotPassword,
  GkeConsole,
  IncidentDetail,
  Incidents,
  Issues,
  MfaChallenge,
  MockCheckout,
  Monitoring,
  OrganizationManagement,
  Overview,
  Pricing,
  PrivacyPolicy,
  Reports,
  ResetPassword,
  Resources,
  ResourcesCategory,
  ResourcesOverview,
  Settings,
  Signup,
  Subscription,
  TermsOfService,
  UsersGroups,
} from './routes/lazyRoutes';
*/
// import { Layout } from './components/Layout'; // Not used in this simplified auth flow for now
// import { ProtectedRoute } from './components/ProtectedRoute'; // Not used in this simplified auth flow for now

// import {
//   isBillingEnabled,
//   isMockCheckoutEnabled,
// } from './lib/featureFlags'; // Not used in this simplified auth flow for now

/**
 * "/" is the public marketing homepage for logged-out visitors and redirects
 * authenticated users into the application.
 * OLD RootRoute logic is replaced by AppRouter conditional rendering.
 */
// function RootRoute() {
//   const { isAuthenticated, isLoading } = useAuth();

//   if (isLoading) return null;

//   return isAuthenticated
//     ? <Navigate to="/overview" replace />
//     : <MarketingHome />;
// }

/**
 * Preserves the account ID across legacy route renames.
 *
 * Historical AWS-account and GCP-project detail URLs continue to work without
 * exposing the old page implementations through the router.
 * (Not used in this simplified auth flow for now)
 */
// function RedirectToAccountDetail() {
//   const { id } = useParams<{ id: string }>();

//   return (
//     <Navigate
//       to={id ? `/cloud-accounts/${encodeURIComponent(id)}` : '/cloud-accounts'}
//       replace
//     />
//   );
// }

/**
 * Billing routes must be unreachable when the billing API is not configured.
 * This protects against direct URL access even when navigation hides billing.
 * (Not used in this simplified auth flow for now)
 */
// function RequireBilling({ children }: { children: ReactNode }) {
//   return isBillingEnabled()
//     ? <>{children}</>
//     : <Navigate to="/overview" replace />;
// }

/**
 * Mock checkout is a development/test-only pathway and is independently gated
 * from normal billing availability
 * (Not used in this simplified auth flow for now)
 */

export function App() {
  return (
    <SupabaseAuthProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <OrgProvider> {/* Keep existing HorizonVigil providers */}
            <FilterProvider>
              <SyncProvider>
                <ToastProvider>
                  <DemoDataProvider>
                    <BrowserRouter>
                      <Suspense fallback={<div>Loading application...</div>}>
                        <AppRouter /> {/* NEW: Our main router component */}
                      </Suspense>
                    </BrowserRouter>
                  </DemoDataProvider>
                </ToastProvider>
              </SyncProvider>
            </FilterProvider>
          </OrgProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SupabaseAuthProvider>
  );
}
