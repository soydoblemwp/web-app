import { describe, expect, it } from "vitest";
import { toMinorUnits, fromMinorUnits, formatMoney, distributeMinorUnits } from "@/lib/public-tools/finance/money";
import { calculateLoan } from "@/lib/public-tools/finance/loan";
import { calculateProjection, calculateSavingsGoal } from "@/lib/public-tools/finance/compound-interest";

describe("finance/money.ts: minor-unit (cents) precision policy", () => {
  it("converts major to minor units and back exactly", () => {
    expect(toMinorUnits(19.99)).toBe(1999);
    expect(fromMinorUnits(1999)).toBeCloseTo(19.99, 10);
  });
  it("formats money with two decimal places and a real thousands separator", () => {
    expect(formatMoney(1999)).toBe("$19.99");
    expect(formatMoney(199900)).toBe("$1,999.00");
    expect(formatMoney(-500)).toBe("-$5.00");
  });
  it("distributes an integer total across shares without losing a single cent to rounding", () => {
    const shares = distributeMinorUnits(100, 3);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(100);
    expect(shares).toEqual([34, 33, 33]);
  });
});

describe("finance/loan.ts: real amortization math", () => {
  it("rejects a non-positive principal, negative rate, or non-positive term", () => {
    expect(calculateLoan({ principal: 0, annualRatePercent: 5, termValue: 1, termUnit: "years", frequency: "monthly", startDate: { year: 2026, month: 1, day: 1 } }).ok).toBe(false);
    expect(calculateLoan({ principal: 1000, annualRatePercent: -1, termValue: 1, termUnit: "years", frequency: "monthly", startDate: { year: 2026, month: 1, day: 1 } }).ok).toBe(false);
    expect(calculateLoan({ principal: 1000, annualRatePercent: 5, termValue: 0, termUnit: "years", frequency: "monthly", startDate: { year: 2026, month: 1, day: 1 } }).ok).toBe(false);
  });

  it("a 0% interest loan splits the principal evenly across payments, ending at exactly zero", () => {
    const result = calculateLoan({ principal: 1200, annualRatePercent: 0, termValue: 12, termUnit: "months", frequency: "monthly", startDate: { year: 2026, month: 1, day: 1 } });
    expect(result.ok).toBe(true);
    expect(result.periodicPayment).toBeCloseTo(100, 2);
    expect(result.schedule![result.schedule!.length - 1].balance).toBe(0);
    expect(result.totalInterest).toBeCloseTo(0, 2);
  });

  it("a real interest-bearing loan: the final balance always ends at exactly zero (never negative, never a stray remainder)", () => {
    const result = calculateLoan({ principal: 20000, annualRatePercent: 6.5, termValue: 5, termUnit: "years", frequency: "monthly", startDate: { year: 2026, month: 1, day: 1 } });
    expect(result.ok).toBe(true);
    expect(result.schedule!.length).toBe(60);
    expect(result.schedule![59].balance).toBe(0);
  });

  it("the sum of each row's principal (+ extra) across the schedule reconstructs the original principal exactly", () => {
    const principal = 15000;
    const result = calculateLoan({ principal, annualRatePercent: 4, termValue: 3, termUnit: "years", frequency: "monthly", startDate: { year: 2026, month: 1, day: 1 } });
    const totalPrincipalPaid = result.schedule!.reduce((sum, row) => sum + row.principal + row.extraPayment, 0);
    expect(totalPrincipalPaid).toBeCloseTo(principal, 2);
  });

  it("a recurring extra payment reduces both the number of payments and the total interest", () => {
    const base = calculateLoan({ principal: 20000, annualRatePercent: 6.5, termValue: 5, termUnit: "years", frequency: "monthly", startDate: { year: 2026, month: 1, day: 1 } });
    const withExtra = calculateLoan({ principal: 20000, annualRatePercent: 6.5, termValue: 5, termUnit: "years", frequency: "monthly", startDate: { year: 2026, month: 1, day: 1 }, extraPaymentRecurring: 100 });
    expect(withExtra.actualNumberOfPayments!).toBeLessThan(base.actualNumberOfPayments!);
    expect(withExtra.totalInterest!).toBeLessThan(base.totalInterest!);
    expect(withExtra.paymentsSaved).toBeGreaterThan(0);
    expect(withExtra.interestSaved).toBeGreaterThan(0);
  });

  it("an extra payment larger than the remaining balance never produces a negative balance", () => {
    const result = calculateLoan({ principal: 1000, annualRatePercent: 5, termValue: 12, termUnit: "months", frequency: "monthly", startDate: { year: 2026, month: 1, day: 1 }, extraPaymentOnce: 100000, extraPaymentOncePeriod: 1 });
    expect(result.ok).toBe(true);
    expect(result.schedule!.every((row) => row.balance >= 0)).toBe(true);
    expect(result.actualNumberOfPayments).toBe(1);
  });

  it("different frequencies (weekly/biweekly/monthly) all produce a valid, zero-ending schedule", () => {
    for (const frequency of ["monthly", "biweekly", "weekly"] as const) {
      const result = calculateLoan({ principal: 5000, annualRatePercent: 5, termValue: 1, termUnit: "years", frequency, startDate: { year: 2026, month: 1, day: 1 } });
      expect(result.ok, frequency).toBe(true);
      expect(result.schedule![result.schedule!.length - 1].balance).toBe(0);
    }
  });

  it("a short term (single payment) works correctly", () => {
    const result = calculateLoan({ principal: 1000, annualRatePercent: 5, termValue: 1, termUnit: "months", frequency: "monthly", startDate: { year: 2026, month: 1, day: 1 } });
    expect(result.ok).toBe(true);
    expect(result.schedule!.length).toBe(1);
    expect(result.schedule![0].balance).toBe(0);
  });
});

