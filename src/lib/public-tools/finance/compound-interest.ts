/**
 * Compound-interest projection and savings-goal solver. When the
 * contribution frequency differs from the compounding frequency, the
 * annual contribution total is preserved exactly and prorated evenly across
 * compounding periods (spec section 12 explicitly requires supporting
 * mismatched frequencies as a test case) — documented here and in the tool's
 * FAQ rather than silently assumed.
 */
export type CompoundingFrequency = "annually" | "quarterly" | "monthly" | "daily";
export type ContributionFrequency = "annually" | "quarterly" | "monthly";
export type ContributionTiming = "start" | "end";

const COMPOUNDING_PERIODS_PER_YEAR: Record<CompoundingFrequency, number> = { annually: 1, quarterly: 4, monthly: 12, daily: 365 };
const CONTRIBUTION_PERIODS_PER_YEAR: Record<ContributionFrequency, number> = { annually: 1, quarterly: 4, monthly: 12 };

export interface ProjectionRow {
  period: number;
  contribution: number;
  interest: number;
  balance: number;
}

export interface ProjectionInput {
  initialDeposit: number;
  contribution: number;
  contributionFrequency: ContributionFrequency;
  annualRatePercent: number;
  compoundingFrequency: CompoundingFrequency;
  years: number;
  timing: ContributionTiming;
  /** Optional — when provided, `realFutureValue`/`realTotalContributions` are also computed and shown separately, never silently blended into the nominal figures (spec section 12). */
  annualInflationPercent?: number;
}

export interface ProjectionResult {
  ok: boolean;
  error?: string;
  futureValue?: number;
  totalContributions?: number;
  totalInterest?: number;
  schedule?: ProjectionRow[];
  realFutureValue?: number;
  realTotalContributions?: number;
}

function perCompoundingPeriodContribution(contribution: number, contributionFrequency: ContributionFrequency, compoundingPeriodsPerYear: number): number {
  const annualContribution = contribution * CONTRIBUTION_PERIODS_PER_YEAR[contributionFrequency];
  return annualContribution / compoundingPeriodsPerYear;
}

function simulate(initialDeposit: number, periodContribution: number, periodicRate: number, totalPeriods: number, timing: ContributionTiming): ProjectionRow[] {
  const rows: ProjectionRow[] = [];
  let balance = initialDeposit;
  for (let period = 1; period <= totalPeriods; period++) {
    const before = balance;
    if (timing === "start") {
      balance = (balance + periodContribution) * (1 + periodicRate);
    } else {
      balance = balance * (1 + periodicRate) + periodContribution;
    }
    const interest = balance - before - periodContribution;
    rows.push({ period, contribution: periodContribution, interest, balance });
  }
  return rows;
}

export function calculateProjection(input: ProjectionInput): ProjectionResult {
  if (input.initialDeposit < 0) return { ok: false, error: "El depósito inicial no puede ser negativo." };
  if (input.contribution < 0) return { ok: false, error: "La contribución no puede ser negativa." };
  if (input.annualRatePercent < 0) return { ok: false, error: "La tasa anual no puede ser negativa." };
  if (input.years <= 0) return { ok: false, error: "La duración debe ser mayor que cero." };
  if (input.years > 100) return { ok: false, error: "La duración máxima admitida es de 100 años." };

  const compoundingPeriodsPerYear = COMPOUNDING_PERIODS_PER_YEAR[input.compoundingFrequency];
  const periodicRate = input.annualRatePercent / 100 / compoundingPeriodsPerYear;
  const totalPeriods = Math.round(input.years * compoundingPeriodsPerYear);
  const periodContribution = perCompoundingPeriodContribution(input.contribution, input.contributionFrequency, compoundingPeriodsPerYear);

  const schedule = simulate(input.initialDeposit, periodContribution, periodicRate, totalPeriods, input.timing);
  const futureValue = schedule[schedule.length - 1]?.balance ?? input.initialDeposit;
  const totalContributions = input.initialDeposit + periodContribution * totalPeriods;
  const totalInterest = futureValue - totalContributions;

  let realFutureValue: number | undefined;
  let realTotalContributions: number | undefined;
  if (input.annualInflationPercent !== undefined && input.annualInflationPercent > 0) {
    const deflator = Math.pow(1 + input.annualInflationPercent / 100, input.years);
    realFutureValue = futureValue / deflator;
    realTotalContributions = totalContributions / deflator;
  }

  return { ok: true, futureValue, totalContributions, totalInterest, schedule, realFutureValue, realTotalContributions };
}

export interface SavingsGoalInput {
  goal: number;
  initialDeposit: number;
  annualRatePercent: number;
  years: number;
  compoundingFrequency: CompoundingFrequency;
  contributionFrequency: ContributionFrequency;
  timing: ContributionTiming;
}

export interface SavingsGoalResult {
  ok: boolean;
  error?: string;
  requiredContribution?: number; // in the user's chosen contributionFrequency units
  totalContributions?: number;
  totalInterest?: number;
  schedule?: ProjectionRow[];
}

export function calculateSavingsGoal(input: SavingsGoalInput): SavingsGoalResult {
  if (input.goal <= 0) return { ok: false, error: "La meta debe ser mayor que cero." };
  if (input.initialDeposit < 0) return { ok: false, error: "El depósito inicial no puede ser negativo." };
  if (input.annualRatePercent < 0) return { ok: false, error: "La tasa anual no puede ser negativa." };
  if (input.years <= 0) return { ok: false, error: "La duración debe ser mayor que cero." };

  const compoundingPeriodsPerYear = COMPOUNDING_PERIODS_PER_YEAR[input.compoundingFrequency];
  const periodicRate = input.annualRatePercent / 100 / compoundingPeriodsPerYear;
  const totalPeriods = Math.round(input.years * compoundingPeriodsPerYear);
  if (totalPeriods < 1) return { ok: false, error: "El plazo es demasiado corto para la frecuencia de capitalización elegida." };

  const growthOfInitial = input.initialDeposit * Math.pow(1 + periodicRate, totalPeriods);
  if (growthOfInitial >= input.goal) {
    return { ok: true, requiredContribution: 0, totalContributions: input.initialDeposit, totalInterest: input.goal - input.initialDeposit, schedule: simulate(input.initialDeposit, 0, periodicRate, totalPeriods, input.timing) };
  }

  const remaining = input.goal - growthOfInitial;
  let periodContribution: number;
  if (periodicRate === 0) {
    periodContribution = remaining / totalPeriods;
  } else {
    const annuityFactor = (Math.pow(1 + periodicRate, totalPeriods) - 1) / periodicRate;
    const timingMultiplier = input.timing === "start" ? 1 + periodicRate : 1;
    periodContribution = remaining / (annuityFactor * timingMultiplier);
  }
  if (!Number.isFinite(periodContribution) || periodContribution < 0) {
    return { ok: false, error: "No se pudo calcular una contribución periódica válida con estos parámetros." };
  }

  const schedule = simulate(input.initialDeposit, periodContribution, periodicRate, totalPeriods, input.timing);
  const totalContributions = input.initialDeposit + periodContribution * totalPeriods;
  const finalBalance = schedule[schedule.length - 1]?.balance ?? input.initialDeposit;
  const totalInterest = finalBalance - totalContributions;

  const annualContribution = periodContribution * compoundingPeriodsPerYear;
  const requiredContribution = annualContribution / CONTRIBUTION_PERIODS_PER_YEAR[input.contributionFrequency];

  return { ok: true, requiredContribution, totalContributions, totalInterest, schedule };
}
