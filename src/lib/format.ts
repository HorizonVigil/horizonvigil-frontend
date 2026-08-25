/**
 * USD currency formatting, shared across every page that renders a dollar
 * amount -- was seven identical (six of them) local redefinitions, drifting
 * silently since nothing enforced they stayed in sync. `fractionDigits`
 * defaults to 0 (whole dollars, right for aggregate totals like MTD spend)
 * -- cost-optimization's per-recommendation savings figures pass 2, since a
 * sub-$1 monthly saving (e.g. an unassociated EIP at $3.65/mo split across
 * partial usage) would otherwise round away the number that matters.
 */
export function money(n: number, fractionDigits = 0): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: fractionDigits });
}
