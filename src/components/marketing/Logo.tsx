import { Link } from 'react-router-dom';
import horizonvigilIcon from '../../assets/brand/horizonvigil-icon.svg';

/** Same brand mark as AppRail's in-app sidebar — the marketing site and the product should read as one thing, not two. */
export function Logo({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="flex items-center gap-2.5 shrink-0">
      <img src={horizonvigilIcon} alt="HorizonVigil" className="h-9 w-9 rounded-lg" />
      <span className="text-lg font-semibold text-slate-900 dark:text-white whitespace-nowrap">HorizonVigil</span>
    </Link>
  );
}
