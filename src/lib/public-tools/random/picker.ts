import { secureRandomInt, secureShuffle } from "@/lib/public-tools/utilities/secure-random";

/**
 * Reuses the project's single cryptographic-randomness source
 * (`secureRandomInt`/`secureShuffle`) for every "secure" mode — never
 * `Math.random()` (spec section 18). A separate, clearly-labeled seeded PRNG
 * is provided ONLY for the explicit "reproducible" mode, which is never
 * described as cryptographically secure.
 */
export function parseListInput(raw: string): string[] {
  return raw
    .split(/\r?\n|,/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function dedupeList(items: string[]): string[] {
  return Array.from(new Set(items));
}

/** Weighted secure pick without replacement — `weights[i]` corresponds to `items[i]`; missing/invalid weights default to 1. */
export function pickWinners(items: string[], count: number, weights?: number[]): string[] {
  if (items.length === 0) throw new Error("La lista está vacía.");
  const n = Math.min(count, items.length);
  const pool = items.map((item, i) => ({ item, weight: weights?.[i] && weights[i] > 0 ? weights[i] : 1 }));
  const winners: string[] = [];
  for (let k = 0; k < n; k++) {
    const totalWeight = pool.reduce((sum, p) => sum + p.weight, 0);
    // Secure uniform draw over a weighted pool: pick a uniform integer in [0, totalWeightScaled)
    // (scaled to integers since secureRandomInt requires an integer bound) and walk the cumulative
    // weight until the drawn value falls in that item's share.
    const scale = 1000;
    const target = secureRandomInt(Math.round(totalWeight * scale));
    let cumulative = 0;
    let pickedIndex = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      cumulative += pool[i].weight * scale;
      if (target < cumulative) {
        pickedIndex = i;
        break;
      }
    }
    winners.push(pool[pickedIndex].item);
    pool.splice(pickedIndex, 1);
  }
  return winners;
}

export function shuffleList(items: string[]): string[] {
  return secureShuffle(items);
}

export interface TeamsResult {
  teams: string[][];
  teamNames: string[];
}

/** Distributes items into teams by real secure shuffle, then even round-robin split — a plain random distribution, never claimed as "skill-balanced" unless the caller supplies levels (spec section 18: "no declares que los equipos están equilibrados por habilidad si el usuario no proporciona niveles"). */
export function createTeams(items: string[], teamCount: number, teamNames?: string[]): TeamsResult {
  if (teamCount < 1) throw new Error("Debe haber al menos un equipo.");
  const shuffled = secureShuffle(items);
  const teams: string[][] = Array.from({ length: teamCount }, () => []);
  shuffled.forEach((item, i) => teams[i % teamCount].push(item));
  const names = teams.map((_, i) => teamNames?.[i] ?? `Equipo ${i + 1}`);
  return { teams, teamNames: names };
}

export function createTeamsBySize(items: string[], teamSize: number, teamNames?: string[]): TeamsResult {
  if (teamSize < 1) throw new Error("El tamaño del equipo debe ser al menos 1.");
  const teamCount = Math.ceil(items.length / teamSize);
  return createTeams(items, teamCount, teamNames);
}

export function assignTurnOrder(items: string[]): string[] {
  return secureShuffle(items);
}

// --- Reproducible (seeded) mode — explicitly NOT cryptographically secure ---

/** A small, deterministic PRNG (mulberry32) used ONLY for the explicit "reproducible" mode. Never used for the default secure picker. */
export function createSeededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(items: T[], seed: number): T[] {
  const rng = createSeededRandom(seed);
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function seededPickWinners(items: string[], count: number, seed: number): string[] {
  return seededShuffle(items, seed).slice(0, Math.min(count, items.length));
}
