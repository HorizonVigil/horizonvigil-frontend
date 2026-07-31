import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { FilterBar } from '../components/FilterBar';
import { Badge } from '../components/Badge';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { useOrg } from '../lib/orgContext';
import { supabase } from '../lib/supabase';
import { useTabParam } from '../lib/useTabParam';
import { api, type Role } from '../lib/api';

const TIMEZONES = ['UTC', 'America/New_York', 'America/Los_Angeles', 'America/Chicago', 'Europe/London', 'Europe/Berlin', 'Asia/Kolkata', 'Asia/Singapore', 'Australia/Sydney'];
const DATE_FORMATS = ['YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY'];
const REGIONS = ['us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'eu-west-1', 'eu-central-1', 'ap-south-1', 'ap-southeast-1', 'ap-northeast-1'];

// Profile/Appearance/Session aren't among the 8 org-wide settings the
// sidebar names (those are all per-org; these are per-you) — grouped
// under one Profile tab since none of the 8 is a natural home for them.
const TABS = ['Profile', 'AWS Integrations', 'Billing', 'Notifications', 'Credentials', 'RBAC', 'System Settings', 'Branding', 'License'] as const;
type Tab = typeof TABS[number];

export function Settings() {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { currentOrg } = useOrg();
  const [tab, setTab] = useTabParam<Tab>(TABS, 'Profile');
  const isOwner = currentOrg?.myRole === 'owner';

  // ── Profile (Supabase profiles table — unrelated to the domain-service split) ──
  const [fullName, setFullName] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [dateFormat, setDateFormat] = useState('YYYY-MM-DD');
  const [profileSaved, setProfileSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    void supabase.from('profiles').select('full_name,timezone,date_format').eq('id', user.id).single().then(({ data }) => {
      if (data) {
        setFullName(data.full_name ?? '');
        setTimezone(data.timezone ?? 'UTC');
        setDateFormat(data.date_format ?? 'YYYY-MM-DD');
      }
    });
  }, [user]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    await supabase.from('profiles').update({ full_name: fullName, timezone, date_format: dateFormat }).eq('id', user.id);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2000);
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

  // ── Branding (settings-api) ──
  const [branding, setBranding] = useState<Record<string, unknown>>({});
  const [logoUrl, setLogoUrl] = useState('');
  const [primaryColor, setPrimaryColor] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [brandingSaved, setBrandingSaved] = useState(false);
  const [brandingError, setBrandingError] = useState<string | null>(null);

  // ── AWS integrations, billing, license, credentials, RBAC ──
  const [awsIntegrations, setAwsIntegrations] = useState<{ id: string; connection_name: string; status: string; environment: string; connection_method: string }[]>([]);
  const [billing, setBilling] = useState<{ plan: string; seats: number; seatsUsed: number; invoices: []; notIntegrated: true; reason: string } | null>(null);
  const [license, setLicense] = useState<{ plan: string; seats: number; seatsUsed: number; planLimits: { connections: number | string; users: number | string } | null } | null>(null);
  const [credentials, setCredentials] = useState<{ connectionId: string; connectionName: string; connectionMethod: string; maskedAccessKey: string | null; keyRotatedAt: string | null; rotationDueInDays: number | null; rotationOverdue: boolean }[]>([]);
  const [roleGrants, setRoleGrants] = useState<{ id: string; user_id: string; role: Role; created_at: string; profiles: { email: string; full_name: string | null } | null }[]>([]);
  const [roleDefinitions, setRoleDefinitions] = useState<{ role: Role; description: string }[]>([]);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const planLimits = license?.planLimits ?? null;

  const load = useCallback(async () => {
    const [notif, sys, brand, aws, bill, lic, creds, rbac] = await Promise.all([
      api.getNotificationSettings(),
      api.getSystemSettings(),
      api.getBranding(),
      api.getAwsIntegrationsSummary(),
      api.getBilling(),
      api.getLicense(),
      api.getSettingsCredentials(),
      api.getRbac(),
    ]);
    setNotifications(notif);
    setSystemSettings(sys);
    setDefaultRegion(typeof sys.defaultRegion === 'string' ? sys.defaultRegion : 'us-east-1');
    setSessionTimeoutMinutes(typeof sys.sessionTimeoutMinutes === 'number' ? String(sys.sessionTimeoutMinutes) : '60');
    setBranding(brand);
    setLogoUrl(typeof brand.logoUrl === 'string' ? brand.logoUrl : '');
    setPrimaryColor(typeof brand.primaryColor === 'string' ? brand.primaryColor : '');
    setCompanyName(typeof brand.companyName === 'string' ? brand.companyName : '');
    setAwsIntegrations(aws.connections);
    setBilling(bill);
    setLicense(lic);
    setCredentials(creds.credentials);
    setRoleGrants(rbac.roleGrants);
    setRoleDefinitions(rbac.roleDefinitions);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (currentOrg) setMfaRequired(currentOrg.mfa_required); }, [currentOrg]);

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
    try {
      const data = { ...systemSettings, defaultRegion, sessionTimeoutMinutes: Number(sessionTimeoutMinutes) || 60 };
      const saved = await api.updateSystemSettings(data);
      setSystemSettings(saved);
      setSystemSaved(true);
      setTimeout(() => setSystemSaved(false), 2000);
    } catch (err) {
      setSystemError(err instanceof Error ? err.message : 'Could not save system settings.');
    }
  }

  async function handleSaveBranding(e: React.FormEvent) {
    e.preventDefault();
    setBrandingError(null);
    try {
      const data = { ...branding, logoUrl, primaryColor, companyName };
      const saved = await api.updateBranding(data);
      setBranding(saved);
      setBrandingSaved(true);
      setTimeout(() => setBrandingSaved(false), 2000);
    } catch (err) {
      setBrandingError(err instanceof Error ? err.message : 'Could not save branding.');
    }
  }

  async function handleToggleMfaRequired() {
    setMfaError(null);
    const next = !mfaRequired;
    try {
      const res = await api.setMfaRequired(next);
      setMfaRequired(res.mfaRequired);
    } catch (err) {
      setMfaError(err instanceof Error ? err.message : 'Could not update this setting.');
    }
  }

  return (
    <div>
      <FilterBar title="Settings" showAccountFilter={false} />

      <div className="flex gap-1 mb-4 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`text-sm px-3 py-2 border-b-2 -mb-px whitespace-nowrap ${tab === t ? 'border-brand-600 text-brand-600 dark:text-brand-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}>
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
              <input disabled value={user?.email ?? ''} className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-slate-500" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-500 dark:text-slate-400">Full name</span>
              <input value={fullName} onChange={e => setFullName(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-500 dark:text-slate-400">Timezone</span>
              <select value={timezone} onChange={e => setTimezone(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white">
                {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-500 dark:text-slate-400">Date format</span>
              <select value={dateFormat} onChange={e => setDateFormat(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white">
                {DATE_FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
            <button type="submit" className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium py-2 mt-1">Save</button>
            {profileSaved && <p className="text-xs text-emerald-500">Saved.</p>}
          </form>

          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Appearance</h3>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-300">Theme</span>
                <button onClick={toggleTheme} className="rounded-md border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-slate-600 dark:text-slate-300">{theme === 'dark' ? 'Dark' : 'Light'} — switch</button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Session</h3>
              <button onClick={() => void signOut()} className="text-sm text-red-500 hover:underline">Sign out of this device</button>
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

      {tab === 'AWS Integrations' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">AWS Integrations</h3>
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
            {awsIntegrations.length === 0 && <li className="py-2 text-sm text-slate-400">No AWS accounts connected yet.</li>}
          </ul>
        </div>
      )}

      {tab === 'Billing' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Billing</h3>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
              <span className="text-xs text-slate-400 block">Plan</span>
              <span className="font-medium text-slate-800 dark:text-slate-100 capitalize">{billing?.plan ?? '—'}</span>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
              <span className="text-xs text-slate-400 block">Seats</span>
              <span className="font-medium text-slate-800 dark:text-slate-100">{billing?.seats ?? '—'}</span>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
              <span className="text-xs text-slate-400 block">Seats Used</span>
              <span className="font-medium text-slate-800 dark:text-slate-100">{billing?.seatsUsed ?? '—'}</span>
            </div>
          </div>
          <div>
            <span className="text-xs text-slate-400 block mb-1">Invoices</span>
            {billing && billing.invoices.length === 0 && !billing.notIntegrated && <p className="text-sm text-slate-400">No invoices yet.</p>}
            {billing?.notIntegrated && (
              <p className="text-xs text-slate-400 rounded-md bg-slate-50 dark:bg-slate-800/60 px-3 py-2">{billing.reason}</p>
            )}
          </div>
        </div>
      )}

      {tab === 'Notifications' && (
        <form onSubmit={handleSaveNotifications} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col gap-3 max-w-md">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300">Notifications</h3>
          <label className="flex items-center justify-between text-sm">
            <span className="text-slate-600 dark:text-slate-300">Email digest</span>
            <input type="checkbox" checked={Boolean(notifications.emailDigest)} onChange={e => setNotifications(prev => ({ ...prev, emailDigest: e.target.checked }))} />
          </label>
          <label className="flex items-center justify-between text-sm">
            <span className="text-slate-600 dark:text-slate-300">Critical alert emails</span>
            <input type="checkbox" checked={Boolean(notifications.criticalAlertEmails)} onChange={e => setNotifications(prev => ({ ...prev, criticalAlertEmails: e.target.checked }))} />
          </label>
          <label className="flex items-center justify-between text-sm">
            <span className="text-slate-600 dark:text-slate-300">Weekly summary</span>
            <input type="checkbox" checked={Boolean(notifications.weeklySummary)} onChange={e => setNotifications(prev => ({ ...prev, weeklySummary: e.target.checked }))} />
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
                  <td className="py-2 text-slate-500 dark:text-slate-400">{c.connectionMethod === 'cross_account_role' ? 'Cross-account role' : 'Access key'}</td>
                  <td className="py-2 font-mono text-xs text-slate-500 dark:text-slate-400">{c.maskedAccessKey ?? '—'}</td>
                  <td className="py-2 text-slate-500 dark:text-slate-400">{c.keyRotatedAt ? new Date(c.keyRotatedAt).toLocaleDateString() : '—'}</td>
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
                <button onClick={() => void handleToggleMfaRequired()} className={`rounded-full w-10 h-5 relative transition-colors ${mfaRequired ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-700'}`}>
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
                    <td className="py-2 text-slate-500 dark:text-slate-400">{new Date(g.created_at).toLocaleDateString()}</td>
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
            <input type="number" min={5} value={sessionTimeoutMinutes} onChange={e => setSessionTimeoutMinutes(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white" />
          </label>
          <button type="submit" className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium py-2 mt-1">Save</button>
          {systemSaved && <p className="text-xs text-emerald-500">Saved.</p>}
          {systemError && <p className="text-xs text-red-500">{systemError}</p>}
        </form>
      )}

      {tab === 'Branding' && (
        <form onSubmit={handleSaveBranding} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col gap-3 max-w-md">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300">Branding</h3>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500 dark:text-slate-400">Company name</span>
            <input value={companyName} onChange={e => setCompanyName(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500 dark:text-slate-400">Logo URL</span>
            <input value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://…" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500 dark:text-slate-400">Primary color</span>
            <input value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} placeholder="#2a78d6" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white" />
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
          <p className="text-xs text-slate-400 mt-3">Plan limits are informational — not enforced in this pass.</p>
        </div>
      )}
    </div>
  );
}
