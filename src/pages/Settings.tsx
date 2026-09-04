import { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { FilterBar } from '../components/FilterBar';
import { Badge } from '../components/Badge';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { useOrg } from '../lib/orgContext';
import { useTabParam } from '../lib/useTabParam';
import { useSubmenuAccess } from '../lib/useCanSeeSubmenu';
import { api, type Role, type RecommendationRules, type GitInstallation, type GitRepo } from '../lib/api';

const TIMEZONES = ['UTC', 'America/New_York', 'America/Los_Angeles', 'America/Chicago', 'Europe/London', 'Europe/Berlin', 'Asia/Kolkata', 'Asia/Singapore', 'Australia/Sydney'];
const DATE_FORMATS = ['YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY'];
const REGIONS = ['us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'eu-west-1', 'eu-central-1', 'ap-south-1', 'ap-southeast-1', 'ap-northeast-1'];

// Profile/Appearance/Session aren't among the 8 org-wide settings the
// sidebar names (those are all per-org; these are per-you) — grouped
// under one Profile tab since none of the 8 is a natural home for them.
const TABS = ['Profile', 'Cloud Integrations', 'Notifications', 'Credentials', 'RBAC', 'System Settings', 'Recommendation Rules', 'Git Integration', 'Branding', 'License'] as const;
type Tab = typeof TABS[number];

// cloud_connections.connection_method values across all three providers --
// was a binary cross_account_role/"Access key" check that defaulted every
// non-AWS-role method (including GCP's and Azure's, which aren't access
// keys at all) to the wrong label.
const CONNECTION_METHOD_LABELS: Record<string, string> = {
  access_key: 'Access key',
  cross_account_role: 'Cross-account role',
  service_account_key: 'Service account key',
  service_account_impersonation: 'Service account impersonation',
  service_principal: 'Service principal',
};

const DEFAULT_RECOMMENDATION_RULES: RecommendationRules = { idleDetectionEnabled: true, rightsizingEnabled: true, rightsizingCpuThresholdPct: 20, minMonthlySavingsToFlag: 0 };

function formatSafeDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleDateString();
}

function isValidHttpUrl(value: string): boolean {
  if (!value.trim()) return true;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function isValidHexColor(value: string): boolean {
  return !value.trim() || /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

function parseBoundedNumber(
  value: string,
  min: number,
  max: number,
  fallback: number,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}


export function Settings() {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { currentOrg } = useOrg();
  const canSeeTab = useSubmenuAccess('settings');
  const visibleTabs = TABS.filter(canSeeTab);
  const [tab, setTab] = useTabParam<Tab>(TABS, 'Profile');
  useEffect(() => {
    if (!canSeeTab(tab) && visibleTabs.length > 0) setTab(visibleTabs[0]);
  }, [tab, canSeeTab, visibleTabs, setTab]);
  const isOwner = currentOrg?.myRole === 'owner';

  // ── Profile (Supabase profiles table — unrelated to the domain-service split) ──
  const [fullName, setFullName] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [dateFormat, setDateFormat] = useState('YYYY-MM-DD');
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    let active = true;

    void api.getMyProfile().then((data) => {
      if (!active) return;
      setFullName(data.fullName ?? '');
      setTimezone(TIMEZONES.includes(data.timezone ?? '') ? (data.timezone ?? 'UTC') : 'UTC');
      setDateFormat(DATE_FORMATS.includes(data.dateFormat ?? '') ? (data.dateFormat ?? 'YYYY-MM-DD') : 'YYYY-MM-DD');
    }).catch(() => { /* keep defaults */ });

    return () => {
      active = false;
    };
  }, [user]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    setProfileError(null);

    if (!TIMEZONES.includes(timezone) || !DATE_FORMATS.includes(dateFormat)) {
      setProfileError('Invalid timezone or date format.');
      return;
    }

    try {
      await api.updateMyProfile({ fullName: fullName.trim(), timezone, dateFormat });
    } catch (err) {
      setProfileError((err as Error).message);
      return;
    }

    setProfileSaved(true);
    window.setTimeout(() => setProfileSaved(false), 2000);
  }

  // ── Notification settings (settings-api) ──
  const [notifications, setNotifications] = useState<Record<string, unknown>>({});
  const [notificationsSaved, setNotificationsSaved] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);

  // ── System settings (settings-api) ──
  const [systemSettings, setSystemSettings] = useState<Record<string, unknown>>({});
  const [defaultRegion, setDefaultRegion] = useState('us-east-1');
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState('60');
  const [systemSaved, setSystemSaved] = useState(false);
  const [systemError, setSystemError] = useState<string | null>(null);

  // ── Recommendation rules (settings-api, read by cost-optimization-api) ──
  const [rules, setRules] = useState<RecommendationRules>(DEFAULT_RECOMMENDATION_RULES);
  const [rulesSaved, setRulesSaved] = useState(false);
  const [rulesError, setRulesError] = useState<string | null>(null);

  // ── Git integration (cost-optimization-api, GitHub App for Auto-PR) ──
  const [gitInstallations, setGitInstallations] = useState<GitInstallation[]>([]);
  const [gitReposByInstallation, setGitReposByInstallation] = useState<Record<string, GitRepo[]>>({});
  const [gitReposLoading, setGitReposLoading] = useState<string | null>(null);
  const [gitReposError, setGitReposError] = useState<Record<string, string>>({});
  const [connectInstallationId, setConnectInstallationId] = useState('');
  const [gitConnecting, setGitConnecting] = useState(false);
  const [gitError, setGitError] = useState<string | null>(null);

  // ── Branding (settings-api) ──
  const [branding, setBranding] = useState<Record<string, unknown>>({});
  const [logoUrl, setLogoUrl] = useState('');
  const [primaryColor, setPrimaryColor] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [brandingSaved, setBrandingSaved] = useState(false);
  const [brandingError, setBrandingError] = useState<string | null>(null);

  // ── AWS integrations, billing, license, credentials, RBAC ──
  const [awsIntegrations, setAwsIntegrations] = useState<{ id: string; connection_name: string; status: string; environment: string; connection_method: string }[]>([]);
  const [license, setLicense] = useState<{ plan: string; seats: number; seatsUsed: number; planLimits: { connections: number | string; users: number | string } | null } | null>(null);
  const [credentials, setCredentials] = useState<{ connectionId: string; connectionName: string; connectionMethod: string; maskedAccessKey: string | null; keyRotatedAt: string | null; rotationDueInDays: number | null; rotationOverdue: boolean }[]>([]);
  const [roleGrants, setRoleGrants] = useState<{ id: string; user_id: string; role: Role; created_at: string; profiles: { email: string; full_name: string | null } | null }[]>([]);
  const [roleDefinitions, setRoleDefinitions] = useState<{ role: Role; description: string }[]>([]);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const planLimits = license?.planLimits ?? null;

  const loadRequestId = useRef(0);

  const load = useCallback(async () => {
    const thisRequest = ++loadRequestId.current;

    const SECTION_LABELS = [
      'Notification Settings', 'System Settings', 'Recommendation Rules',
      'Git Integration', 'Branding', 'AWS Integrations', 'License', 'Credentials', 'Roles & Permissions',
    ];

    const results = await Promise.allSettled([
      api.getNotificationSettings(),
      api.getSystemSettings(),
      api.getRecommendationRules(),
      api.getGitInstallations(),
      api.getBranding(),
      api.getAwsIntegrationsSummary(),
      api.getLicense(),
      api.getSettingsCredentials(),
      api.getRbac(),
    ]);

    if (thisRequest !== loadRequestId.current) return;

    setLoadErrors(
      results
        .map((r, i) => (r.status === 'rejected' ? `${SECTION_LABELS[i]}: ${r.reason instanceof Error ? r.reason.message : 'Could not load.'}` : null))
        .filter((m): m is string => m !== null),
    );

    const [
      notif,
      sys,
      rec,
      git,
      brand,
      aws,
      lic,
      creds,
      rbac,
    ] = results;

    if (notif.status === 'fulfilled') {
      setNotifications(notif.value);
    }

    if (sys.status === 'fulfilled') {
      const value = sys.value;
      setSystemSettings(value);
      setDefaultRegion(
        typeof value.defaultRegion === 'string' && REGIONS.includes(value.defaultRegion)
          ? value.defaultRegion
          : 'us-east-1',
      );
      setSessionTimeoutMinutes(
        typeof value.sessionTimeoutMinutes === 'number'
          ? String(value.sessionTimeoutMinutes)
          : '60',
      );
    }

    if (rec.status === 'fulfilled') {
      const value = rec.value;
      setRules({
        idleDetectionEnabled:
          typeof value.idleDetectionEnabled === 'boolean'
            ? value.idleDetectionEnabled
            : DEFAULT_RECOMMENDATION_RULES.idleDetectionEnabled,
        rightsizingEnabled:
          typeof value.rightsizingEnabled === 'boolean'
            ? value.rightsizingEnabled
            : DEFAULT_RECOMMENDATION_RULES.rightsizingEnabled,
        rightsizingCpuThresholdPct:
          typeof value.rightsizingCpuThresholdPct === 'number'
            ? value.rightsizingCpuThresholdPct
            : DEFAULT_RECOMMENDATION_RULES.rightsizingCpuThresholdPct,
        minMonthlySavingsToFlag:
          typeof value.minMonthlySavingsToFlag === 'number'
            ? value.minMonthlySavingsToFlag
            : DEFAULT_RECOMMENDATION_RULES.minMonthlySavingsToFlag,
      });
    }

    if (git.status === 'fulfilled') setGitInstallations(git.value.items ?? []);

    if (brand.status === 'fulfilled') {
      const value = brand.value;
      setBranding(value);
      setLogoUrl(typeof value.logoUrl === 'string' ? value.logoUrl : '');
      setPrimaryColor(typeof value.primaryColor === 'string' ? value.primaryColor : '');
      setCompanyName(typeof value.companyName === 'string' ? value.companyName : '');
    }

    if (aws.status === 'fulfilled') setAwsIntegrations(aws.value.connections ?? []);
    if (lic.status === 'fulfilled') setLicense(lic.value);
    if (creds.status === 'fulfilled') setCredentials(creds.value.credentials ?? []);

    if (rbac.status === 'fulfilled') {
      setRoleGrants(rbac.value.roleGrants ?? []);
      setRoleDefinitions(rbac.value.roleDefinitions ?? []);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (currentOrg) setMfaRequired(Boolean(currentOrg.mfa_required)); }, [currentOrg]);

  // GitHub redirects back with ?installation_id=... after the App install
  // flow (once the App's Setup URL is pointed here) — pre-fill rather than
  // require the user to dig the number out of the URL by hand.
  useEffect(() => {
    const installationId = new URLSearchParams(window.location.search).get('installation_id');
    if (installationId) setConnectInstallationId(installationId);
  }, []);

  async function handleConnectGit() {
    const rawInstallationId = connectInstallationId.trim();

    if (!/^\d{1,20}$/.test(rawInstallationId)) {
      setGitError('Enter a valid numeric installation ID.');
      return;
    }

    const installationId = Number(rawInstallationId);

    if (!Number.isSafeInteger(installationId) || installationId <= 0) {
      setGitError('Enter a valid numeric installation ID.');
      return;
    }

    if (gitInstallations.some(inst => Number(inst.id) === installationId)) {
      setGitError('This GitHub installation is already connected.');
      return;
    }

    setGitError(null);
    setGitConnecting(true);

    try {
      const created = await api.connectGitInstallation(installationId);
      setGitInstallations(prev => [
        created,
        ...prev.filter(inst => inst.id !== created.id),
      ]);
      setConnectInstallationId('');
    } catch (err) {
      setGitError(
        err instanceof Error
          ? err.message
          : 'Could not connect this installation.',
      );
    } finally {
      setGitConnecting(false);
    }
  }

  const [gitDisconnecting, setGitDisconnecting] = useState<string | null>(null);

  async function handleDisconnectGit(id: string) {
    if (gitDisconnecting === id) return;

    setGitDisconnecting(id);

    try {
      await api.disconnectGitInstallation(id);
      setGitInstallations(prev => prev.filter(i => i.id !== id));
      setGitReposByInstallation(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setGitReposError(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (err) {
      setGitError(
        err instanceof Error
          ? err.message
          : 'Could not disconnect this installation.',
      );
    } finally {
      setGitDisconnecting(null);
    }
  }

  const gitRepoRequestIds = useRef<Record<string, number>>({});

  async function handleLoadRepos(id: string) {
    const requestId = (gitRepoRequestIds.current[id] ?? 0) + 1;
    gitRepoRequestIds.current[id] = requestId;

    setGitReposLoading(id);
    setGitReposError(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

    try {
      const res = await api.getInstallationRepos(id);

      if (gitRepoRequestIds.current[id] !== requestId) return;

      setGitReposByInstallation(prev => ({
        ...prev,
        [id]: res.items ?? [],
      }));
    } catch (err) {
      if (gitRepoRequestIds.current[id] !== requestId) return;

      setGitReposError(prev => ({
        ...prev,
        [id]:
          err instanceof Error
            ? err.message
            : 'Could not load repositories.',
      }));
    } finally {
      if (gitRepoRequestIds.current[id] === requestId) {
        setGitReposLoading(null);
      }
    }
  }

  async function handleSaveNotifications(e: React.FormEvent) {
    e.preventDefault();
    setNotificationsError(null);
    try {
      const saved = await api.updateNotificationSettings(notifications);
      setNotifications(saved);
      setNotificationsSaved(true);
      setTimeout(() => setNotificationsSaved(false), 2000);
    } catch (err) {
      setNotificationsError(err instanceof Error ? err.message : 'Could not save notification settings.');
    }
  }

  async function handleSaveSystem(e: React.FormEvent) {
    e.preventDefault();
    setSystemError(null);

    if (!REGIONS.includes(defaultRegion)) {
      setSystemError('Select a valid default region.');
      return;
    }

    const timeout = parseBoundedNumber(sessionTimeoutMinutes, 5, 1440, 60);

    if (!Number.isFinite(Number(sessionTimeoutMinutes))) {
      setSystemError('Session timeout must be a valid number.');
      return;
    }

    try {
      const data = {
        ...systemSettings,
        defaultRegion,
        sessionTimeoutMinutes: timeout,
      };

      const saved = await api.updateSystemSettings(data);
      setSystemSettings(saved);
      setSessionTimeoutMinutes(String(timeout));
      setSystemSaved(true);
      window.setTimeout(() => setSystemSaved(false), 2000);
    } catch (err) {
      setSystemError(
        err instanceof Error
          ? err.message
          : 'Could not save system settings.',
      );
    }
  }

  async function handleSaveRules(e: React.FormEvent) {
    e.preventDefault();
    setRulesError(null);

    const validatedRules: RecommendationRules = {
      idleDetectionEnabled: Boolean(rules.idleDetectionEnabled),
      rightsizingEnabled: Boolean(rules.rightsizingEnabled),
      rightsizingCpuThresholdPct: parseBoundedNumber(
        String(rules.rightsizingCpuThresholdPct),
        1,
        100,
        DEFAULT_RECOMMENDATION_RULES.rightsizingCpuThresholdPct,
      ),
      minMonthlySavingsToFlag: parseBoundedNumber(
        String(rules.minMonthlySavingsToFlag),
        0,
        1_000_000_000,
        DEFAULT_RECOMMENDATION_RULES.minMonthlySavingsToFlag,
      ),
    };

    try {
      const saved = await api.updateRecommendationRules(validatedRules);
      setRules(saved);
      setRulesSaved(true);
      window.setTimeout(() => setRulesSaved(false), 2000);
    } catch (err) {
      setRulesError(
        err instanceof Error
          ? err.message
          : 'Could not save recommendation rules.',
      );
    }
  }

  async function handleSaveBranding(e: React.FormEvent) {
    e.preventDefault();
    setBrandingError(null);

    const normalizedLogoUrl = logoUrl.trim();
    const normalizedColor = primaryColor.trim();
    const normalizedCompanyName = companyName.trim();

    if (!isValidHttpUrl(normalizedLogoUrl)) {
      setBrandingError('Logo URL must be a valid HTTP or HTTPS URL.');
      return;
    }

    if (!isValidHexColor(normalizedColor)) {
      setBrandingError('Primary color must be a 6-digit hex color such as #2a78d6.');
      return;
    }

    if (normalizedCompanyName.length > 200) {
      setBrandingError('Company name must be 200 characters or fewer.');
      return;
    }

    try {
      const data = {
        ...branding,
        logoUrl: normalizedLogoUrl,
        primaryColor: normalizedColor,
        companyName: normalizedCompanyName,
      };

      const saved = await api.updateBranding(data);
      setBranding(saved);
      setLogoUrl(typeof saved.logoUrl === 'string' ? saved.logoUrl : normalizedLogoUrl);
      setPrimaryColor(
        typeof saved.primaryColor === 'string'
          ? saved.primaryColor
          : normalizedColor,
      );
      setCompanyName(
        typeof saved.companyName === 'string'
          ? saved.companyName
          : normalizedCompanyName,
      );
      setBrandingSaved(true);
      window.setTimeout(() => setBrandingSaved(false), 2000);
    } catch (err) {
      setBrandingError(
        err instanceof Error
          ? err.message
          : 'Could not save branding.',
      );
    }
  }

  const [mfaUpdating, setMfaUpdating] = useState(false);

  async function handleToggleMfaRequired() {
    if (mfaUpdating) return;

    setMfaError(null);
    setMfaUpdating(true);
    const next = !mfaRequired;

    try {
      const res = await api.setMfaRequired(next);
      setMfaRequired(Boolean(res.mfaRequired));
    } catch (err) {
      setMfaError(
        err instanceof Error
          ? err.message
          : 'Could not update this setting.',
      );
    } finally {
      setMfaUpdating(false);
    }
  }

  return (
    <div>
      <FilterBar title="Settings" showAccountFilter={false} showRegionFilter={false} showDateFilter={false} />

      {loadErrors.length > 0 && (
        <div className="mb-4 rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-300" role="alert">
          <div className="flex items-center justify-between gap-3">
            <span>Some settings sections failed to load — the fields below may be showing defaults, not your actual saved values.</span>
            <button type="button" onClick={() => void load()} className="text-xs underline shrink-0">Retry</button>
          </div>
          <ul className="mt-1 list-disc list-inside text-xs">
            {loadErrors.map(m => <li key={m}>{m}</li>)}
          </ul>
        </div>
      )}

      <div
        className="flex gap-1 mb-4 border-b border-slate-200 dark:border-slate-800 overflow-x-auto"
        role="tablist"
        aria-label="Settings sections"
      >
        {visibleTabs.map(t => (
          <button
            type="button"
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`text-sm px-3 py-2 border-b-2 -mb-px whitespace-nowrap ${tab === t ? 'border-brand-600 text-brand-600 dark:text-brand-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <form onSubmit={handleSaveProfile} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col gap-3">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300">Profile</h3>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-500 dark:text-slate-400">Email</span>
              <input aria-label="Email" disabled value={user?.email ?? ''} className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-slate-500" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-500 dark:text-slate-400">Full name</span>
              <input aria-label="Full name" value={fullName} maxLength={200} onChange={e => setFullName(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-500 dark:text-slate-400">Timezone</span>
              <select aria-label="Timezone" value={timezone} onChange={e => setTimezone(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white">
                {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-500 dark:text-slate-400">Date format</span>
              <select aria-label="Date format" value={dateFormat} onChange={e => setDateFormat(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white">
                {DATE_FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
            <button type="submit" className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium py-2 mt-1">Save</button>
            {profileSaved && <p className="text-xs text-emerald-500">Saved.</p>}
            {profileError && <p className="text-xs text-red-500">{profileError}</p>}
          </form>

          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Appearance</h3>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-300">Theme</span>
                <button type="button" onClick={toggleTheme} className="rounded-md border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-slate-600 dark:text-slate-300">{theme === 'dark' ? 'Dark' : 'Light'} — switch</button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Session</h3>
              <button type="button" onClick={() => void signOut()} className="text-sm text-red-500 hover:underline">Sign out of this device</button>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">API Keys</h3>
              <p className="text-xs text-slate-400">
                API key management moved to <Link to="/users-groups" className="text-brand-600 dark:text-brand-400 hover:underline">Users &amp; Groups</Link>.
              </p>
            </div>
          </div>
        </div>
      )}

      {tab === 'Cloud Integrations' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Cloud Integrations</h3>
          <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
            {awsIntegrations.map(c => (
              <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-slate-700 dark:text-slate-200">{c.connection_name}</span>
                <div className="flex items-center gap-2">
                  <Badge tone="neutral">{c.environment}</Badge>
                  <Badge>{c.status}</Badge>
                </div>
              </li>
            ))}
            {awsIntegrations.length === 0 && <li className="py-2 text-sm text-slate-400">No cloud accounts connected yet.</li>}
          </ul>
        </div>
      )}

      {tab === 'Notifications' && (
        <form onSubmit={handleSaveNotifications} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col gap-3 max-w-md">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300">Notifications</h3>
          <label className="flex items-center justify-between text-sm">
            <span className="text-slate-600 dark:text-slate-300">Email digest</span>
            <input type="checkbox" aria-label="Email digest" checked={Boolean(notifications.emailDigest)} onChange={e => setNotifications(prev => ({ ...prev, emailDigest: e.target.checked }))} />
          </label>
          <label className="flex items-center justify-between text-sm">
            <span className="text-slate-600 dark:text-slate-300">Critical alert emails</span>
            <input type="checkbox" aria-label="Critical alert emails" checked={Boolean(notifications.criticalAlertEmails)} onChange={e => setNotifications(prev => ({ ...prev, criticalAlertEmails: e.target.checked }))} />
          </label>
          <label className="flex items-center justify-between text-sm">
            <span className="text-slate-600 dark:text-slate-300">Weekly summary</span>
            <input type="checkbox" aria-label="Weekly summary" checked={Boolean(notifications.weeklySummary)} onChange={e => setNotifications(prev => ({ ...prev, weeklySummary: e.target.checked }))} />
          </label>
          <button type="submit" className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium py-2 mt-1">Save</button>
          {notificationsSaved && <p className="text-xs text-emerald-500">Saved.</p>}
          {notificationsError && <p className="text-xs text-red-500">{notificationsError}</p>}
        </form>
      )}

      {tab === 'Credentials' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Credential Rotation</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500 dark:text-slate-400">
                <th className="py-2">Connection</th><th className="py-2">Method</th><th className="py-2">Masked Key</th><th className="py-2">Rotated</th><th className="py-2">Rotation Due</th>
              </tr>
            </thead>
            <tbody>
              {credentials.map(c => (
                <tr key={c.connectionId} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                  <td className="py-2 text-slate-700 dark:text-slate-200">{c.connectionName}</td>
                  <td className="py-2 text-slate-500 dark:text-slate-400">{(CONNECTION_METHOD_LABELS[c.connectionMethod] ?? c.connectionMethod) || 'Unknown'}</td>
                  <td className="py-2 font-mono text-xs text-slate-500 dark:text-slate-400">{c.maskedAccessKey ?? '—'}</td>
                  <td className="py-2 text-slate-500 dark:text-slate-400">{c.keyRotatedAt ? formatSafeDate(c.keyRotatedAt) : '—'}</td>
                  <td className="py-2">
                    {c.rotationDueInDays === null ? <span className="text-slate-400">—</span>
                      : c.rotationOverdue ? <Badge tone="critical">overdue</Badge>
                      : <span className="text-slate-500 dark:text-slate-400">{c.rotationDueInDays} days</span>}
                  </td>
                </tr>
              ))}
              {credentials.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-sm text-slate-400">No credentials to rotate.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'RBAC' && (
        <>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-5">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Security</h3>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-slate-600 dark:text-slate-300">Require MFA for all members</span>
              {isOwner ? (
                <button
                  type="button"
                  role="switch"
                  aria-checked={mfaRequired}
                  aria-label="Require MFA for all members"
                  disabled={mfaUpdating}
                  onClick={() => void handleToggleMfaRequired()}
                  className={`rounded-full w-10 h-5 relative transition-colors disabled:opacity-50 ${mfaRequired ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-700'}`}
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${mfaRequired ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              ) : (
                <Badge tone={mfaRequired ? 'good' : 'neutral'}>{mfaRequired ? 'required' : 'not required'}</Badge>
              )}
            </div>
            {!isOwner && <p className="text-xs text-slate-400">Only an organization owner can change this setting.</p>}
            {mfaError && <p className="text-xs text-red-500 mt-1">{mfaError}</p>}
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Role Grants (RBAC)</h3>
            <table className="w-full text-sm mb-4">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500 dark:text-slate-400">
                  <th className="py-2">User</th><th className="py-2">Role</th><th className="py-2">Granted</th>
                </tr>
              </thead>
              <tbody>
                {roleGrants.map(g => (
                  <tr key={g.id} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                    <td className="py-2 text-slate-700 dark:text-slate-200">{g.profiles?.email ?? g.user_id}</td>
                    <td className="py-2"><Badge tone="neutral">{g.role}</Badge></td>
                    <td className="py-2 text-slate-500 dark:text-slate-400">{formatSafeDate(g.created_at)}</td>
                  </tr>
                ))}
                {roleGrants.length === 0 && <tr><td colSpan={3} className="py-4 text-center text-sm text-slate-400">No role grants yet.</td></tr>}
              </tbody>
            </table>
            <h4 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Role Reference</h4>
            <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
              {roleDefinitions.map(r => (
                <li key={r.role} className="py-1.5 text-sm flex flex-col gap-0.5">
                  <span className="font-medium text-slate-700 dark:text-slate-200 capitalize">{r.role.replace(/_/g, ' ')}</span>
                  <span className="text-xs text-slate-400">{r.description}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {tab === 'System Settings' && (
        <form onSubmit={handleSaveSystem} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col gap-3 max-w-md">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300">System Settings</h3>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500 dark:text-slate-400">Default region</span>
            <select value={defaultRegion} onChange={e => setDefaultRegion(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white">
              {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500 dark:text-slate-400">Session timeout (minutes)</span>
            <input type="number" min={5} max={1440} value={sessionTimeoutMinutes} onChange={e => setSessionTimeoutMinutes(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white" />
          </label>
          <button type="submit" className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium py-2 mt-1">Save</button>
          {systemSaved && <p className="text-xs text-emerald-500">Saved.</p>}
          {systemError && <p className="text-xs text-red-500">{systemError}</p>}
        </form>
      )}

      {tab === 'Recommendation Rules' && (
        <div className="flex flex-col gap-4 max-w-md">
          <form onSubmit={handleSaveRules} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col gap-3">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300">Recommendation Rules</h3>
            <p className="text-xs text-slate-400">Controls what "Sync Now" flags as a savings opportunity going forward. Turning a category off doesn't remove recommendations already flagged — only new ones on future syncs.</p>

            <label className="flex items-center justify-between text-sm pt-1">
              <span className="text-slate-600 dark:text-slate-300">Unused resource detection (idle instances, unattached volumes/IPs)</span>
              <input type="checkbox" aria-label="Unused resource detection" checked={rules.idleDetectionEnabled} onChange={e => setRules(r => ({ ...r, idleDetectionEnabled: e.target.checked }))} />
            </label>

            <label className="flex items-center justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-300">Rightsizing detection</span>
              <input type="checkbox" aria-label="Rightsizing detection" checked={rules.rightsizingEnabled} onChange={e => setRules(r => ({ ...r, rightsizingEnabled: e.target.checked }))} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-500 dark:text-slate-400">Flag instances averaging below this CPU %</span>
              <input type="number" min={1} max={100} value={rules.rightsizingCpuThresholdPct} disabled={!rules.rightsizingEnabled}
                onChange={e => setRules(r => ({ ...r, rightsizingCpuThresholdPct: Number(e.target.value) || DEFAULT_RECOMMENDATION_RULES.rightsizingCpuThresholdPct }))}
                className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white disabled:opacity-50" />
            </label>

            <label className="flex flex-col gap-1 text-sm pt-1">
              <span className="text-slate-500 dark:text-slate-400">Minimum $/month savings to flag (reduces noise)</span>
              <input type="number" min={0} step={0.5} value={rules.minMonthlySavingsToFlag} max={1000000000}
                onChange={e => setRules(r => ({ ...r, minMonthlySavingsToFlag: Number(e.target.value) || 0 }))}
                className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white" />
            </label>

            <button type="submit" className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium py-2 mt-1">Save</button>
            {rulesSaved && <p className="text-xs text-emerald-500">Saved.</p>}
            {rulesError && <p className="text-xs text-red-500">{rulesError}</p>}
          </form>

          <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 opacity-60">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300">Scheduling rules</h3>
              <Badge tone="neutral">Coming soon</Badge>
            </div>
            <p className="text-xs text-slate-400 mt-1">Flagging instances that run 24/7 but could be scheduled off nights/weekends — not built yet.</p>
          </div>
        </div>
      )}

      {tab === 'Git Integration' && (
        <div className="flex flex-col gap-4 max-w-2xl">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col gap-3">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300">Connect a GitHub repository</h3>
            <p className="text-xs text-slate-400">Powers Auto-PR on Guided Fix — install the CloudOps360 GitHub App on the repo(s) you want it to open pull requests against, then paste the numeric Installation ID from the URL GitHub redirects you to (the number after <span className="font-mono">/installations/</span>) below.</p>
            <div className="flex gap-2">
              <input aria-label="GitHub installation ID" value={connectInstallationId} inputMode="numeric" maxLength={20} onChange={e => setConnectInstallationId(e.target.value)} placeholder="Installation ID, e.g. 12345678" className="flex-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white" />
              <button type="button" onClick={() => void handleConnectGit()} disabled={gitConnecting} className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 disabled:opacity-50">{gitConnecting ? 'Connecting…' : 'Connect'}</button>
            </div>
            {gitError && <p className="text-xs text-red-500">{gitError}</p>}
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Connected installations</h3>
            <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
              {gitInstallations.map(inst => (
                <li key={inst.id} className="py-2.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-700 dark:text-slate-200 font-medium">{inst.account_login}</span>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => void handleLoadRepos(inst.id)} disabled={gitReposLoading === inst.id} className="text-xs text-brand-600 dark:text-brand-400 hover:underline disabled:opacity-50">{gitReposLoading === inst.id ? 'Loading…' : 'View repos'}</button>
                      <button
                        type="button"
                        onClick={() => void handleDisconnectGit(inst.id)}
                        disabled={gitDisconnecting === inst.id}
                        className="text-xs text-red-500 hover:underline disabled:opacity-50"
                      >
                        {gitDisconnecting === inst.id ? 'Disconnecting…' : 'Disconnect'}
                      </button>
                    </div>
                  </div>
                  {gitReposError[inst.id] && <p className="text-xs text-red-500 mt-1">{gitReposError[inst.id]}</p>}
                  {gitReposByInstallation[inst.id] && (
                    <ul className="mt-2 flex flex-col gap-1">
                      {gitReposByInstallation[inst.id].map(repo => (
                        <li key={repo.fullName} className="text-xs text-slate-500 dark:text-slate-400 font-mono flex items-center gap-2">
                          {repo.fullName}
                          {repo.private && <Badge tone="neutral">private</Badge>}
                        </li>
                      ))}
                      {gitReposByInstallation[inst.id].length === 0 && <li className="text-xs text-slate-400">No repositories granted to this installation.</li>}
                    </ul>
                  )}
                </li>
              ))}
              {gitInstallations.length === 0 && <li className="py-2 text-sm text-slate-400">No GitHub installations connected yet.</li>}
            </ul>
          </div>
        </div>
      )}

      {tab === 'Branding' && (
        <form onSubmit={handleSaveBranding} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col gap-3 max-w-md">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300">Branding</h3>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500 dark:text-slate-400">Company name</span>
            <input aria-label="Company name" value={companyName} maxLength={200} onChange={e => setCompanyName(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500 dark:text-slate-400">Logo URL</span>
            <input aria-label="Logo URL" value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://…" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500 dark:text-slate-400">Primary color</span>
            <input aria-label="Primary color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} placeholder="#2a78d6" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white" />
          </label>
          <button type="submit" className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium py-2 mt-1">Save</button>
          {brandingSaved && <p className="text-xs text-emerald-500">Saved.</p>}
          {brandingError && <p className="text-xs text-red-500">{brandingError}</p>}
        </form>
      )}

      {tab === 'License' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">License</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
              <span className="text-xs text-slate-400 block">Plan</span>
              <span className="font-medium text-slate-800 dark:text-slate-100 capitalize">{license?.plan ?? '—'}</span>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
              <span className="text-xs text-slate-400 block">Seats (used / total)</span>
              <span className="font-medium text-slate-800 dark:text-slate-100">{license ? `${license.seatsUsed} / ${license.seats}` : '—'}</span>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 col-span-2">
              <span className="text-xs text-slate-400 block">Connection / User Limits</span>
              <span className="font-medium text-slate-800 dark:text-slate-100">{planLimits ? `${planLimits.connections} connections / ${planLimits.users} users` : '—'}</span>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-3">The seat limit above is enforced — inviting past it is refused. The connection limit is informational only, not yet enforced.</p>
          <Link to="/subscription" className="text-xs text-brand-600 dark:text-brand-400 hover:underline mt-2 inline-block">Manage plan and billing →</Link>
        </div>
      )}
    </div>
  );
}