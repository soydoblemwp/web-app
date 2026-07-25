/** Pure, dependency-free numeric helpers for analytics aggregation. */

/** Linear-interpolation percentile over an ALREADY-SORTED ascending array — the standard "percentile_cont"-style approximation, computed in application code since this project's Postgres access goes through Prisma's query builder (no percentile_cont in Prisma itself). Returns null for an empty input rather than throwing or fabricating a number. */
export function percentile(sortedAscending: number[], p: number): number | null {
  if (sortedAscending.length === 0) return null;
  if (p <= 0) return sortedAscending[0];
  if (p >= 1) return sortedAscending[sortedAscending.length - 1];
  const rank = p * (sortedAscending.length - 1);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);
  if (lowerIndex === upperIndex) return sortedAscending[lowerIndex];
  const weight = rank - lowerIndex;
  return sortedAscending[lowerIndex] * (1 - weight) + sortedAscending[upperIndex] * weight;
}

export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function safeDivide(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}
