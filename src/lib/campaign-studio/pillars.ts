export interface PillarLike {
  id: string;
  percentage: number | null;
}

/**
 * Warns when pillar percentages don't sum to 100 — never blocks saving (per
 * spec: "Muestra una advertencia... No bloquees el guardado por esa
 * advertencia."). Pillars with no percentage set are excluded from the sum
 * (they simply haven't been sized yet) rather than counted as 0.
 */
export function computePillarPercentageTotal(pillars: PillarLike[]): number {
  return pillars.reduce((sum, pillar) => sum + (pillar.percentage ?? 0), 0);
}

export function isPillarPercentageBalanced(pillars: PillarLike[]): boolean {
  const sized = pillars.filter((p) => p.percentage !== null);
  if (sized.length === 0) return true;
  return computePillarPercentageTotal(pillars) === 100;
}
