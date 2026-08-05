import type { CalendarDate } from "@/lib/public-tools/utilities/dates";
import { addCalendarTime } from "@/lib/public-tools/utilities/dates";
import { toMinorUnits, fromMinorUnits } from "./money";

/**
 * Fixed-rate loan amortization. This is an educational calculation using a
 * simple/nominal periodic rate (annual rate ÷ payments per year) — it is
 * NEVER labeled "APR" since a real APR requires a defined regulatory
 * methodology (fees, compounding disclosure rules) this tool doesn't
 * implement (spec section 11: "no llames APR a una tasa si no calculas
 * realmente APR conforme a una metodología definida").
 */
export type PaymentFrequency = "monthly" | "biweekly" | "weekly";
export type LoanTermUnit = "months" | "years";

const PERIODS_PER_YEAR: Record<PaymentFrequency, number> = { monthly: 12, biweekly: 26, weekly: 52 };

export interface LoanInput {
  principal: number; // major units (e.g. dollars), > 0
  annualRatePercent: number; // >= 0
  termValue: number; // > 0
  termUnit: LoanTermUnit;
  frequency: PaymentFrequency;
  startDate: CalendarDate;
  extraPaymentRecurring?: number; // major units, added to principal every period
  extraPaymentOnce?: number; // major units, applied once
  extraPaymentOncePeriod?: number; // 1-based payment number the one-time extra applies to
  originationFee?: number; // major units, informational — added to total cost, not to the schedule's balance
}

export interface AmortizationRow {
  paymentNumber: number;
  date: CalendarDate;
  payment: number;
  principal: number;
  interest: number;
  extraPayment: number;
  balance: number;
}

export interface LoanResult {
  ok: boolean;
  error?: string;
  periodicPayment?: number;
  numberOfPayments?: number;
  actualNumberOfPayments?: number; // may be lower than numberOfPayments when extra payments pay it off early
  totalInterest?: number;
  totalPrincipal?: number;
  totalCost?: number;
  finalPaymentDate?: CalendarDate;
  schedule?: AmortizationRow[];
  paymentsSaved?: number;
  interestSaved?: number;
}

function stepDate(date: CalendarDate, frequency: PaymentFrequency): CalendarDate {
  if (frequency === "monthly") return addCalendarTime(date, { months: 1 });
  if (frequency === "biweekly") return addCalendarTime(date, { days: 14 });
  return addCalendarTime(date, { days: 7 });
}

function computeNumberOfPayments(termValue: number, termUnit: LoanTermUnit, frequency: PaymentFrequency): number {
  const totalYears = termUnit === "years" ? termValue : termValue / 12;
  return Math.round(totalYears * PERIODS_PER_YEAR[frequency]);
}

function buildSchedule(
  principalMinor: number,
  periodicRate: number,
  basePaymentMinor: number,
  numberOfPayments: number,
  startDate: CalendarDate,
  frequency: PaymentFrequency,
  extraRecurringMinor: number,
  extraOnceMinor: number,
  extraOncePeriod: number
): AmortizationRow[] {
  const rows: AmortizationRow[] = [];
  let balance = principalMinor;
  let date = startDate;

  for (let n = 1; n <= numberOfPayments && balance > 0; n++) {
    date = stepDate(date, frequency);
    const interestMinor = Math.round(balance * periodicRate);
    let principalPortion = basePaymentMinor - interestMinor;
    let extra = extraRecurringMinor + (n === extraOncePeriod ? extraOnceMinor : 0);

    // Never let a payment (base + extra) exceed the remaining balance — the final payment (or one
    // inflated by an extra payment) is trimmed so the balance lands at exactly 0, never negative.
    if (principalPortion + extra >= balance) {
      extra = Math.max(0, balance - principalPortion);
      if (principalPortion > balance) principalPortion = balance;
    }

    // Real bug found by its own test: `basePaymentMinor` is a ROUNDED integer-cents payment, so
    // the schedule can still fall a few cents short of zero by the last scheduled period even
    // without an overshoot ever being detected above. A real amortization schedule always adjusts
    // the final payment to absorb exactly this rounding gap ("el último pago ajustado", spec
    // section 11) — forced here explicitly rather than left as a stray non-zero balance.
    if (n === numberOfPayments && principalPortion + extra < balance) {
      principalPortion = balance - extra;
    }

    const totalPrincipalThisPeriod = principalPortion + extra;
    balance -= totalPrincipalThisPeriod;
    rows.push({
      paymentNumber: n,
      date,
      payment: fromMinorUnits(principalPortion + interestMinor + extra),
      principal: fromMinorUnits(principalPortion),
      interest: fromMinorUnits(interestMinor),
      extraPayment: fromMinorUnits(extra),
      balance: fromMinorUnits(Math.max(0, balance)),
    });
  }
  return rows;
}

