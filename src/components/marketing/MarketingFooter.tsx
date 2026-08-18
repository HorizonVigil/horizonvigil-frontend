import { Link } from 'react-router-dom';
import { Logo } from './Logo';
import { CONTACT_SALES_HREF, BOOK_DEMO_HREF } from '../../lib/marketingContent';
import { scrollToSection } from '../../lib/scrollToSection';

// Same fix as MarketingNav's handleSectionLinkClick -- see that component
// for why a plain <Link> can't be trusted for a same-page hash change.
function handleSectionLinkClick(e: React.MouseEvent, href: string) {
  if (!href.startsWith('/#') || window.location.pathname !== '/') return;
  e.preventDefault();
  const id = href.slice(2);
  if (scrollToSection(id)) {
    window.history.pushState(null, '', `/#${id}`);
  }
}

const COLUMNS: { title: string; links: { label: string; href: string; external?: boolean }[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'Platform', href: '/#platform' },
      { label: 'Security', href: '/#security' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Documentation', href: '/docs' },
    ],
  },
  {
    title: 'Get started',
    links: [
      { label: 'Start free', href: '/signup' },
      { label: 'Log in', href: '/login' },
      { label: 'Book a demo', href: BOOK_DEMO_HREF, external: true },
      { label: 'Contact sales', href: CONTACT_SALES_HREF, external: true },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Terms of Service', href: '/terms' },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
      <div className="max-w-6xl mx-auto px-5 py-14 grid grid-cols-2 md:grid-cols-5 gap-10">
        <div className="col-span-2">
          <Logo />
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-3 max-w-xs">
            One control plane for AWS and GCP — inventory, cost, security, and automated remediation.
          </p>
        </div>
        {COLUMNS.map(col => (
          <div key={col.title}>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-3">{col.title}</div>
            <ul className="flex flex-col gap-2.5">
              {col.links.map(l => (
                <li key={l.label}>
                  {l.external ? (
                    <a href={l.href} className="text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white">{l.label}</a>
                  ) : (
                    <Link to={l.href} onClick={e => handleSectionLinkClick(e, l.href)} className="text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white">{l.label}</Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-5 py-5 text-xs text-slate-400 dark:text-slate-500">
          © {new Date().getFullYear()} HorizonVigil. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
