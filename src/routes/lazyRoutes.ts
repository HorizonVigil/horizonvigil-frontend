/**
 * Route-level code splitting.
 *
 * App.tsx used to import all 40 page components eagerly, so the build
 * emitted one chunk containing every page and a visitor opening the login
 * screen downloaded FinOps, Reports, the Kubernetes consoles and everything
 * else before anything rendered.
 *
 * Each entry here becomes its own chunk, fetched when its route is first
 * visited. Suspense in App.tsx covers the gap.
 *
 * These pages are deliberately NOT here and stay eagerly imported, because
 * they are on the critical path of a cold visit and deferring them would add
 * a round trip before first paint:
 *   Login, MarketingHome, NotFound, RequireAuth, RequireOrg
 *
 * Every entry is checked by lazyRoutes.test.ts, which imports each module
 * and asserts the named export exists -- a typo in a path or an export name
 * here is invisible to tsc (the import is dynamic) and would otherwise
 * surface as a blank page on exactly one route.
 */
import { lazy } from 'react';

export const AcceptInvite = lazy(() =>
  import('../pages/auth/AcceptInvite').then((m) => ({ default: m.AcceptInvite })),
);

export const AiCopilot = lazy(() =>
  import('../pages/AiCopilot').then((m) => ({ default: m.AiCopilot })),
);

export const AksConsole = lazy(() =>
  import('../pages/AksConsole').then((m) => ({ default: m.AksConsole })),
);

export const Alerts = lazy(() =>
  import('../pages/Alerts').then((m) => ({ default: m.Alerts })),
);

export const Automation = lazy(() =>
  import('../pages/Automation').then((m) => ({ default: m.Automation })),
);

export const BillingCanceled = lazy(() =>
  import('../pages/BillingCanceled').then((m) => ({ default: m.BillingCanceled })),
);

export const BillingSuccess = lazy(() =>
  import('../pages/BillingSuccess').then((m) => ({ default: m.BillingSuccess })),
);

export const CloudAccountDetail = lazy(() =>
  import('../pages/CloudAccountDetail').then((m) => ({ default: m.CloudAccountDetail })),
);

export const CloudAccounts = lazy(() =>
  import('../pages/CloudAccounts').then((m) => ({ default: m.CloudAccounts })),
);

export const CloudCompliance = lazy(() => import('../pages/CloudCompliance'));

export const CloudSecurity = lazy(() =>
  import('../pages/CloudSecurity').then((m) => ({ default: m.CloudSecurity })),
);

export const CustomDashboards = lazy(() =>
  import('../pages/CustomDashboards').then((m) => ({ default: m.CustomDashboards })),
);

export const Docs = lazy(() =>
  import('../pages/marketing/Docs').then((m) => ({ default: m.Docs })),
);

export const EksConsole = lazy(() =>
  import('../pages/EksConsole').then((m) => ({ default: m.EksConsole })),
);

export const FinOps = lazy(() =>
  import('../pages/FinOps').then((m) => ({ default: m.FinOps })),
);

export const ForgotPassword = lazy(() =>
  import('../pages/auth/ForgotPassword').then((m) => ({ default: m.ForgotPassword })),
);

export const GkeConsole = lazy(() =>
  import('../pages/GkeConsole').then((m) => ({ default: m.GkeConsole })),
);

export const IncidentDetail = lazy(() =>
  import('../pages/IncidentDetail').then((m) => ({ default: m.IncidentDetail })),
);

export const Incidents = lazy(() =>
  import('../pages/Incidents').then((m) => ({ default: m.Incidents })),
);

export const Issues = lazy(() =>
  import('../pages/Issues').then((m) => ({ default: m.Issues })),
);

export const MfaChallenge = lazy(() =>
  import('../pages/auth/MfaChallenge').then((m) => ({ default: m.MfaChallenge })),
);

export const MockCheckout = lazy(() =>
  import('../pages/MockCheckout').then((m) => ({ default: m.MockCheckout })),
);

export const Monitoring = lazy(() =>
  import('../pages/Monitoring').then((m) => ({ default: m.Monitoring })),
);

export const OrganizationManagement = lazy(() =>
  import('../pages/OrganizationManagement').then((m) => ({ default: m.OrganizationManagement })),
);

export const Overview = lazy(() =>
  import('../pages/Overview').then((m) => ({ default: m.Overview })),
);

export const Pricing = lazy(() =>
  import('../pages/marketing/Pricing').then((m) => ({ default: m.Pricing })),
);

export const PrivacyPolicy = lazy(() =>
  import('../pages/marketing/PrivacyPolicy').then((m) => ({ default: m.PrivacyPolicy })),
);

export const Reports = lazy(() =>
  import('../pages/Reports').then((m) => ({ default: m.Reports })),
);

export const ResetPassword = lazy(() =>
  import('../pages/auth/ResetPassword').then((m) => ({ default: m.ResetPassword })),
);

export const Resources = lazy(() =>
  import('../pages/Resources').then((m) => ({ default: m.Resources })),
);

export const ResourcesCategory = lazy(() =>
  import('../pages/resources/ResourcesCategory').then((m) => ({ default: m.ResourcesCategory })),
);

export const ResourcesOverview = lazy(() =>
  import('../pages/resources/ResourcesOverview').then((m) => ({ default: m.ResourcesOverview })),
);

export const Settings = lazy(() =>
  import('../pages/Settings').then((m) => ({ default: m.Settings })),
);

export const Signup = lazy(() =>
  import('../pages/auth/Signup').then((m) => ({ default: m.Signup })),
);

export const Subscription = lazy(() =>
  import('../pages/Subscription').then((m) => ({ default: m.Subscription })),
);

export const TermsOfService = lazy(() =>
  import('../pages/marketing/TermsOfService').then((m) => ({ default: m.TermsOfService })),
);

export const UsersGroups = lazy(() =>
  import('../pages/UsersGroups').then((m) => ({ default: m.UsersGroups })),
);
