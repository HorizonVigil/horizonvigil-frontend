import type { Provider } from '../../../lib/cloudAccounts/overview';

/**
 * Compact provider marks (spec §7 — "provider icon + number should be
 * visually prominent"). Deliberately stylised geometric glyphs in each
 * provider's brand hue rather than the trademarked logos, matching the way
 * the rest of the app renders provider identity.
 */
export function ProviderMark({ provider, size = 22 }: { provider: Provider; size?: number }) {
  if (provider === 'aws') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="AWS" fill="none">
        <rect x="1" y="1" width="22" height="22" rx="5" fill="#FF9900" fillOpacity="0.14" />
        <path d="M6 13.5c3.6 2.1 8.4 2.1 12 0" stroke="#FF9900" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M16.5 12.4c.8-.3 1.6-.2 1.9.4.3.6-.1 1.5-.9 2.2" stroke="#FF9900" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M7 8.5 8.6 13m0 0L10 8.5M9.3 11.5h-1.4" stroke="#EC7211" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (provider === 'azure') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Azure" fill="none">
        <rect x="1" y="1" width="22" height="22" rx="5" fill="#0078D4" fillOpacity="0.14" />
        <path d="M10.5 5 5 17h4l4.2-9.2L10.5 5Z" fill="#0078D4" />
        <path d="m13.2 8 5.3 11H9.6l1.4-2.4h4L13.2 8Z" fill="#0078D4" fillOpacity="0.6" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="GCP" fill="none">
      <rect x="1" y="1" width="22" height="22" rx="5" fill="#1A73E8" fillOpacity="0.12" />
      <circle cx="12" cy="12" r="4.4" fill="none" stroke="#4285F4" strokeWidth="1.8" />
      <path d="M12 3.5v3.6" stroke="#EA4335" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M20.5 12h-3.6" stroke="#FBBC04" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 20.5v-3.6" stroke="#34A853" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M3.5 12h3.6" stroke="#4285F4" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
