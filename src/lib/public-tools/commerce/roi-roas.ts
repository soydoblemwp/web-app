/**
 * ROI, ROAS, and payback-period math core (spec section 12). Three related
 * but distinct calculations sharing one module because they're commonly
 * compared side by side, never merged into one ambiguous "return" number —
 * ROI's "beneficio neto" and ROAS's "ingresos atribuidos" are never
 * conflated (spec: "no llames beneficio al ingreso bruto").
 */

export interface RoiInput {
  initialInvestmentMinor: number;
  revenueMinor: number;
  additionalCostsMinor: number;
  residualValueMinor?: number;
  years?: number;
}

export interface RoiResult {
  ok: boolean;
  error?: string;
  netProfitMinor?: number;
  roiPercent?: number;
  multiple?: number;
  annualizedRoiPercent?: number; // only present when `years` is a valid positive duration
}

export function calculateRoi(input: RoiInput): RoiResult {
  if (!Number.isFinite(input.initialInvestmentMinor) || !Number.isFinite(input.revenueMinor) || !Number.isFinite(input.additionalCostsMinor)) {
    return { ok: false, error: "Introduce solo números finitos." };
  }
  if (input.initialInvestmentMinor < 0) return { ok: false, error: "La inversión inicial no puede ser negativa." };
  if (input.initialInvestmentMinor === 0) return { ok: false, error: "El ROI no se puede calcular con una inversión inicial de 0." };
  if (input.additionalCostsMinor < 0) return { ok: false, error: "Los costes adicionales no pueden ser negativos." };

  const residual = input.residualValueMinor ?? 0;
  const netProfitMinor = input.revenueMinor + residual - input.additionalCostsMinor - input.initialInvestmentMinor;
  const roiPercent = (netProfitMinor / input.initialInvestmentMinor) * 100;
  const multiple = (input.revenueMinor + residual - input.additionalCostsMinor) / input.initialInvestmentMinor;

  let annualizedRoiPercent: number | undefined;
  if (input.years !== undefined && Number.isFinite(input.years) && input.years > 0) {
    const totalReturnRatio = 1 + roiPercent / 100;
    annualizedRoiPercent = totalReturnRatio >= 0 ? (Math.pow(totalReturnRatio, 1 / input.years) - 1) * 100 : undefined;
  }

  return { ok: true, netProfitMinor, roiPercent, multiple, annualizedRoiPercent };
}

export interface RoasInput {
  adSpendMinor: number;
  attributedRevenueMinor: number;
  productCostMinor: number;
  commissionsMinor: number;
  otherVariableCostsMinor: number;
}

export interface RoasResult {
  ok: boolean;
  error?: string;
  roas?: number; // revenue per unit of ad spend, e.g. 3.5 means 3.5x
  revenuePerCurrencyUnit?: number; // same value, named for the "ingresos por unidad monetaria invertida" result
  netProfitAfterCostsMinor?: number;
  netAdReturnMinor?: number; // net profit minus the ad spend itself
  breakEvenRoas?: number; // ROAS needed to cover product cost + commissions + other costs (as a ratio)
}

export function calculateRoas(input: RoasInput): RoasResult {
  const fields = [input.adSpendMinor, input.attributedRevenueMinor, input.productCostMinor, input.commissionsMinor, input.otherVariableCostsMinor];
  if (fields.some((v) => !Number.isFinite(v))) return { ok: false, error: "Introduce solo números finitos." };
  if (input.adSpendMinor < 0) return { ok: false, error: "El gasto publicitario no puede ser negativo." };
  if (input.adSpendMinor === 0) return { ok: false, error: "El ROAS no se puede calcular con un gasto publicitario de 0." };
  if (input.attributedRevenueMinor < 0) return { ok: false, error: "Los ingresos atribuidos no pueden ser negativos." };
  if (input.productCostMinor < 0 || input.commissionsMinor < 0 || input.otherVariableCostsMinor < 0) return { ok: false, error: "Los costes no pueden ser negativos." };

  const roas = input.attributedRevenueMinor / input.adSpendMinor;
  const totalCostsMinor = input.productCostMinor + input.commissionsMinor + input.otherVariableCostsMinor;
  const netProfitAfterCostsMinor = input.attributedRevenueMinor - totalCostsMinor - input.adSpendMinor;
  const netAdReturnMinor = input.attributedRevenueMinor - input.adSpendMinor;
  const marginPerRevenueUnit = input.attributedRevenueMinor > 0 ? 1 - totalCostsMinor / input.attributedRevenueMinor : 0;
  const breakEvenRoas = marginPerRevenueUnit > 0 ? 1 / marginPerRevenueUnit : undefined;

  return { ok: true, roas, revenuePerCurrencyUnit: roas, netProfitAfterCostsMinor, netAdReturnMinor, breakEvenRoas };
}

