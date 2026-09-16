import type { ReactNode } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useParams,
} from 'react-router-dom';
import {
  QueryClientProvider,
} from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

import { queryClient } from './api/queryClient';
import { AuthProvider, useAuth } from './lib/auth';
import { ThemeProvider } from './lib/theme';
import { OrgProvider } from './lib/orgContext';
import { FilterProvider } from './lib/filterContext';
import { SyncProvider } from './lib/syncContext';
import { ToastProvider } from './lib/toast';
import { DemoDataProvider } from './lib/demoData/context';

import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { RequireAuth, RequireOrg } from './pages/auth/RequireAuth';

import { Login } from './pages/auth/Login';
import { Signup } from './pages/auth/Signup';
import { ForgotPassword } from './pages/auth/ForgotPassword';
import { ResetPassword } from './pages/auth/ResetPassword';
import { MfaChallenge } from './pages/auth/MfaChallenge';
import { AcceptInvite } from './pages/auth/AcceptInvite';

import { Overview } from './pages/Overview';
import { CloudAccounts } from './pages/CloudAccounts';
import { CloudAccountDetail } from './pages/CloudAccountDetail';
import { Resources } from './pages/Resources';
import { ResourcesOverview } from './pages/resources/ResourcesOverview';
import { ResourcesCategory } from './pages/resources/ResourcesCategory';
import { FinOps } from './pages/FinOps';
import { CloudSecurity } from './pages/CloudSecurity';
import CloudCompliance from './pages/CloudCompliance';

import { EksConsole } from './pages/EksConsole';
import { GkeConsole } from './pages/GkeConsole';
import { AksConsole } from './pages/AksConsole';

import { Monitoring } from './pages/Monitoring';
import { Alerts } from './pages/Alerts';
import { Issues } from './pages/Issues';
import { Incidents } from './pages/Incidents';
import { IncidentDetail } from './pages/IncidentDetail';
import { Reports } from './pages/Reports';
import { UsersGroups } from './pages/UsersGroups';
import { OrganizationManagement } from './pages/OrganizationManagement';
import { Settings } from './pages/Settings';
import { CustomDashboards } from './pages/CustomDashboards';
import { AiCopilot } from './pages/AiCopilot';
import { Automation } from './pages/Automation';

import { Subscription } from './pages/Subscription';
import { BillingSuccess } from './pages/BillingSuccess';
import { BillingCanceled } from './pages/BillingCanceled';
import { MockCheckout } from './pages/MockCheckout';

import {
  isBillingEnabled,
  isMockCheckoutEnabled,
} from './lib/featureFlags';

import { MarketingHome } from './pages/marketing/Home';
import { Pricing } from './pages/marketing/Pricing';
import { PrivacyPolicy } from './pages/marketing/PrivacyPolicy';
import { TermsOfService } from './pages/marketing/TermsOfService';
import { Docs } from './pages/marketing/Docs';
import { NotFound } from './pages/marketing/NotFound';

/**
 * "/" is the public marketing homepage for logged-out visitors and redirects
 * authenticated users into the application.
 */
function RootRoute() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return null;

  return isAuthenticated
    ? <Navigate to="/overview" replace />
    : <MarketingHome />;
}

/**
 * Preserves the account ID across legacy route renames.
 *
 * Historical AWS-account and GCP-project detail URLs continue to work without
 * exposing the old page implementations through the router.
 */
function RedirectToAccountDetail() {
  const { id } = useParams<{ id: string }>();

  return (
    <Navigate
      to={id ? `/cloud-accounts/${encodeURIComponent(id)}` : '/cloud-accounts'}
      replace
    />
  );
}

/**
 * Billing routes must be unreachable when the billing API is not configured.
 * This protects against direct URL access even when navigation hides billing.
 */
function RequireBilling({ children }: { children: ReactNode }) {
  return isBillingEnabled()
    ? <>{children}</>
    : <Navigate to="/overview" replace />;
}

