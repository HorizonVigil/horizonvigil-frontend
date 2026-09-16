/**
 * HorizonVigil Data Visualization Palette
 *
 * Design principles:
 * - Fixed categorical hue order for consistent chart semantics.
 * - Explicit light/dark values; never use prefers-color-scheme.
 * - Stable category-to-color mapping across all charts.
 * - No runtime color generation or randomization.
 * - Defensive handling of invalid indexes and category values.
 * - Exported collections are readonly to prevent accidental mutation.
 *
 * IMPORTANT:
 * Changing the order of CATEGORICAL or CATEGORY_COLOR_ORDER changes the
 * meaning of existing chart colors and should be treated as a visual
 * compatibility change.
 */

export interface ColorPair {
  readonly light: string;
  readonly dark: string;
}

export const CATEGORICAL: readonly ColorPair[] = [
  { light: '#2a78d6', dark: '#3987e5' }, // 1 — blue
  { light: '#008300', dark: '#008300' }, // 2 — green
  { light: '#e87ba4', dark: '#d55181' }, // 3 — magenta
  { light: '#eda100', dark: '#c98500' }, // 4 — yellow
  { light: '#1baf7a', dark: '#199e70' }, // 5 — aqua
  { light: '#eb6834', dark: '#d95926' }, // 6 — orange
  { light: '#4a3aa7', dark: '#9085e9' }, // 7 — violet
  { light: '#e34948', dark: '#e66767' }, // 8 — red
] as const;

export const STATUS = {
  good: { light: '#0ca30c', dark: '#0ca30c' },
  warning: { light: '#fab219', dark: '#fab219' },
  serious: { light: '#ec835a', dark: '#ec835a' },
  critical: { light: '#d03b3b', dark: '#d03b3b' },
} as const satisfies Record<string, ColorPair>;

export const SEQUENTIAL_BLUE: readonly string[] = [
  '#cde2fb',
  '#9ec5f4',
  '#6da7ec',
  '#3987e5',
  '#256abf',
  '#184f95',
  '#0d366b',
] as const;

export const CHROME = {
  surface: {
    light: '#fcfcfb',
    dark: '#1a1a19',
  },
  primaryInk: {
    light: '#0b0b0b',
    dark: '#ffffff',
  },
  secondaryInk: {
    light: '#52514e',
    dark: '#c3c2b7',
  },
  mutedInk: {
    light: '#898781',
    dark: '#898781',
  },
  gridline: {
    light: '#e1e0d9',
    dark: '#2c2c2a',
  },
  baseline: {
    light: '#c3c2b7',
    dark: '#383835',
  },
} as const satisfies Record<string, ColorPair>;

/**
 * Resolve a light/dark color pair.
 *
 * `isDark` should come from HorizonVigil's existing theme provider rather
 * than from prefers-color-scheme.
 */
export function pick(pair: ColorPair, isDark: boolean): string {
  return isDark ? pair.dark : pair.light;
}

/**
 * Returns a categorical color using the fixed palette order.
 *
 * Invalid, negative, non-integer, or non-finite indexes safely fall back to
 * the first categorical color instead of producing an invalid array lookup.
 *
 * The modulo operation intentionally cycles only after validating the index.
 * This preserves the established palette behavior for indexes >= palette size.
 */
export function categoricalColor(
  index: number,
  isDark: boolean,
): string {
  const paletteLength = CATEGORICAL.length;

  if (paletteLength === 0) {
    // Defensive guard for future palette changes.
    return isDark ? '#ffffff' : '#000000';
  }

  if (!Number.isFinite(index) || !Number.isInteger(index) || index < 0) {
    return pick(CATEGORICAL[0], isDark);
  }

  return pick(CATEGORICAL[index % paletteLength], isDark);
}

/**
 * Fixed resource-category ordering.
 *
 * DO NOT reorder without treating it as a visualization compatibility
 * change. A resource category must retain the same hue across dashboards,
 * reports, and charts.
 */
export const CATEGORY_COLOR_ORDER = [
  'Compute',
  'Storage',
  'Database',
  'Networking',
  'Security',
  'Containers',
  'Analytics',
  'Management',
  'Others',
] as const;

export type ResourceCategory = (typeof CATEGORY_COLOR_ORDER)[number];

/**
 * Normalize category input before lookup.
 *
 * This prevents accidental mismatches caused by surrounding whitespace or
 * inconsistent casing from API/UI boundaries.
 */
function normalizeCategory(category: string): string {
  return category.trim().toLocaleLowerCase();
}

/**
 * Precomputed normalized category lookup.
 *
 * This avoids repeatedly scanning CATEGORY_COLOR_ORDER for every chart datum.
 */
const CATEGORY_COLOR_INDEX: ReadonlyMap<string, number> = new Map(
  CATEGORY_COLOR_ORDER.map((category, index) => [
    normalizeCategory(category),
    index,
  ]),
);

/**
 * Resolve a stable categorical color for a resource category.
 *
 * Unknown categories intentionally map to the final "Others" slot.
 * This keeps unrecognized/future categories visually consistent without
 * changing the established colors of known categories.
 */
export function categoryColor(
  category: string,
  isDark: boolean,
): string {
  const normalizedCategory =
    typeof category === 'string'
      ? normalizeCategory(category)
      : '';

  const index = CATEGORY_COLOR_INDEX.get(normalizedCategory);

  return categoricalColor(
    index ?? CATEGORY_COLOR_ORDER.length - 1,
    isDark,
  );
}