describe("finance/compound-interest.ts: projection", () => {
  it("rejects negative deposit/contribution/rate or non-positive years", () => {
    expect(calculateProjection({ initialDeposit: -1, contribution: 0, contributionFrequency: "monthly", annualRatePercent: 5, compoundingFrequency: "monthly", years: 1, timing: "end" }).ok).toBe(false);
    expect(calculateProjection({ initialDeposit: 0, contribution: 0, contributionFrequency: "monthly", annualRatePercent: 5, compoundingFrequency: "monthly", years: 0, timing: "end" }).ok).toBe(false);
  });

  it("0% rate: future value equals initial deposit plus total contributions exactly", () => {
    const result = calculateProjection({ initialDeposit: 1000, contribution: 100, contributionFrequency: "monthly", annualRatePercent: 0, compoundingFrequency: "monthly", years: 1, timing: "end" });
    expect(result.ok).toBe(true);
    expect(result.futureValue).toBeCloseTo(1000 + 100 * 12, 6);
    expect(result.totalInterest).toBeCloseTo(0, 6);
  });

  it("matches the standard closed-form future-value-of-annuity formula when compounding matches contribution frequency", () => {
    const initial = 1000;
    const contribution = 100;
    const annualRate = 6;
    const years = 5;
    const n = 12;
    const r = annualRate / 100 / n;
    const periods = years * n;
    // Independent reference formula (end-of-period contributions).
    const expectedFV = initial * Math.pow(1 + r, periods) + contribution * ((Math.pow(1 + r, periods) - 1) / r);
    const result = calculateProjection({ initialDeposit: initial, contribution, contributionFrequency: "monthly", annualRatePercent: annualRate, compoundingFrequency: "monthly", years, timing: "end" });
    expect(result.futureValue!).toBeCloseTo(expectedFV, 4);
  });

  it("start-of-period contributions produce a higher future value than end-of-period (extra period of interest)", () => {
    const startTiming = calculateProjection({ initialDeposit: 0, contribution: 100, contributionFrequency: "monthly", annualRatePercent: 6, compoundingFrequency: "monthly", years: 5, timing: "start" });
    const endTiming = calculateProjection({ initialDeposit: 0, contribution: 100, contributionFrequency: "monthly", annualRatePercent: 6, compoundingFrequency: "monthly", years: 5, timing: "end" });
    expect(startTiming.futureValue!).toBeGreaterThan(endTiming.futureValue!);
  });

  it("supports a contribution frequency different from the compounding frequency (annual contribution, monthly compounding) while preserving the exact annual contribution total", () => {
    const result = calculateProjection({ initialDeposit: 0, contribution: 1200, contributionFrequency: "annually", annualRatePercent: 0, compoundingFrequency: "monthly", years: 1, timing: "end" });
    expect(result.ok).toBe(true);
    expect(result.totalContributions).toBeCloseTo(1200, 6); // preserved exactly at 0% rate regardless of proration
  });

  it("inflation adjustment is optional and shown separately from the nominal figures", () => {
    const withoutInflation = calculateProjection({ initialDeposit: 1000, contribution: 0, contributionFrequency: "monthly", annualRatePercent: 5, compoundingFrequency: "monthly", years: 10, timing: "end" });
    expect(withoutInflation.realFutureValue).toBeUndefined();
    const withInflation = calculateProjection({ initialDeposit: 1000, contribution: 0, contributionFrequency: "monthly", annualRatePercent: 5, compoundingFrequency: "monthly", years: 10, timing: "end", annualInflationPercent: 3 });
    expect(withInflation.realFutureValue).toBeDefined();
    expect(withInflation.realFutureValue!).toBeLessThan(withInflation.futureValue!);
    expect(withInflation.futureValue).toBeCloseTo(withoutInflation.futureValue!, 6); // nominal figure unaffected by the inflation toggle
  });
});

