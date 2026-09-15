import type { IdentityRisk } from '../../lib/api';

/**
 * Credential posture for one identity: key count, age, unused keys.
 *
 * WHY `assessed` IS RENDERED AT ALL
 *
 * An identity that carried no credential metadata has not been shown to be
 * free of stale credentials — it was never examined. Printing a blank cell, or
 * a reassuring "0 stale", would make "we did not look" indistinguishable from
 * "we looked and it is clean". That confusion is the single most repeated
 * defect in this product's history, so the unassessed case says so out loud.
 */

const dayLabel = (days: number) => `${days}d`;

export function CredentialRiskCell({ credentials }: { credentials: IdentityRisk['credentials'] }) {
  if (!credentials?.assessed) {
    return (
      <span className="text-slate-400 text-xs" title="This identity carries no credential metadata, so its keys were never examined. This is not a clean result.">
        not assessed
      </span>
    );
  }

  const { activeKeyCount, oldestActiveKeyAgeDays, neverUsedActiveKeys } = credentials;

  if (activeKeyCount === 0) {
    return <span className="text-slate-500 text-xs">no active keys</span>;
  }

  const bits: string[] = [`${activeKeyCount} active key${activeKeyCount === 1 ? '' : 's'}`];
  if (neverUsedActiveKeys > 0) bits.push(`${neverUsedActiveKeys} never used`);
  if (oldestActiveKeyAgeDays !== null) bits.push(`oldest ${dayLabel(oldestActiveKeyAgeDays)}`);

  // Amber, not red: a surplus or ageing key is a hygiene problem, and painting
  // it the same colour as administrator-equivalent access would flatten the
  // severity the risk factors already establish.
  const concerning = neverUsedActiveKeys > 0 || activeKeyCount > 1 || (oldestActiveKeyAgeDays ?? 0) >= 90;
  return (
    <span className={`text-xs ${concerning ? 'text-amber-700 dark:text-amber-400' : 'text-slate-600 dark:text-slate-300'}`}>
      {bits.join(' · ')}
    </span>
  );
}

/**
 * The factors themselves, worst-first as the server ordered them.
 *
 * The order is the server's judgement and is preserved: privilege and MFA
 * decide the headline, credential hygiene follows. Re-sorting here would let
 * a stale key outrank administrator-equivalent access.
 */
export function RiskFactorList({ factors, max = 3 }: { factors: string[]; max?: number }) {
  if (factors.length === 0) {
    return <span className="text-emerald-700 dark:text-emerald-400 text-xs">No risk factors</span>;
  }
  const shown = factors.slice(0, max);
  return (
    <span className="text-xs text-slate-700 dark:text-slate-300">
      {shown.join(' · ')}
      {factors.length > max && <span className="text-slate-500"> · +{factors.length - max} more</span>}
    </span>
  );
}
