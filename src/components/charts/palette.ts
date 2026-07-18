// Validated categorical/status/sequential palette from the dataviz skill's
// reference instance (references/palette.md) — fixed hue ORDER matters for
// CVD-safety, never reassign/cycle it. Light/dark pairs swap based on our
// existing `.dark` class toggle (lib/theme.tsx), not prefers-color-scheme.

export interface ColorPair { light: string; dark: string }

export const CATEGORICAL: ColorPair[] = [
  { light: '#2a78d6', dark: '#3987e5' }, // 1 blue
  { light: '#008300', dark: '#008300' }, // 2 green
  { light: '#e87ba4', dark: '#d55181' }, // 3 magenta
  { light: '#eda100', dark: '#c98500' }, // 4 yellow
  { light: '#1baf7a', dark: '#199e70' }, // 5 aqua
  { light: '#eb6834', dark: '#d95926' }, // 6 orange
  { light: '#4a3aa7', dark: '#9085e9' }, // 7 violet
  { light: '#e34948', dark: '#e66767' }, // 8 red
];

export const STATUS = {
  good: { light: '#0ca30c', dark: '#0ca30c' },
  warning: { light: '#fab219', dark: '#fab219' },
  serious: { light: '#ec835a', dark: '#ec835a' },
  critical: { light: '#d03b3b', dark: '#d03b3b' },
} as const;

export const SEQUENTIAL_BLUE = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];

export const CHROME = {
  surface: { light: '#fcfcfb', dark: '#1a1a19' },
  primaryInk: { light: '#0b0b0b', dark: '#ffffff' },
  secondaryInk: { light: '#52514e', dark: '#c3c2b7' },
  mutedInk: { light: '#898781', dark: '#898781' },
  gridline: { light: '#e1e0d9', dark: '#2c2c2a' },
  baseline: { light: '#c3c2b7', dark: '#383835' },
};

export function pick(pair: ColorPair | { light: string; dark: string }, isDark: boolean): string {
  return isDark ? pair.dark : pair.light;
}

export function categoricalColor(index: number, isDark: boolean): string {
  return pick(CATEGORICAL[index % CATEGORICAL.length], isDark);
}

/** Resource-category -> fixed categorical slot, so the same category always gets the same color across every chart. */
export const CATEGORY_COLOR_ORDER = ['Compute', 'Storage', 'Database', 'Networking', 'Security', 'Containers', 'Analytics', 'Management', 'Others'];

export function categoryColor(category: string, isDark: boolean): string {
  const idx = CATEGORY_COLOR_ORDER.indexOf(category);
  return categoricalColor(idx === -1 ? 8 : idx, isDark);
}
