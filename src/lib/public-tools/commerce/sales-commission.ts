/**
 * Sales-commission math core (spec section 15): flat rate, progressive
 * tiers, retroactive tiers, quota+accelerator, bonuses, deductions, returns,
 * and splitting among reps. Never assumes labor law or a specific contract
 * structure — every rate/tier/threshold is a value the visitor configures.
 */

export interface CommissionTier {
  id: string;
  fromMinor: number;
  toMinor: number | null; // null = open-ended top tier
  ratePercent: number;
}

export type CommissionTierMode = "progressive" | "retroactive";

export interface CommissionInput {
  salesMinor: number;
  returnsMinor: number; // subtracted from sales before computing commissionable amount
  flatRatePercent?: number; // used when tiers is empty
  tiers?: CommissionTier[];
  tierMode?: CommissionTierMode;
  quotaMinor?: number;
  rateBeforeQuotaPercent?: number;
  rateAfterQuotaPercent?: number;
  accelerator?: number; // multiplier applied to rateAfterQuotaPercent beyond the quota, e.g. 1.5
  bonusMinor?: number;
  deductionsMinor?: number;
}

export interface CommissionTierBreakdownRow {
  tierId: string;
  amountInTierMinor: number;
  ratePercent: number;
  commissionMinor: number;
}

export interface CommissionResult {
  ok: boolean;
  error?: string;
  commissionableSalesMinor?: number;
  baseCommissionMinor?: number;
  tierBreakdown?: CommissionTierBreakdownRow[];
  bonusMinor?: number;
  deductionsMinor?: number;
  finalCommissionMinor?: number;
  effectiveRatePercent?: number;
}

function validateTiers(tiers: CommissionTier[]): string | null {
  const sorted = [...tiers].sort((a, b) => a.fromMinor - b.fromMinor);
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    if (t.fromMinor < 0) return "El límite inicial de un tramo no puede ser negativo.";
    if (t.toMinor !== null && t.toMinor <= t.fromMinor) return "El límite final de un tramo debe ser mayor que el límite inicial.";
    if (t.ratePercent < 0) return "El porcentaje de un tramo no puede ser negativo.";
    if (i > 0 && t.fromMinor < (sorted[i - 1].toMinor ?? Infinity)) return "Los tramos no pueden solaparse.";
  }
  return null;
}

/** Progressive: only the portion of sales that falls inside each tier is taxed at that tier's rate. */
function computeProgressiveTiers(commissionableSalesMinor: number, tiers: CommissionTier[]): CommissionTierBreakdownRow[] {
  const sorted = [...tiers].sort((a, b) => a.fromMinor - b.fromMinor);
  return sorted.map((tier) => {
    const upper = tier.toMinor ?? Infinity;
    const amountInTierMinor = Math.max(0, Math.min(commissionableSalesMinor, upper) - tier.fromMinor);
    return { tierId: tier.id, amountInTierMinor, ratePercent: tier.ratePercent, commissionMinor: Math.round(amountInTierMinor * (tier.ratePercent / 100)) };
  });
}

/** Retroactive: whichever tier the total sales figure lands in, ALL commissionable sales are paid at that single tier's rate — never blended across tiers like progressive mode. */
function computeRetroactiveTier(commissionableSalesMinor: number, tiers: CommissionTier[]): CommissionTierBreakdownRow[] {
  const sorted = [...tiers].sort((a, b) => a.fromMinor - b.fromMinor);
  const matched = [...sorted].reverse().find((t) => commissionableSalesMinor >= t.fromMinor) ?? sorted[0];
  if (!matched) return [];
  return [{ tierId: matched.id, amountInTierMinor: commissionableSalesMinor, ratePercent: matched.ratePercent, commissionMinor: Math.round(commissionableSalesMinor * (matched.ratePercent / 100)) }];
}