export type PaybackMode = "uniform" | "flows";

export interface PaybackInput {
  mode: PaybackMode;
  initialInvestmentMinor: number;
  uniformFlowMinor?: number;
  flows?: number[]; // minor units per period, mode "flows"
  discountRatePercent?: number; // optional — when provided, also compute discounted payback
}

export interface PaybackPeriodRow {
  period: number;
  flowMinor: number;
  discountedFlowMinor: number;
  cumulativeMinor: number;
  discountedCumulativeMinor: number;
}

export interface PaybackResult {
  ok: boolean;
  error?: string;
  schedule?: PaybackPeriodRow[];
  simplePaybackPeriods?: number; // fractional, interpolated within the period it's reached in
  discountedPaybackPeriods?: number;
  neverRecovered?: boolean;
}

/** Finds the fractional period at which the cumulative balance first crosses zero, interpolating linearly within that period — never just reporting a whole period number when recovery happens partway through it. */
function interpolatePeriod(rows: PaybackPeriodRow[], initialInvestmentMinor: number, cumulativeKey: "cumulativeMinor" | "discountedCumulativeMinor", flowKey: "flowMinor" | "discountedFlowMinor"): number | undefined {
  let beforeCumulative = -initialInvestmentMinor;
  for (let i = 0; i < rows.length; i++) {
    const afterCumulative = rows[i][cumulativeKey];
    if (afterCumulative >= 0) {
      const flow = rows[i][flowKey];
      if (flow === 0) return i + 1;
      const fractionIntoPeriod = -beforeCumulative / flow;
      return i + fractionIntoPeriod;
    }
    beforeCumulative = afterCumulative;
  }
  return undefined;
}

export function calculatePayback(input: PaybackInput): PaybackResult {
  if (!Number.isFinite(input.initialInvestmentMinor) || input.initialInvestmentMinor <= 0) return { ok: false, error: "La inversión inicial debe ser mayor que cero." };

  let flows: number[];
  if (input.mode === "uniform") {
    if (!Number.isFinite(input.uniformFlowMinor) || (input.uniformFlowMinor ?? 0) <= 0) return { ok: false, error: "El flujo periódico uniforme debe ser mayor que cero." };
    flows = Array.from({ length: 600 }, () => input.uniformFlowMinor!);
  } else {
    if (!input.flows || input.flows.length === 0) return { ok: false, error: "Introduce al menos un flujo por periodo." };
    if (input.flows.some((f) => !Number.isFinite(f))) return { ok: false, error: "Todos los flujos deben ser números finitos." };
    flows = input.flows;
  }

  if (input.discountRatePercent !== undefined && Number.isFinite(input.discountRatePercent) && input.discountRatePercent <= -100) {
    return { ok: false, error: "La tasa de descuento debe ser mayor que -100%." };
  }
  const discountRate = input.discountRatePercent !== undefined && Number.isFinite(input.discountRatePercent) ? input.discountRatePercent / 100 : undefined;

  let cumulative = -input.initialInvestmentMinor;
  let discountedCumulative = -input.initialInvestmentMinor;
  const schedule: PaybackPeriodRow[] = [];
  let recoveredAt: number | undefined;
  let discountedRecoveredAt: number | undefined;

  for (let i = 0; i < flows.length; i++) {
    const flow = flows[i];
    const discountedFlow = discountRate !== undefined ? flow / Math.pow(1 + discountRate, i + 1) : flow;
    cumulative += flow;
    discountedCumulative += discountedFlow;
    schedule.push({ period: i + 1, flowMinor: flow, discountedFlowMinor: discountedFlow, cumulativeMinor: cumulative, discountedCumulativeMinor: discountedCumulative });
    if (recoveredAt === undefined && cumulative >= 0) recoveredAt = i + 1;
    if (discountRate !== undefined && discountedRecoveredAt === undefined && discountedCumulative >= 0) discountedRecoveredAt = i + 1;
    if (recoveredAt !== undefined && (discountRate === undefined || discountedRecoveredAt !== undefined)) break;
  }

  const simplePaybackPeriods = interpolatePeriod(schedule, input.initialInvestmentMinor, "cumulativeMinor", "flowMinor");
  const discountedPaybackPeriods = discountRate !== undefined ? interpolatePeriod(schedule, input.initialInvestmentMinor, "discountedCumulativeMinor", "discountedFlowMinor") : undefined;

  return {
    ok: true,
    schedule,
    simplePaybackPeriods,
    discountedPaybackPeriods,
    neverRecovered: simplePaybackPeriods === undefined,
  };
}
