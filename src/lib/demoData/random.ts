/**
 * Deterministic PRNG helpers shared by every lib/demoData/* generator
 * (seed.ts's findings, sourceInventory.ts's assets, ...). Extracted here so
 * two demo-data modules don't each define their own copy -- same inputs
 * always produce the same output everywhere, seeded by a fixed constant so
 * numbers don't shift on re-render or across sessions/builds.
 */

// ─── mulberry32: a small, fast, deterministic PRNG (no new dependency) ────
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BASE_SEED = 0x484f5256; // 'HORV', fixed so demo data is stable across sessions/builds

export function rngFor(slot: number): () => number {
  return mulberry32((BASE_SEED ^ (slot * 2654435761)) >>> 0);
}

export function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

export function weightedPick<T>(rng: () => number, weighted: readonly [T, number][]): T {
  const total = weighted.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [value, weight] of weighted) {
    r -= weight;
    if (r <= 0) return value;
  }
  return weighted[weighted.length - 1][0];
}

export function daysAgoISO(rng: () => number, maxDays: number): string {
  const days = Math.floor(rng() * maxDays);
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}