describe("finance/compound-interest.ts: savings goal (inverse of projection)", () => {
  it("solves a contribution that, when projected forward, reaches the goal", () => {
    const goalResult = calculateSavingsGoal({ goal: 50000, initialDeposit: 1000, annualRatePercent: 5, years: 10, compoundingFrequency: "monthly", contributionFrequency: "monthly", timing: "end" });
    expect(goalResult.ok).toBe(true);
    const projected = calculateProjection({
      initialDeposit: 1000,
      contribution: goalResult.requiredContribution!,
      contributionFrequency: "monthly",
      annualRatePercent: 5,
      compoundingFrequency: "monthly",
      years: 10,
      timing: "end",
    });
    expect(projected.futureValue!).toBeCloseTo(50000, 1);
  });

  it("when the initial deposit alone already exceeds the goal, the required contribution is zero", () => {
    const result = calculateSavingsGoal({ goal: 1000, initialDeposit: 10000, annualRatePercent: 5, years: 5, compoundingFrequency: "monthly", contributionFrequency: "monthly", timing: "end" });
    expect(result.ok).toBe(true);
    expect(result.requiredContribution).toBe(0);
  });

  it("0% rate: required contribution is simply (goal - initial) / totalPeriods", () => {
    const result = calculateSavingsGoal({ goal: 12000, initialDeposit: 0, annualRatePercent: 0, years: 1, compoundingFrequency: "monthly", contributionFrequency: "monthly", timing: "end" });
    expect(result.requiredContribution).toBeCloseTo(1000, 6);
  });

  it("rejects a non-positive goal or non-positive years", () => {
    expect(calculateSavingsGoal({ goal: 0, initialDeposit: 0, annualRatePercent: 5, years: 1, compoundingFrequency: "monthly", contributionFrequency: "monthly", timing: "end" }).ok).toBe(false);
    expect(calculateSavingsGoal({ goal: 1000, initialDeposit: 0, annualRatePercent: 5, years: 0, compoundingFrequency: "monthly", contributionFrequency: "monthly", timing: "end" }).ok).toBe(false);
  });
});