export function calculateLoan(input: LoanInput): LoanResult {
  if (input.principal <= 0) return { ok: false, error: "El importe principal debe ser mayor que cero." };
  if (input.annualRatePercent < 0) return { ok: false, error: "La tasa anual no puede ser negativa." };
  if (input.termValue <= 0) return { ok: false, error: "El plazo debe ser mayor que cero." };

  const periodsPerYear = PERIODS_PER_YEAR[input.frequency];
  const periodicRate = input.annualRatePercent / 100 / periodsPerYear;
  const numberOfPayments = computeNumberOfPayments(input.termValue, input.termUnit, input.frequency);
  if (numberOfPayments < 1) return { ok: false, error: "El plazo es demasiado corto para la frecuencia de pago elegida." };
  if (numberOfPayments > 100_000) return { ok: false, error: "El número de pagos resultante es demasiado grande." };

  const principalMinor = toMinorUnits(input.principal);
  const basePayment = periodicRate === 0 ? input.principal / numberOfPayments : (input.principal * periodicRate) / (1 - Math.pow(1 + periodicRate, -numberOfPayments));
  if (!Number.isFinite(basePayment)) return { ok: false, error: "No se pudo calcular un pago finito con estos parámetros." };
  const basePaymentMinor = toMinorUnits(basePayment);

  const extraRecurringMinor = toMinorUnits(input.extraPaymentRecurring ?? 0);
  const extraOnceMinor = toMinorUnits(input.extraPaymentOnce ?? 0);
  const extraOncePeriod = input.extraPaymentOncePeriod ?? -1;
  if (extraRecurringMinor < 0 || extraOnceMinor < 0) return { ok: false, error: "Los pagos adicionales no pueden ser negativos." };

  const schedule = buildSchedule(principalMinor, periodicRate, basePaymentMinor, numberOfPayments, input.startDate, input.frequency, extraRecurringMinor, extraOnceMinor, extraOncePeriod);

  const totalInterestMinor = schedule.reduce((sum, row) => sum + toMinorUnits(row.interest), 0);
  const totalPrincipalMinor = schedule.reduce((sum, row) => sum + toMinorUnits(row.principal) + toMinorUnits(row.extraPayment), 0);
  const feeMinor = toMinorUnits(input.originationFee ?? 0);
  const totalCostMinor = totalInterestMinor + totalPrincipalMinor + feeMinor;

  let paymentsSaved: number | undefined;
  let interestSaved: number | undefined;
  if (extraRecurringMinor > 0 || extraOnceMinor > 0) {
    const baseline = buildSchedule(principalMinor, periodicRate, basePaymentMinor, numberOfPayments, input.startDate, input.frequency, 0, 0, -1);
    const baselineInterest = baseline.reduce((sum, row) => sum + toMinorUnits(row.interest), 0);
    paymentsSaved = baseline.length - schedule.length;
    interestSaved = fromMinorUnits(baselineInterest - totalInterestMinor);
  }

  return {
    ok: true,
    periodicPayment: fromMinorUnits(basePaymentMinor),
    numberOfPayments,
    actualNumberOfPayments: schedule.length,
    totalInterest: fromMinorUnits(totalInterestMinor),
    totalPrincipal: fromMinorUnits(totalPrincipalMinor),
    totalCost: fromMinorUnits(totalCostMinor),
    finalPaymentDate: schedule[schedule.length - 1]?.date ?? input.startDate,
    schedule,
    paymentsSaved,
    interestSaved,
  };
}