/**
 * Mock checkout is a development/test-only pathway and is independently gated
 * from normal billing availability.
 */
function RequireMockCheckout({ children }: { children: ReactNode }) {
  return isMockCheckoutEnabled()
    ? <>{children}</>
    : <Navigate to="/subscription" replace />;
}

/**
 * Prevents authenticated users from returning to authentication forms through
 * stale bookmarks or browser history.
 */
function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return null;

  return isAuthenticated
    ? <Navigate to="/overview" replace />
    : <>{children}</>;
}

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <OrgProvider>
              <FilterProvider>
                <DemoDataProvider>
                  <SyncProvider>
                    <ToastProvider>
                      <Routes>
                        {/* Public routes */}
                        <Route path="/" element={<RootRoute />} />
                        <Route path="/pricing" element={<Pricing />} />
                        <Route path="/docs" element={<Docs />} />
                        <Route path="/privacy" element={<PrivacyPolicy />} />
                        <Route path="/terms" element={<TermsOfService />} />

                        <Route
                          path="/login"
                          element={
                            <RedirectIfAuthenticated>
                              <Login />
                            </RedirectIfAuthenticated>
                          }
                        />
                        <Route
                          path="/signup"
                          element={
                            <RedirectIfAuthenticated>
                              <Signup />
                            </RedirectIfAuthenticated>
                          }
                        />
                        <Route
                          path="/forgot-password"
                          element={
                            <RedirectIfAuthenticated>
                              <ForgotPassword />
                            </RedirectIfAuthenticated>
                          }
                        />

                        {/* Recovery flow intentionally remains outside the
                            authenticated redirect because the recovery token
                            is carried by the URL/hash. */}
                        <Route
                          path="/login/reset"
                          element={<ResetPassword />}
                        />

                        {/* MFA is part of authentication establishment and must
                            remain reachable before RequireAuth/RequireOrg. */}
                        <Route
                          path="/login/mfa"
                          element={<MfaChallenge />}
                        />

                        {/* Invite acceptance must support both logged-out
                            invitees and authenticated users without an org. */}
                        <Route
                          path="/accept-invite"
                          element={<AcceptInvite />}
                        />

                        {/* Authenticated, organization-scoped application */}
                        <Route element={<RequireAuth />}>
                          <Route element={<RequireOrg />}>
                            <Route element={<Layout />}>
                              <Route
                                path="/overview"
                                element={
                                  <ProtectedRoute module="Overview">
                                    <Overview />
                                  </ProtectedRoute>
                                }
                              />

                              <Route
                                path="/cloud-accounts"
                                element={
                                  <ProtectedRoute module="Cloud Accounts">
                                    <CloudAccounts />
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/cloud-accounts/:id"
                                element={
                                  <ProtectedRoute module="Cloud Accounts">
                                    <CloudAccountDetail />
                                  </ProtectedRoute>
                                }
                              />

                              {/* Legacy account routes */}
                              <Route
                                path="/aws-accounts"
                                element={
                                  <Navigate
                                    to="/cloud-accounts"
                                    replace
                                  />
                                }
                              />
                              <Route
                                path="/aws-accounts/:id"
                                element={<RedirectToAccountDetail />}
                              />
                              <Route
                                path="/gcp-projects"
                                element={
                                  <Navigate
                                    to="/cloud-accounts"
                                    replace
                                  />
                                }
                              />
                              <Route
                                path="/gcp-projects/:id"
                                element={<RedirectToAccountDetail />}
                              />

                              {/* Asset Inventory */}
                              <Route
                                path="/resources"
                                element={
                                  <ProtectedRoute module="Asset Inventory">
                                    <ResourcesOverview />
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/resources/all"
                                element={
                                  <ProtectedRoute module="Asset Inventory">
                                    <Resources />
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/resources/:category"
                                element={
                                  <ProtectedRoute module="Asset Inventory">
                                    <ResourcesCategory />
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/resources/:category/:service"
                                element={
                                  <ProtectedRoute module="Asset Inventory">
                                    <Resources />
                                  </ProtectedRoute>
                                }
                              />

                              {/* FinOps combines the former Cost Management
                                  and Cost Optimization modules. */}
                              <Route
                                path="/finops"
                                element={
                                  <ProtectedRoute module="FinOps">
                                    <FinOps />
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/cost-management"
                                element={
                                  <Navigate
                                    to="/finops?section=Cost+Management"
                                    replace
                                  />
                                }
                              />
                              <Route
                                path="/cost-optimization"
                                element={
                                  <Navigate
                                    to="/finops?section=Cost+Optimization"
                                    replace
                                  />
                                }
                              />

                              {/* V1/V2 boundary.
                                  Vulnerability Management remains a gated V2
                                  route. Legacy deep links intentionally land
                                  on a V1 notice without preserving V2 IDs,
                                  categories, counts, or records. */}
                              <Route
                                path="/vulnerability-management"
                                element={
                                  <Navigate
                                    to="/cloud-security?notice=vulnerability-management-is-v2"
                                    replace
                                  />
                                }
                              />
                              <Route
                                path="/vulnerability-management/findings/:id"
                                element={
                                  <Navigate
                                    to="/cloud-security?notice=vulnerability-management-is-v2"
                                    replace
                                  />
                                }
                              />
                              <Route
                                path="/source-inventory/:category"
                                element={
                                  <Navigate
                                    to="/cloud-security?notice=vulnerability-management-is-v2"
                                    replace
                                  />
                                }
                              />
                              <Route
                                path="/source-inventory/:category/:assetId"
                                element={
                                  <Navigate
                                    to="/cloud-security?notice=vulnerability-management-is-v2"
                                    replace
                                  />
                                }
                              />
                              <Route
                                path="/security-scanning"
                                element={
                                  <Navigate
                                    to="/cloud-security?notice=vulnerability-management-is-v2"
                                    replace
                                  />
                                }
                              />

                              {/* IMPORTANT:
                                  Cloud Security is the V1 module. The
                                  ProtectedRoute module must therefore match
                                  navConfig's canonical "Cloud Security"
                                  module label, not the retired V2
                                  "Vulnerability Management" label. */}
                              <Route
                                path="/cloud-security"
                                element={
                                  <ProtectedRoute module="Cloud Security">
                                    <CloudSecurity />
                                  </ProtectedRoute>
                                }
                              />

                              <Route
                                path="/cloud-compliance"
                                element={
                                  <ProtectedRoute module="Cloud Compliance">
                                    <CloudCompliance />
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/cloud-security/compliance"
                                element={
                                  <Navigate
                                    to="/cloud-compliance"
                                    replace
                                  />
                                }
                              />

                              {/* Former application/code/container/
                                  infrastructure security entry points now
                                  belong to the gated V2 surface. */}
                              <Route
                                path="/application-security"
                                element={
                                  <Navigate
                                    to="/cloud-security?notice=vulnerability-management-is-v2"
                                    replace
                                  />
                                }
                              />
                              <Route
                                path="/code-security"
                                element={
                                  <Navigate
                                    to="/cloud-security?notice=vulnerability-management-is-v2"
                                    replace
                                  />
                                }
                              />
                              <Route
                                path="/container-security"
                                element={
                                  <Navigate
                                    to="/cloud-security?notice=vulnerability-management-is-v2"
                                    replace
                                  />
                                }
                              />
                              <Route
                                path="/infrastructure-security"
                                element={
                                  <Navigate
                                    to="/cloud-security?notice=vulnerability-management-is-v2"
                                    replace
                                  />
                                }
                              />

                              {/* Provider-specific cluster consoles */}
                              <Route
                                path="/clusters"
                                element={
                                  <Navigate
                                    to="/clusters/aws"
                                    replace
                                  />
                                }
                              />
                              <Route
                                path="/clusters/aws"
                                element={
                                  <ProtectedRoute module="Clusters">
                                    <EksConsole />
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/clusters/gcp"
                                element={
                                  <ProtectedRoute module="Clusters">
                                    <GkeConsole />
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/clusters/azure"
                                element={
                                  <ProtectedRoute module="Clusters">
                                    <AksConsole />
                                  </ProtectedRoute>
                                }
                              />

                              <Route
                                path="/monitoring"
                                element={
                                  <ProtectedRoute module="Monitoring">
                                    <Monitoring />
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/alerts"
                                element={
                                  <ProtectedRoute module="Alerts">
                                    <Alerts />
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/issues"
                                element={
                                  <ProtectedRoute module="Issues">
                                    <Issues />
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/incidents"
                                element={
                                  <ProtectedRoute module="Incidents">
                                    <Incidents />
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/incidents/:id"
                                element={
                                  <ProtectedRoute module="Incidents">
                                    <IncidentDetail />
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/reports"
                                element={
                                  <ProtectedRoute module="Reports">
                                    <Reports />
                                  </ProtectedRoute>
                                }
                              />

                              <Route
                                path="/integrations"
                                element={
                                  <Navigate
                                    to="/automation"
                                    replace
                                  />
                                }
                              />

                              <Route
                                path="/users-groups"
                                element={
                                  <ProtectedRoute
                                    module="Users & Groups"
                                    minRole="admin"
                                  >
                                    <UsersGroups />
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/organization"
                                element={
                                  <ProtectedRoute
                                    module="Organization Management"
                                    minRole="admin"
                                  >
                                    <OrganizationManagement />
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/settings"
                                element={
                                  <ProtectedRoute
                                    module="Settings"
                                    minRole="editor"
                                  >
                                    <Settings />
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/custom-dashboards"
                                element={
                                  <ProtectedRoute module="Custom Dashboards">
                                    <CustomDashboards />
                                  </ProtectedRoute>
                                }
                              />

                              {/* AI Copilot has no top-level NAV_MODULES
                                  permission entry; access is therefore handled
                                  by the component itself for authenticated org
                                  members. */}
                              <Route
                                path="/ai-copilot"
                                element={
                                  <ProtectedRoute>
                                    <AiCopilot />
                                  </ProtectedRoute>
                                }
                              />

                              <Route
                                path="/automation"
                                element={
                                  <ProtectedRoute
                                    module="Automation"
                                    minRole="editor"
                                  >
                                    <Automation />
                                  </ProtectedRoute>
                                }
                              />

                              {/* Billing */}
                              <Route
                                path="/subscription"
                                element={
                                  <RequireBilling>
                                    <ProtectedRoute module="Subscription">
                                      <Subscription />
                                    </ProtectedRoute>
                                  </RequireBilling>
                                }
                              />
                              <Route
                                path="/billing/success"
                                element={
                                  <RequireBilling>
                                    <BillingSuccess />
                                  </RequireBilling>
                                }
                              />
                              <Route
                                path="/billing/canceled"
                                element={
                                  <RequireBilling>
                                    <BillingCanceled />
                                  </RequireBilling>
                                }
                              />
                              <Route
                                path="/billing/mock-checkout"
                                element={
                                  <RequireBilling>
                                    <RequireMockCheckout>
                                      <MockCheckout />
                                    </RequireMockCheckout>
                                  </RequireBilling>
                                }
                              />
                            </Route>
                          </Route>
                        </Route>

                        <Route path="*" element={<NotFound />} />
                      </Routes>
                    </ToastProvider>
                  </SyncProvider>
                </DemoDataProvider>
              </FilterProvider>
            </OrgProvider>
          </AuthProvider>
        </BrowserRouter>

        {/* React Query Devtools is intentionally outside the router because it
            has no routing dependency. initialIsOpen keeps production UI quiet. */}
        <ReactQueryDevtools
          initialIsOpen={false}
          buttonPosition="bottom-left"
        />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
