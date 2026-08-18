/**
 * Shared, real content for the public marketing site — pricing numbers
 * mirror billing_plans (033_billing_schema.sql) exactly. There's no lead
 * capture backend yet, so "Contact sales" / "Book a demo" are honest
 * mailto: links rather than a form that would silently go nowhere.
 */
export const CONTACT_SALES_HREF = 'mailto:sales@cloudops360.com?subject=HorizonVigil%20—%20Contact%20Sales';
export const BOOK_DEMO_HREF = 'mailto:sales@cloudops360.com?subject=HorizonVigil%20—%20Book%20a%20Demo';

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

const fmt = (n: number) => n === -1 ? 'Unlimited' : n.toLocaleString();

export const MARKETING_PLANS: MarketingPlan[] = [
  {
    key: 'free', name: 'Free', monthlyCents: 0, annualCents: 0,
    tagline: 'Connect one account and see what HorizonVigil finds.',
    cloudAccounts: fmt(1), users: fmt(2), automations: fmt(0), retention: '7 days',
    support: 'Community', sla: null, sso: false, samlSso: false, auditLog: false, compliance: [],
  },
  {
    key: 'starter', name: 'Starter', monthlyCents: 4900, annualCents: 3900,
    tagline: 'For small teams running production on one or two clouds.',
    cloudAccounts: fmt(3), users: fmt(5), automations: fmt(5), retention: '30 days',
    support: 'Email', sla: null, sso: false, samlSso: false, auditLog: true, compliance: [],
  },
  {
    key: 'professional', name: 'Professional', monthlyCents: 19900, annualCents: 15900,
    tagline: 'Multi-account, multi-org — the common starting point for growing platform teams.',
    cloudAccounts: fmt(10), users: fmt(20), automations: fmt(50), retention: '90 days',
    support: 'Priority', sla: '99.5%', sso: true, samlSso: false, auditLog: true, compliance: [],
    highlighted: true,
  },
  {
    key: 'business', name: 'Business', monthlyCents: 59900, annualCents: 47900,
    tagline: 'For organizations that need SAML SSO and a real compliance story.',
    cloudAccounts: fmt(30), users: fmt(75), automations: fmt(250), retention: '365 days',
    support: 'Dedicated', sla: '99.9%', sso: true, samlSso: true, auditLog: true,
    compliance: ['SOC 2 control mapping', 'CIS benchmark scanning', 'SIEM export'],
  },
  {
    key: 'enterprise', name: 'Enterprise', monthlyCents: 0, annualCents: 0,
    tagline: 'Unlimited scale, dedicated infrastructure, and a named team on call.',
    cloudAccounts: fmt(-1), users: fmt(-1), automations: fmt(-1), retention: 'Custom',
    support: 'Dedicated', sla: '99.99%', sso: true, samlSso: true, auditLog: true,
    compliance: ['SOC 2 Type II', 'ISO 27001 mapping', 'HIPAA-ready', 'Dedicated VPC', 'Customer-managed keys'],
  },
];

export function formatPrice(cents: number, key: string): string {
  if (key === 'enterprise') return 'Custom';
  if (cents === 0) return '$0';
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
