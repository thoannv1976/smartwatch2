/**
 * Deterministic, platform-independent seeded randomness.
 *
 * `Math.random()` must never appear in the simulation: official assignments
 * require that the same master seed, quarter and company produce byte-identical
 * results on every machine and every run (spec 6.1, 14 "Seed test").
 */

/** FNV-1a 32-bit string hash. Pure, stable, no dependencies. */
export function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // 32-bit FNV prime multiplication without overflowing into float territory.
    hash = Math.imul(hash, 0x01000193);
  }
  // Force to unsigned 32-bit.
  return hash >>> 0;
}

/** Mulberry32 PRNG: fast, tiny, good enough for a ±2% demand jitter. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Derives a sub-seed string from the master seed plus a deterministic scope.
 * Example: `deriveSeed('smartwatch-v1-2026', 3, 'player')`.
 */
export function deriveSeed(masterSeed: string, quarter: number, scope: string): string {
  return `${masterSeed}|q${quarter}|${scope}`;
}

/** A single deterministic value in [0, 1) for a given seed string. */
export function seededUnit(seedString: string): number {
  return mulberry32(hashString(seedString))();
}

/**
 * The controlled demand modifier of spec 6.1: a deterministic value in
 * [min, max] derived from the master seed, quarter and company key.
 */
export function seededRandomFactor(
  masterSeed: string,
  quarter: number,
  scope: string,
  min: number,
  max: number,
): number {
  const unit = seededUnit(deriveSeed(masterSeed, quarter, scope));
  return min + unit * (max - min);
}

/**
 * A deterministic integer in [-range, range], used for the optional ±2 point
 * jitter in competitor decisions (spec 7.2).
 */
export function seededIntegerInRange(seedString: string, range: number): number {
  const unit = seededUnit(seedString);
  const span = range * 2 + 1;
  const index = Math.min(span - 1, Math.floor(unit * span));
  return index - range;
}
