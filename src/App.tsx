import type { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { ThemeProvider } from './lib/theme';
import { OrgProvider } from './lib/orgContext';
import { FilterProvider } from './lib/filterContext';
import { SyncProvider } from './lib/syncContext';
import { ToastProvider } from './lib/toast';
import { Layout } from './components/Layout';
import { RequireAuth, RequireOrg } from './pages/auth/RequireAuth';
import { Login } from './pages/auth/Login';
import { Signup } from './pages/auth/Signup';
import { ForgotPassword } from './pages/auth/ForgotPassword';
import { Overview } from './pages/Overview';
import { CloudAccounts } from './pages/CloudAccounts';
import { CloudAccountDetail } from './pages/CloudAccountDetail';
import { Resources } from './pages/Resources';
import { ResourcesOverview } from './pages/resources/ResourcesOverview';
import { ResourcesCategory } from './pages/resources/ResourcesCategory';
import { CostManagement } from './pages/CostManagement';
import { CostOptimization } from './pages/CostOptimization';
import { VulnerabilityManagement } from './pages/VulnerabilityManagement';
import { Clusters } from './pages/Clusters';
import { Monitoring } from './pages/Monitoring';
import { Alerts } from './pages/Alerts';
import { Issues } from './pages/Issues';
import { Reports } from './pages/Reports';
import { UsersGroups } from './pages/UsersGroups';
import { OrganizationManagement } from './pages/OrganizationManagement';
import { Settings } from './pages/Settings';
import { CustomDashboards } from './pages/CustomDashboards';
import { Automation } from './pages/Automation';
import { Subscription } from './pages/Subscription';
import { BillingSuccess } from './pages/BillingSuccess';
import { BillingCanceled } from './pages/BillingCanceled';
import { AdminBilling } from './pages/AdminBilling';
import { MockCheckout } from './pages/MockCheckout';
import { isBillingEnabled } from './lib/featureFlags';
import { MarketingHome } from './pages/marketing/Home';
import { Pricing } from './pages/marketing/Pricing';
import { PrivacyPolicy } from './pages/marketing/PrivacyPolicy';
import { TermsOfService } from './pages/marketing/TermsOfService';
import { Docs } from './pages/marketing/Docs';

/** "/" is the public marketing homepage for logged-out visitors, and a straight redirect into the app for everyone else — never a login wall. */
function RootRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null;
  if (isAuthenticated) return <Navigate to="/overview" replace />;
  return <MarketingHome />;
}

/** Preserves :id across a route rename — /aws-accounts/:id and /gcp-projects/:id both used to be real routes (bookmarks, stored Favorites) before Cloud Accounts and GCP Projects merged into one unified list+detail. */
function RedirectToAccountDetail() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/cloud-accounts/${id}` : '/cloud-accounts'} replace />;
}

/** Nav hides billing when VITE_BILLING_API_URL is unset (prod), but a direct URL visit would still hit the route -- this closes that gap rather than rendering a page whose API calls have nowhere to go. */
function RequireBilling({ children }: { children: ReactNode }) {
  return isBillingEnabled() ? <>{children}</> : <Navigate to="/overview" replace />;
}

/** An already-signed-in user landing on /login, /signup, or /forgot-password (a stale bookmark, browser back button) goes straight into the app instead of being shown a form for a session they already have. */
function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null;
  if (isAuthenticated) return <Navigate to="/overview" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <OrgProvider>
            <FilterProvider>
              <SyncProvider>
                <ToastProvider>
                  <Routes>
                    <Route path="/" element={<RootRoute />} />
                    <Route path="/pricing" element={<Pricing />} />
                    <Route path="/docs" element={<Docs />} />
                    <Route path="/privacy" element={<PrivacyPolicy />} />
                    <Route path="/terms" element={<TermsOfService />} />
                    <Route path="/login" element={<RedirectIfAuthenticated><Login /></RedirectIfAuthenticated>} />
                    <Route path="/signup" element={<RedirectIfAuthenticated><Signup /></RedirectIfAuthenticated>} />
                    <Route path="/forgot-password" element={<RedirectIfAuthenticated><ForgotPassword /></RedirectIfAuthenticated>} />

                    <Route element={<RequireAuth />}>
                      <Route element={<RequireOrg />}>
                        <Route element={<Layout />}>
                          <Route path="/overview" element={<Overview />} />
                          <Route path="/cloud-accounts" element={<CloudAccounts />} />
                          <Route path="/cloud-accounts/:id" element={<CloudAccountDetail />} />
                          {/* Legacy routes — AWS Accounts and GCP Projects merged into one unified module; these keep old bookmarks/Favorites working. */}
                          <Route path="/aws-accounts" element={<Navigate to="/cloud-accounts" replace />} />
                          <Route path="/aws-accounts/:id" element={<RedirectToAccountDetail />} />
                          <Route path="/gcp-projects" element={<Navigate to="/cloud-accounts" replace />} />
                          <Route path="/gcp-projects/:id" element={<RedirectToAccountDetail />} />
                          <Route path="/resources" element={<ResourcesOverview />} />
                          <Route path="/resources/all" element={<Resources />} />
                          <Route path="/resources/:category" element={<ResourcesCategory />} />
                          <Route path="/resources/:category/:service" element={<Resources />} />
                          <Route path="/cost-management" element={<CostManagement />} />
                          <Route path="/cost-optimization" element={<CostOptimization />} />
                          <Route path="/vulnerability-management" element={<VulnerabilityManagement />} />
                          <Route path="/clusters" element={<Clusters />} />
                          <Route path="/monitoring" element={<Monitoring />} />
                          <Route path="/alerts" element={<Alerts />} />
                          <Route path="/issues" element={<Issues />} />
                          <Route path="/reports" element={<Reports />} />
                          <Route path="/integrations" element={<Navigate to="/automation" replace />} />
                          <Route path="/users-groups" element={<UsersGroups />} />
                          <Route path="/organization" element={<OrganizationManagement />} />
                          <Route path="/settings" element={<Settings />} />
                          <Route path="/custom-dashboards" element={<CustomDashboards />} />
                          <Route path="/automation" element={<Automation />} />
                          <Route path="/subscription" element={<RequireBilling><Subscription /></RequireBilling>} />
                          <Route path="/billing/success" element={<RequireBilling><BillingSuccess /></RequireBilling>} />
                          <Route path="/billing/canceled" element={<RequireBilling><BillingCanceled /></RequireBilling>} />
                          <Route path="/billing/mock-checkout" element={<RequireBilling><MockCheckout /></RequireBilling>} />
                          {/* Not in nav on purpose — platform-staff only, enforced server-side by PLATFORM_ADMIN_EMAILS. Reachable by direct URL for the handful of people who need it. */}
                          <Route path="/platform-admin/billing" element={<RequireBilling><AdminBilling /></RequireBilling>} />
                        </Route>
                      </Route>
                    </Route>

                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </ToastProvider>
              </SyncProvider>
            </FilterProvider>
          </OrgProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
