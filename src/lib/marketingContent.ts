/**
 * Shared, real content for the public marketing site.
 *
 * Pricing values are intentionally kept in one place so Pricing.tsx and other
 * public surfaces cannot drift from one another. The billing database remains
 * the authoritative source of entitlement enforcement and checkout pricing;
 * this file is presentation/configuration data only.
 *
 * There is currently no lead-capture backend for the public marketing site,
 * so Contact Sales / Book a Demo remain honest mailto links.
 */

export const CONTACT_SALES_HREF =
  'mailto:sales@horizonvigil.com?subject=HorizonVigil%20%E2%80%94%20Contact%20Sales';

export const BOOK_DEMO_HREF =
  'mailto:sales@horizonvigil.com?subject=HorizonVigil%20%E2%80%94%20Book%20a%20Demo';

export interface MarketingPlan {
  key: string;
  name: string;
  monthlyCents: number;
  annualCents: number;
  tagline: string;
  cloudAccounts: string;
  users: string;
  automations: string;
  retention: string;
  support: string;
  sla: string | null;
  sso: boolean;
  samlSso: boolean;
  auditLog: boolean;
  compliance: string[];
  highlighted?: boolean;
}

const UNLIMITED_SENTINEL = -1;

function formatLimit(value: number): string {
  return value === UNLIMITED_SENTINEL
    ? 'Unlimited'
    : Number.isFinite(value)
      ? Math.max(0, Math.trunc(value)).toLocaleString()
      : 'Unavailable';
}

function clonePlan(plan: MarketingPlan): MarketingPlan {
  return {
    ...plan,
    compliance: [...plan.compliance],
  };
}

/**
 * Public marketing plan catalogue.
 *
 * Keep claims limited to capabilities represented by the fields here.
 * Entitlement checks and actual billing limits belong to the backend.
 */
export const MARKETING_PLANS: readonly MarketingPlan[] = [
  {
    key: 'free',
    name: 'Free',
    monthlyCents: 0,
    annualCents: 0,
    tagline:
      'Connect one account and see what HorizonVigil finds.',
    cloudAccounts: formatLimit(1),
    users: formatLimit(2),
    automations: formatLimit(0),
    retention: '7 days',
    support: 'Community',
    sla: null,
    sso: false,
    samlSso: false,
    auditLog: false,
    compliance: [],
  },
  {
    key: 'starter',
    name: 'Starter',
    monthlyCents: 4900,
    annualCents: 3900,
    tagline:
      'For small teams running production on one or two clouds.',
    cloudAccounts: formatLimit(3),
    users: formatLimit(5),
    automations: formatLimit(5),
    retention: '30 days',
    support: 'Email',
    sla: null,
    sso: false,
    samlSso: false,
    auditLog: true,
    compliance: [],
  },
  {
    key: 'professional',
    name: 'Professional',
    monthlyCents: 19900,
    annualCents: 15900,
    tagline:
      'Multi-account, multi-org — the common starting point for growing platform teams.',
    cloudAccounts: formatLimit(10),
    users: formatLimit(20),
    automations: formatLimit(50),
    retention: '90 days',
    support: 'Priority',
    sla: '99.5%',
    sso: true,
    samlSso: false,
    auditLog: true,
    compliance: [],
    highlighted: true,
  },
  {
    key: 'business',
    name: 'Business',
    monthlyCents: 59900,
    annualCents: 47900,
    tagline:
      'For organizations that need SAML SSO and a real compliance story.',
    cloudAccounts: formatLimit(30),
    users: formatLimit(75),
    automations: formatLimit(250),
    retention: '365 days',
    support: 'Dedicated',
    sla: '99.9%',
    sso: true,
    samlSso: true,
    auditLog: true,
    compliance: [],
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    monthlyCents: 0,
    annualCents: 0,
    tagline:
      'Unlimited scale, dedicated infrastructure, and a named team on call.',
    cloudAccounts: formatLimit(UNLIMITED_SENTINEL),
    users: formatLimit(UNLIMITED_SENTINEL),
    automations: formatLimit(UNLIMITED_SENTINEL),
    retention: 'Custom',
    support: 'Dedicated',
    sla: '99.99%',
    sso: true,
    samlSso: true,
    auditLog: true,
    compliance: [],
  },
];

/**
 * Read a plan without exposing its mutable compliance array to accidental
 * caller-side mutation.
 */
export function getMarketingPlan(
  key: string,
): MarketingPlan | undefined {
  const normalizedKey = typeof key === 'string'
    ? key.trim().toLowerCase()
    : '';

  const plan = MARKETING_PLANS.find(
    (candidate) => candidate.key === normalizedKey,
  );

  return plan ? clonePlan(plan) : undefined;
}

/**
 * Format plan pricing for the public marketing UI.
 *
 * Enterprise uses a custom quote rather than a numeric public price.
 * Non-enterprise prices are expressed in whole USD because the current
 * catalogue stores pricing in integer cents.
 */
export function formatPrice(
  cents: number,
  key: string,
): string {
  const normalizedKey =
    typeof key === 'string'
      ? key.trim().toLowerCase()
      : '';

  if (normalizedKey === 'enterprise') {
    return 'Custom';
  }

  if (!Number.isFinite(cents) || cents < 0) {
    return 'Unavailable';
  }

  if (cents === 0) {
    return '$0';
  }

  return `$${(Math.trunc(cents) / 100).toLocaleString(
    undefined,
    {
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    },
  )}`;
}

/**
 * Determine the public monthly price for a plan from its selected billing
 * cadence.
 */
export function getPlanPriceCents(
  plan: Pick<MarketingPlan, 'monthlyCents' | 'annualCents'>,
  interval: 'monthly' | 'annual',
): number {
  const value =
    interval === 'annual'
      ? plan.annualCents
      : plan.monthlyCents;

  return Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : 0;
}