export function calculateCommission(input: CommissionInput): CommissionResult {
  if (!Number.isFinite(input.salesMinor) || input.salesMinor < 0) return { ok: false, error: "Las ventas no pueden ser negativas." };
  if (!Number.isFinite(input.returnsMinor) || input.returnsMinor < 0) return { ok: false, error: "Las devoluciones no pueden ser negativas." };
  const commissionableSalesMinor = Math.max(0, input.salesMinor - input.returnsMinor);

  const bonusMinor = input.bonusMinor ?? 0;
  const deductionsMinor = input.deductionsMinor ?? 0;
  if (bonusMinor < 0) return { ok: false, error: "El bono no puede ser negativo." };
  if (deductionsMinor < 0) return { ok: false, error: "Las deducciones no pueden ser negativas." };

  let baseCommissionMinor: number;
  let tierBreakdown: CommissionTierBreakdownRow[] | undefined;

  if (input.quotaMinor !== undefined) {
    if (!Number.isFinite(input.quotaMinor) || input.quotaMinor < 0) return { ok: false, error: "La cuota no puede ser negativa." };
    const rateBefore = input.rateBeforeQuotaPercent ?? 0;
    const rateAfter = input.rateAfterQuotaPercent ?? rateBefore;
    const accelerator = input.accelerator ?? 1;
    if (rateBefore < 0 || rateAfter < 0) return { ok: false, error: "Las tasas antes y después de la cuota no pueden ser negativas." };
    if (accelerator < 0) return { ok: false, error: "El acelerador no puede ser negativo." };

    const belowQuota = Math.min(commissionableSalesMinor, input.quotaMinor);
    const aboveQuota = Math.max(0, commissionableSalesMinor - input.quotaMinor);
    const belowCommission = Math.round(belowQuota * (rateBefore / 100));
    const aboveCommission = Math.round(aboveQuota * (rateAfter / 100) * accelerator);
    baseCommissionMinor = belowCommission + aboveCommission;
    tierBreakdown = [
      { tierId: "before-quota", amountInTierMinor: belowQuota, ratePercent: rateBefore, commissionMinor: belowCommission },
      { tierId: "after-quota", amountInTierMinor: aboveQuota, ratePercent: rateAfter * accelerator, commissionMinor: aboveCommission },
    ];
  } else if (input.tiers && input.tiers.length > 0) {
    const tierError = validateTiers(input.tiers);
    if (tierError) return { ok: false, error: tierError };
    tierBreakdown = input.tierMode === "retroactive" ? computeRetroactiveTier(commissionableSalesMinor, input.tiers) : computeProgressiveTiers(commissionableSalesMinor, input.tiers);
    baseCommissionMinor = tierBreakdown.reduce((sum, row) => sum + row.commissionMinor, 0);
  } else {
    const rate = input.flatRatePercent ?? 0;
    if (rate < 0) return { ok: false, error: "El porcentaje de comisión no puede ser negativo." };
    baseCommissionMinor = Math.round(commissionableSalesMinor * (rate / 100));
  }

  const finalCommissionMinor = baseCommissionMinor + bonusMinor - deductionsMinor;
  const effectiveRatePercent = commissionableSalesMinor > 0 ? (finalCommissionMinor / commissionableSalesMinor) * 100 : 0;

  return { ok: true, commissionableSalesMinor, baseCommissionMinor, tierBreakdown, bonusMinor, deductionsMinor, finalCommissionMinor, effectiveRatePercent };
}

export interface RepSplit {
  id: string;
  name: string;
  sharePercent: number;
}

export interface RepSplitResult {
  id: string;
  name: string;
  sharePercent: number;
  amountMinor: number;
}

/** Splits a final commission amount across reps by share percentage, using `distributeMinorUnits`-style remainder handling so the shares always sum exactly to the total (never a stray cent lost to independent rounding). */
export function splitCommissionAmongReps(finalCommissionMinor: number, reps: RepSplit[]): { ok: boolean; error?: string; splits?: RepSplitResult[] } {
  if (reps.length === 0) return { ok: false, error: "Añade al menos un vendedor para repartir la comisión." };
  const totalShare = reps.reduce((sum, r) => sum + r.sharePercent, 0);
  if (totalShare <= 0) return { ok: false, error: "La suma de los repartos debe ser mayor que cero." };

  const rawAmounts = reps.map((r) => (finalCommissionMinor * r.sharePercent) / totalShare);
  const flooredAmounts = rawAmounts.map(Math.floor);
  let remainder = finalCommissionMinor - flooredAmounts.reduce((sum, v) => sum + v, 0);
  const remainders = rawAmounts.map((v, i) => ({ i, frac: v - flooredAmounts[i] })).sort((a, b) => b.frac - a.frac);
  const finalAmounts = [...flooredAmounts];
  for (const { i } of remainders) {
    if (remainder <= 0) break;
    finalAmounts[i] += 1;
    remainder -= 1;
  }

  return { ok: true, splits: reps.map((r, i) => ({ id: r.id, name: r.name, sharePercent: r.sharePercent, amountMinor: finalAmounts[i] })) };
}
