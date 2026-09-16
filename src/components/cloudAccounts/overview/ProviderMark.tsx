import type { Provider } from '../../../lib/cloudAccounts/overview';

interface ProviderMarkProps {
  provider: Provider;
  size?: number;
  className?: string;
  decorative?: boolean;
}

const DEFAULT_SIZE = 22;
const MIN_SIZE = 12;
const MAX_SIZE = 128;

const PROVIDER_LABELS: Record<Provider, string> = {
  aws: 'AWS',
  azure: 'Azure',
  gcp: 'GCP',
};

function normalizeSize(size: number | undefined): number {
  if (!Number.isFinite(size)) {
    return DEFAULT_SIZE;
  }

  return Math.min(
    MAX_SIZE,
    Math.max(MIN_SIZE, Math.round(size as number)),
  );
}

/**
 * Compact provider identity mark.
 *
 * The component intentionally uses stylised geometric marks rather than
 * provider trademarks/logos.
 *
 * Accessibility:
 * - By default the SVG is exposed as an image with an accessible provider
 *   label.
 * - `decorative` can be used when the provider name is already provided
 *   nearby, preventing duplicate screen-reader announcements.
 *
 * API compatibility:
 * - Existing callers using `<ProviderMark provider="aws" />` continue to work.
 * - Existing `size` behaviour is preserved while invalid/extreme values are
 *   safely normalised.
 */
export function ProviderMark({
  provider,
  size = DEFAULT_SIZE,
  className,
  decorative = false,
}: ProviderMarkProps) {
  const normalizedSize = normalizeSize(size);
  const label = PROVIDER_LABELS[provider];

  /*
   * Provider is expected to be a closed union from the domain model.
   * The explicit fallback keeps this component defensive if the runtime
   * receives unexpected data from an API boundary.
   */
  if (!label) {
    return null;
  }

  const titleId = `provider-mark-${provider}-${normalizedSize}`;

  const commonProps = {
    width: normalizedSize,
    height: normalizedSize,
    viewBox: '0 0 24 24',
    fill: 'none',
    className,
    focusable: false,
    'aria-hidden': decorative ? true : undefined,
    role: decorative ? undefined : ('img' as const),
    'aria-label': decorative ? undefined : label,
    'aria-labelledby': decorative ? undefined : titleId,
  };

  if (provider === 'aws') {
    return (
      <svg {...commonProps}>
        {!decorative && <title id={titleId}>{label}</title>}

        <rect
          x="1"
          y="1"
          width="22"
          height="22"
          rx="5"
          fill="#FF9900"
          fillOpacity="0.14"
        />

        <path
          d="M6 13.5c3.6 2.1 8.4 2.1 12 0"
          stroke="#FF9900"
          strokeWidth="1.8"
          strokeLinecap="round"
        />

        <path
          d="M16.5 12.4c.8-.3 1.6-.2 1.9.4.3.6-.1 1.5-.9 2.2"
          stroke="#FF9900"
          strokeWidth="1.8"
          strokeLinecap="round"
        />

        <path
          d="M7 8.5 8.6 13m0 0L10 8.5M9.3 11.5h-1.4"
          stroke="#EC7211"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (provider === 'azure') {
    return (
      <svg {...commonProps}>
        {!decorative && <title id={titleId}>{label}</title>}

        <rect
          x="1"
          y="1"
          width="22"
          height="22"
          rx="5"
          fill="#0078D4"
          fillOpacity="0.14"
        />

        <path
          d="M10.5 5 5 17h4l4.2-9.2L10.5 5Z"
          fill="#0078D4"
        />

        <path
          d="m13.2 8 5.3 11H9.6l1.4-2.4h4L13.2 8Z"
          fill="#0078D4"
          fillOpacity="0.6"
        />
      </svg>
    );
  }

  if (provider === 'gcp') {
    return (
      <svg {...commonProps}>
        {!decorative && <title id={titleId}>{label}</title>}

        <rect
          x="1"
          y="1"
          width="22"
          height="22"
          rx="5"
          fill="#1A73E8"
          fillOpacity="0.12"
        />

        <circle
          cx="12"
          cy="12"
          r="4.4"
          fill="none"
          stroke="#4285F4"
          strokeWidth="1.8"
        />

        <path
          d="M12 3.5v3.6"
          stroke="#EA4335"
          strokeWidth="1.8"
          strokeLinecap="round"
        />

        <path
          d="M20.5 12h-3.6"
          stroke="#FBBC04"
          strokeWidth="1.8"
          strokeLinecap="round"
        />

        <path
          d="M12 20.5v-3.6"
          stroke="#34A853"
          strokeWidth="1.8"
          strokeLinecap="round"
        />

        <path
          d="M3.5 12h3.6"
          stroke="#4285F4"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  /*
   * Defensive fallback.
   *
   * This should be unreachable when Provider remains a correctly defined
   * closed union, but returning null is safer than rendering an incorrect
   * provider identity.
   */
  return null;
}