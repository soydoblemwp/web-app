/**
 * Deterministic exponential backoff (spec section 22) — no setTimeout, no
 * randomness by default. `nextRetryAt` is always persisted to the DB and
 * recomputed by the scheduler on its own polling cadence, never held in
 * process memory.
 */

export interface BackoffConfig {
  baseDelayMs: number;
  multiplier: number;
  maxDelayMs: number;
}

/** attempt is 1-based (the attempt that just failed). Pure — same inputs always produce the same delay, so it's trivially unit-testable without mocking time. */
export function computeBackoffDelayMs(attempt: number, config: BackoffConfig): number {
  const raw = config.baseDelayMs * Math.pow(config.multiplier, Math.max(0, attempt - 1));
  return Math.min(Math.round(raw), config.maxDelayMs);
}

export function computeNextRetryAt(attempt: number, config: BackoffConfig, now: Date = new Date()): Date {
  return new Date(now.getTime() + computeBackoffDelayMs(attempt, config));
}

/**
 * Optional controlled jitter (spec section 22: "únicamente si puede probarse
 * determinísticamente mediante una semilla") — a simple, seeded,
 * reproducible pseudo-random offset, never Math.random() directly, so a
 * test can assert the exact resulting delay for a given seed.
 */
export function computeSeededJitterMs(seed: string, maxJitterMs: number): number {
  if (maxJitterMs <= 0) return 0;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % (maxJitterMs + 1);
}
