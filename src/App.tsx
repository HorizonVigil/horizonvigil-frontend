import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { ThemeProvider } from './lib/theme';
import { OrgProvider } from './lib/orgContext';
import { FilterProvider } from './lib/filterContext';
import { Layout } from './components/Layout';
import { RequireAuth, RequireOrg } from './pages/auth/RequireAuth';
import { Login } from './pages/auth/Login';
import { Signup } from './pages/auth/Signup';
import { ForgotPassword } from './pages/auth/ForgotPassword';
import { Overview } from './pages/Overview';
import { AwsAccounts } from './pages/AwsAccounts';
import { AwsAccountDetail } from './pages/AwsAccountDetail';
import { Resources } from './pages/Resources';
import { CostManagement } from './pages/CostManagement';
import { CostOptimization } from './pages/CostOptimization';
import { VulnerabilityManagement } from './pages/VulnerabilityManagement';
import { Clusters } from './pages/Clusters';
import { Monitoring } from './pages/Monitoring';
import { Alerts } from './pages/Alerts';
import { Reports } from './pages/Reports';
import { Integrations } from './pages/Integrations';
import { UsersGroups } from './pages/UsersGroups';
import { OrganizationManagement } from './pages/OrganizationManagement';
import { Settings } from './pages/Settings';

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <OrgProvider>
            <FilterProvider>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />

                <Route element={<RequireAuth />}>
                  <Route element={<RequireOrg />}>
                    <Route element={<Layout />}>
                      <Route path="/" element={<Navigate to="/overview" replace />} />
                      <Route path="/overview" element={<Overview />} />
                      <Route path="/aws-accounts" element={<AwsAccounts />} />
                      <Route path="/aws-accounts/:id" element={<AwsAccountDetail />} />
                      <Route path="/resources" element={<Resources />} />
                      <Route path="/cost-management" element={<CostManagement />} />
                      <Route path="/cost-optimization" element={<CostOptimization />} />
                      <Route path="/vulnerability-management" element={<VulnerabilityManagement />} />
                      <Route path="/clusters" element={<Clusters />} />
                      <Route path="/monitoring" element={<Monitoring />} />
                      <Route path="/alerts" element={<Alerts />} />
                      <Route path="/reports" element={<Reports />} />
                      <Route path="/integrations" element={<Integrations />} />
                      <Route path="/users-groups" element={<UsersGroups />} />
                      <Route path="/organization" element={<OrganizationManagement />} />
                      <Route path="/settings" element={<Settings />} />
                    </Route>
                  </Route>
                </Route>

                <Route path="*" element={<Navigate to="/overview" replace />} />
              </Routes>
            </FilterProvider>
          </OrgProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
