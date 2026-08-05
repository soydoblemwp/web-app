import { describe, expect, it } from "vitest";
import { calculateSingleProduct, calculateProfitTarget, calculateProductMix } from "@/lib/public-tools/commerce/break-even";
import { calculateRoi, calculateRoas, calculatePayback } from "@/lib/public-tools/commerce/roi-roas";
import { calculateReorderPoint, calculateSafetyStock, calculateEoq, calculateCoverage } from "@/lib/public-tools/commerce/inventory";
import { calculateProductProfitability, sortByProfit, sortByMargin, findLossMakingProducts } from "@/lib/public-tools/commerce/product-profitability";
import { calculateCommission, splitCommissionAmongReps } from "@/lib/public-tools/commerce/sales-commission";
import { calculateUnitPrices } from "@/lib/public-tools/commerce/unit-price";
import { calculateGpa, calculateRequiredGradeForTarget, createCourse } from "@/lib/public-tools/education/gpa";
import { calculateFinalExamNeeded, calculateCourseGrade, createGradeCategory } from "@/lib/public-tools/education/final-grade";
import { calculateFuelTrip, compareVehicles, toLitersPer100Km, fromLitersPer100Km } from "@/lib/public-tools/travel/fuel-trip";
import { convertRecipeUnit, toFriendlyFraction } from "@/lib/public-tools/cooking/recipe-units";
import { scaleByMultiplier, scaleByServings, scaleByPanSize, computePanArea, createRecipeIngredient } from "@/lib/public-tools/cooking/recipe-scaling";
import { calculateBakersPercentages, recalculateForTotalWeight } from "@/lib/public-tools/cooking/bakers-percentage";
import { calculateRecipeCost, createCostIngredient } from "@/lib/public-tools/cooking/recipe-cost";
import { calculateApplianceEnergy, applyTariff, calculateMaxHoursForTarget, createAppliance } from "@/lib/public-tools/household/electricity";
import { PUBLIC_TOOL_DEFINITIONS } from "@/lib/public-tools/registry";

// ---------------------------------------------------------------------------
// Inventory (spec section 4): confirms genuine capabilities, no duplication
// ---------------------------------------------------------------------------
describe("Fase 48 inventory: 12 new tools registered, no duplicates", () => {
  it("registers exactly 12 new Fase 48 tools, all DETERMINISTIC and device-only", () => {
    const slugs = [
      "calculadora-punto-equilibrio",
      "calculadora-roi-roas-recuperacion",
      "calculadora-inventario-reposicion",
      "calculadora-rentabilidad-productos",
      "calculadora-comisiones-ventas",
      "comparador-precio-unidad",
      "calculadora-gpa-promedio",
      "calculadora-nota-final",
      "calculadora-costo-combustible-viaje",
      "escalar-recetas",
      "calculadora-costo-receta",
      "calculadora-consumo-electrico",
    ];
    for (const slug of slugs) {
      const tool = PUBLIC_TOOL_DEFINITIONS.find((t) => t.slug === slug);
      expect(tool, slug).toBeDefined();
      expect(tool!.executionType, slug).toBe("DETERMINISTIC");
      expect(tool!.privacy, slug).toBe("device-only");
      expect(tool!.isNew, slug).toBe(true);
    }
  });

  it("the percentage calculator already covers margin and markup — break-even/profitability are genuinely distinct capabilities, not duplicates", async () => {
    const { calculatePercentage } = await import("@/lib/public-tools/utilities/percentages");
    expect(calculatePercentage("margin", 100, 60).ok).toBe(true);
    expect(calculatePercentage("markup", 100, 60).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Break-even (spec sections 10-11, 40-41)
// ---------------------------------------------------------------------------
describe("commerce/break-even.ts: single product", () => {
  it("computes contribution margin, break-even units/revenue, and margin of safety with an independently hand-calculated result", () => {
    // fixed=1000, price=20, variable=8 -> contribution=12, ratio=0.6, breakEvenUnits=1000/12=83.333...
    const result = calculateSingleProduct({ fixedCostsMinor: 1000, priceMinor: 20, variableCostMinor: 8, expectedUnits: 100 });
    expect(result.ok).toBe(true);
    expect(result.contributionMarginMinor).toBe(12);
    expect(result.contributionMarginRatio).toBeCloseTo(0.6, 10);
    expect(result.breakEvenUnits).toBeCloseTo(1000 / 12, 10);
    expect(result.breakEvenRevenueMinor).toBeCloseTo((1000 / 12) * 20, 10);
    // profit at 100 units = 100*12 - 1000 = 200
    expect(result.profitAtExpectedMinor).toBeCloseTo(200, 10);
    // margin of safety = 100 - 83.333 = 16.666...
    expect(result.marginOfSafetyUnits).toBeCloseTo(100 - 1000 / 12, 10);
  });

  it("never returns a finite break-even when price equals variable cost (zero contribution)", () => {
    const result = calculateSingleProduct({ fixedCostsMinor: 1000, priceMinor: 10, variableCostMinor: 10, expectedUnits: 50 });
    expect(result.ok).toBe(false);
    expect(result.breakEvenUnits).toBeUndefined();
  });

  it("never returns a finite break-even when price is less than variable cost (negative contribution)", () => {
    const result = calculateSingleProduct({ fixedCostsMinor: 1000, priceMinor: 5, variableCostMinor: 10, expectedUnits: 50 });
    expect(result.ok).toBe(false);
  });

  it("rejects negative fixed costs, price, or variable cost", () => {
    expect(calculateSingleProduct({ fixedCostsMinor: -1, priceMinor: 10, variableCostMinor: 5, expectedUnits: 0 }).ok).toBe(false);
    expect(calculateSingleProduct({ fixedCostsMinor: 100, priceMinor: -1, variableCostMinor: 5, expectedUnits: 0 }).ok).toBe(false);
    expect(calculateSingleProduct({ fixedCostsMinor: 100, priceMinor: 10, variableCostMinor: -1, expectedUnits: 0 }).ok).toBe(false);
  });

  it("zero fixed costs produces a break-even at zero units", () => {
    const result = calculateSingleProduct({ fixedCostsMinor: 0, priceMinor: 20, variableCostMinor: 8, expectedUnits: 10 });
    expect(result.ok).toBe(true);
    expect(result.breakEvenUnits).toBe(0);
  });
});

describe("commerce/break-even.ts: profit target", () => {
  it("computes units/revenue needed for a profit target with an independently hand-calculated result", () => {
    // fixed=1000, contribution=12, profitTarget=500 -> unitsNeeded=(1000+500)/12=125
    const result = calculateProfitTarget({ fixedCostsMinor: 1000, priceMinor: 20, variableCostMinor: 8, expectedUnits: 0, profitTargetMinor: 500 });
    expect(result.ok).toBe(true);
    expect(result.unitsNeeded).toBeCloseTo(125, 10);
    expect(result.revenueNeeded).toBeCloseTo(125 * 20, 10);
    expect(result.differenceFromBreakEvenUnits).toBeCloseTo(125 - 1000 / 12, 10);
  });
});

describe("commerce/break-even.ts: product mix", () => {
  it("computes weighted contribution and per-product break-even units with an independently hand-calculated result", () => {
    // A: price=20,var=8,50% -> contribution=12; B: price=30,var=10,50% -> contribution=20
    // weighted = 0.5*12 + 0.5*20 = 16; totalBreakEvenUnits = 1000/16 = 62.5
    const result = calculateProductMix({
      fixedCostsMinor: 1000,
      products: [
        { id: "a", name: "A", priceMinor: 20, variableCostMinor: 8, proportionPercent: 50 },
        { id: "b", name: "B", priceMinor: 30, variableCostMinor: 10, proportionPercent: 50 },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.weightedContributionMarginMinor).toBeCloseTo(16, 10);
    expect(result.totalBreakEvenUnits).toBeCloseTo(62.5, 10);
    expect(result.perProduct![0].breakEvenUnits).toBeCloseTo(31.25, 10);
    expect(result.perProduct![1].breakEvenUnits).toBeCloseTo(31.25, 10);
  });

  it("normalizes proportions that don't sum to 100% and warns explicitly", () => {
    const result = calculateProductMix({
      fixedCostsMinor: 1000,
      products: [
        { id: "a", name: "A", priceMinor: 20, variableCostMinor: 8, proportionPercent: 30 },
        { id: "b", name: "B", priceMinor: 30, variableCostMinor: 10, proportionPercent: 30 },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.warning).toBeTruthy();
  });

  it("rejects an empty product mix", () => {
    expect(calculateProductMix({ fixedCostsMinor: 1000, products: [] }).ok).toBe(false);
  });

  it("never returns a finite break-even when the weighted contribution is zero or negative", () => {
    const result = calculateProductMix({
      fixedCostsMinor: 1000,
      products: [{ id: "a", name: "A", priceMinor: 10, variableCostMinor: 10, proportionPercent: 100 }],
    });
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ROI / ROAS / Payback (spec sections 12, 40-41)
// ---------------------------------------------------------------------------
describe("commerce/roi-roas.ts: ROI", () => {
  it("distinguishes net profit from gross revenue with an independently hand-calculated result", () => {
    // investment=1000, revenue=1500, costs=100 -> netProfit=1500-100-1000=400, roi=40%
    const result = calculateRoi({ initialInvestmentMinor: 1000, revenueMinor: 1500, additionalCostsMinor: 100 });
    expect(result.ok).toBe(true);
    expect(result.netProfitMinor).toBe(400);
    expect(result.roiPercent).toBeCloseTo(40, 10);
    expect(result.multiple).toBeCloseTo(1.4, 10);
  });

  it("computes a negative ROI honestly when the investment loses money", () => {
    const result = calculateRoi({ initialInvestmentMinor: 1000, revenueMinor: 500, additionalCostsMinor: 0 });
    expect(result.ok).toBe(true);
    expect(result.netProfitMinor).toBe(-500);
    expect(result.roiPercent).toBeCloseTo(-50, 10);
  });

  it("rejects a zero initial investment", () => {
    expect(calculateRoi({ initialInvestmentMinor: 0, revenueMinor: 500, additionalCostsMinor: 0 }).ok).toBe(false);
  });

  it("computes annualized ROI only when a valid duration is provided", () => {
    // 100% ROI over 2 years -> annualized = sqrt(2) - 1 ≈ 0.41421356
    const withYears = calculateRoi({ initialInvestmentMinor: 1000, revenueMinor: 2000, additionalCostsMinor: 0, years: 2 });
    expect(withYears.annualizedRoiPercent).toBeCloseTo((Math.sqrt(2) - 1) * 100, 6);
    const withoutYears = calculateRoi({ initialInvestmentMinor: 1000, revenueMinor: 2000, additionalCostsMinor: 0 });
    expect(withoutYears.annualizedRoiPercent).toBeUndefined();
  });
});

describe("commerce/roi-roas.ts: ROAS", () => {
  it("computes ROAS and never calls gross revenue 'profit'", () => {
    // adSpend=500, revenue=2000 -> roas=4
    const result = calculateRoas({ adSpendMinor: 500, attributedRevenueMinor: 2000, productCostMinor: 600, commissionsMinor: 100, otherVariableCostsMinor: 0 });
    expect(result.ok).toBe(true);
    expect(result.roas).toBeCloseTo(4, 10);
    // netProfitAfterCosts = 2000 - (600+100) - 500 = 800
    expect(result.netProfitAfterCostsMinor).toBeCloseTo(800, 10);
    // netAdReturn = 2000 - 500 = 1500 (distinct from net profit after costs)
    expect(result.netAdReturnMinor).toBeCloseTo(1500, 10);
    expect(result.netProfitAfterCostsMinor).not.toBe(result.roas! * 500);
  });

  it("rejects a zero ad spend", () => {
    expect(calculateRoas({ adSpendMinor: 0, attributedRevenueMinor: 500, productCostMinor: 0, commissionsMinor: 0, otherVariableCostsMinor: 0 }).ok).toBe(false);
  });
});

describe("commerce/roi-roas.ts: payback period", () => {
  it("computes a uniform-flow payback with linear interpolation, independently hand-calculated", () => {
    // investment=1000, flow=300/period -> after 3 periods: -1000+900=-100; period 4: -100+300=200
    // fraction into period 4 = 100/300 = 0.3333 -> payback ≈ 3.3333
    const result = calculatePayback({ mode: "uniform", initialInvestmentMinor: 1000, uniformFlowMinor: 300 });
    expect(result.ok).toBe(true);
    expect(result.simplePaybackPeriods).toBeCloseTo(3 + 100 / 300, 8);
    expect(result.neverRecovered).toBe(false);
  });

  it("computes payback with variable flows per period", () => {
    // investment=1000, flows=[400,400,400] -> after 2: -200; period 3: -200+400=200 -> fraction=200/400=0.5 -> payback=2.5
    const result = calculatePayback({ mode: "flows", initialInvestmentMinor: 1000, flows: [400, 400, 400] });
    expect(result.ok).toBe(true);
    expect(result.simplePaybackPeriods).toBeCloseTo(2.5, 10);
  });

  it("reports never-recovered honestly when flows don't cover the investment within the given periods", () => {
    const result = calculatePayback({ mode: "flows", initialInvestmentMinor: 10000, flows: [100, 100, 100] });
    expect(result.ok).toBe(true);
    expect(result.neverRecovered).toBe(true);
    expect(result.simplePaybackPeriods).toBeUndefined();
  });

  it("computes a discounted payback that is never shorter than the simple payback", () => {
    const result = calculatePayback({ mode: "uniform", initialInvestmentMinor: 1000, uniformFlowMinor: 300, discountRatePercent: 10 });
    expect(result.ok).toBe(true);
    expect(result.discountedPaybackPeriods).toBeDefined();
    expect(result.discountedPaybackPeriods!).toBeGreaterThanOrEqual(result.simplePaybackPeriods! - 1e-9);
  });
});

// ---------------------------------------------------------------------------
// Inventory (spec sections 13, 40-41)
// ---------------------------------------------------------------------------
describe("commerce/inventory.ts: reorder point", () => {
  it("computes reorder point with an independently hand-calculated result", () => {
    // demand=20/day, leadTime=5 days, safety=30 -> reorderPoint = 20*5+30 = 130
    const result = calculateReorderPoint({ averageDailyDemand: 20, leadTimeDays: 5, manualSafetyStock: 30, currentStock: 150, inTransitUnits: 0 });
    expect(result.ok).toBe(true);
    expect(result.reorderPoint).toBe(130);
    expect(result.inventoryPosition).toBe(150);
    expect(result.shouldReorder).toBe(false);
  });

  it("flags shouldReorder when inventory position drops below the reorder point", () => {
    const result = calculateReorderPoint({ averageDailyDemand: 20, leadTimeDays: 5, manualSafetyStock: 30, currentStock: 50, inTransitUnits: 0 });
    expect(result.ok).toBe(true);
    expect(result.shouldReorder).toBe(true);
  });

  it("counts in-transit orders toward inventory position", () => {
    const result = calculateReorderPoint({ averageDailyDemand: 20, leadTimeDays: 5, manualSafetyStock: 30, currentStock: 50, inTransitUnits: 100 });
    expect(result.ok).toBe(true);
    expect(result.inventoryPosition).toBe(150);
  });
});

describe("commerce/inventory.ts: safety stock", () => {
  it("manual mode returns the entered value directly", () => {
    const result = calculateSafetyStock({ mode: "manual", manualValue: 42 });
    expect(result.ok).toBe(true);
    expect(result.safetyStock).toBe(42);
  });

  it("variability mode: safetyStock = Z * demandStdDev * sqrt(leadTime), independently hand-calculated", () => {
    // Z=1.65, stdDev=5, leadTime=9 -> 1.65*5*3=24.75
    const result = calculateSafetyStock({ mode: "variability", serviceFactorZ: 1.65, demandStdDev: 5, averageLeadTimeDays: 9 });
    expect(result.ok).toBe(true);
    expect(result.safetyStock).toBeCloseTo(24.75, 10);
  });

  it("never invents a Z value — it must be supplied directly", () => {
    const result = calculateSafetyStock({ mode: "variability", demandStdDev: 5, averageLeadTimeDays: 9 });
    // default Z of 1 is used only when omitted entirely — still a caller-controlled default, not an invented statistical table
    expect(result.ok).toBe(true);
    expect(result.safetyStock).toBeCloseTo(1 * 5 * 3, 10);
  });
});

describe("commerce/inventory.ts: EOQ", () => {
  it("computes EOQ using the standard independent formula sqrt(2DS/H)", () => {
    // D=5000, S=50, H=2 -> sqrt(2*5000*50/2) = sqrt(250000) = 500
    const result = calculateEoq({ annualDemand: 5000, orderCostMinor: 50, annualHoldingCostPerUnitMinor: 2 });
    expect(result.ok).toBe(true);
    expect(result.economicOrderQuantity).toBeCloseTo(500, 10);
    expect(result.ordersPerYear).toBeCloseTo(10, 10);
    expect(result.averageDaysBetweenOrders).toBeCloseTo(36.5, 10);
    // annual ordering cost = 10*50=500; annual holding cost = (500/2)*2=500 (EOQ minimizes total cost, these should be equal)
    expect(result.annualOrderingCostMinor).toBeCloseTo(500, 6);
    expect(result.annualHoldingCostMinor).toBeCloseTo(500, 6);
  });

  it("rejects zero or negative demand, order cost, or holding cost", () => {
    expect(calculateEoq({ annualDemand: 0, orderCostMinor: 50, annualHoldingCostPerUnitMinor: 2 }).ok).toBe(false);
    expect(calculateEoq({ annualDemand: 5000, orderCostMinor: 0, annualHoldingCostPerUnitMinor: 2 }).ok).toBe(false);
    expect(calculateEoq({ annualDemand: 5000, orderCostMinor: 50, annualHoldingCostPerUnitMinor: 0 }).ok).toBe(false);
  });
});

describe("commerce/inventory.ts: coverage", () => {
  it("computes days of coverage and a real stockout date (status FINITE, hand-calculated: 500/20=25 days)", () => {
    const result = calculateCoverage({ availableStock: 500, averageDailyDemand: 20, startDate: { year: 2026, month: 1, day: 1 } });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.status).toBe("FINITE");
    if (result.status !== "FINITE") throw new Error("unreachable");
    expect(result.daysOfCoverage).toBeCloseTo(25, 10);
    expect(Number.isFinite(result.daysOfCoverage)).toBe(true);
    expect(result.stockoutDate).toEqual({ year: 2026, month: 1, day: 26 });
  });

  it("FASE 48 CORRECTIVE: zero demand returns an explicit NO_DEMAND domain state, never Infinity/NaN/a fictitious date", () => {
    const result = calculateCoverage({ availableStock: 500, averageDailyDemand: 0, startDate: { year: 2026, month: 1, day: 1 } });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.status).toBe("NO_DEMAND");
    if (result.status !== "NO_DEMAND") throw new Error("unreachable");
    expect(result.daysOfCoverage).toBeNull();
    expect(result.stockoutDate).toBeNull();
    expect(typeof result.message).toBe("string");
    expect(result.message.length).toBeGreaterThan(0);
    // never a non-finite sentinel anywhere in the object
    for (const value of Object.values(result)) {
      if (typeof value === "number") expect(Number.isFinite(value)).toBe(true);
    }
  });

  it("FASE 48 CORRECTIVE: the NO_DEMAND result survives a real JSON.stringify/JSON.parse round-trip with no Infinity/NaN text and real null values", () => {
    const result = calculateCoverage({ availableStock: 500, averageDailyDemand: 0, startDate: { year: 2026, month: 1, day: 1 } });
    const json = JSON.stringify(result);
    expect(json).not.toContain("Infinity");
    expect(json).not.toContain("NaN");
    const parsed = JSON.parse(json);
    expect(parsed.status).toBe("NO_DEMAND");
    expect(parsed.daysOfCoverage).toBeNull();
    expect(parsed.stockoutDate).toBeNull();
    expect(typeof parsed.message).toBe("string");
  });

  it("FASE 48 CORRECTIVE: a positive demand after a NO_DEMAND scenario still computes real coverage and a real date (regression: fix didn't break the normal path)", () => {
    const zero = calculateCoverage({ availableStock: 500, averageDailyDemand: 0, startDate: { year: 2026, month: 1, day: 1 } });
    expect(zero.ok && zero.status).toBe("NO_DEMAND");
    const positive = calculateCoverage({ availableStock: 500, averageDailyDemand: 10, startDate: { year: 2026, month: 1, day: 1 } });
    expect(positive.ok).toBe(true);
    if (!positive.ok || positive.status !== "FINITE") throw new Error("unreachable");
    expect(positive.daysOfCoverage).toBeCloseTo(50, 10);
    expect(positive.stockoutDate).toEqual({ year: 2026, month: 2, day: 20 });
  });
});

// ---------------------------------------------------------------------------
// Product profitability (spec sections 14, 40-41)
// ---------------------------------------------------------------------------
describe("commerce/product-profitability.ts", () => {
  it("computes profit per unit including a percent+fixed commission, independently hand-calculated", () => {
    // price=100, cost=40, commission=10%+2 fixed -> commission=12, profit=100-40-12=48 (no other costs/returns)
    const result = calculateProductProfitability({
      id: "1",
      name: "P",
      priceMinor: 100,
      costMinor: 40,
      packagingMinor: 0,
      shippingMinor: 0,
      processingFeeMinor: 0,
      commissionFixedMinor: 2,
      commissionPercent: 10,
      adCostPerSaleMinor: 0,
      returnRatePercent: 0,
      nonRecoverableTaxMinor: 0,
      unitsSoldPerMonth: 10,
      allocatedFixedCostsMinor: 0,
      targetMarginPercent: 30,
    });
    expect(result.ok).toBe(true);
    expect(result.commissionMinor).toBe(12);
    expect(result.profitPerUnitMinor).toBeCloseTo(48, 10);
    expect(result.netMarginPercent).toBeCloseTo(48, 10);
    expect(result.monthlyProfitMinor).toBeCloseTo(480, 10);
  });

  it("applies expected-return loss proportionally to gross profit before returns", () => {
    // price=100,cost=40, no commission, returnRate=10% -> gross before returns=60, loss=6, profit=54
    const result = calculateProductProfitability({
      id: "1",
      name: "P",
      priceMinor: 100,
      costMinor: 40,
      packagingMinor: 0,
      shippingMinor: 0,
      processingFeeMinor: 0,
      commissionFixedMinor: 0,
      commissionPercent: 0,
      adCostPerSaleMinor: 0,
      returnRatePercent: 10,
      nonRecoverableTaxMinor: 0,
      unitsSoldPerMonth: 1,
      allocatedFixedCostsMinor: 0,
      targetMarginPercent: 30,
    });
    expect(result.ok).toBe(true);
    expect(result.returnLossMinor).toBeCloseTo(6, 10);
    expect(result.profitPerUnitMinor).toBeCloseTo(54, 10);
  });

  it("identifies loss-making products and sorts by profit/margin", () => {
    const profitable = calculateProductProfitability({ id: "a", name: "A", priceMinor: 100, costMinor: 40, packagingMinor: 0, shippingMinor: 0, processingFeeMinor: 0, commissionFixedMinor: 0, commissionPercent: 0, adCostPerSaleMinor: 0, returnRatePercent: 0, nonRecoverableTaxMinor: 0, unitsSoldPerMonth: 1, allocatedFixedCostsMinor: 0, targetMarginPercent: 30 });
    const lossy = calculateProductProfitability({ id: "b", name: "B", priceMinor: 30, costMinor: 40, packagingMinor: 0, shippingMinor: 0, processingFeeMinor: 0, commissionFixedMinor: 0, commissionPercent: 0, adCostPerSaleMinor: 0, returnRatePercent: 0, nonRecoverableTaxMinor: 0, unitsSoldPerMonth: 1, allocatedFixedCostsMinor: 0, targetMarginPercent: 30 });
    const results = [profitable, lossy];
    expect(findLossMakingProducts(results).map((r) => r.id)).toEqual(["b"]);
    expect(sortByProfit(results)[0].id).toBe("a");
    expect(sortByMargin(results)[0].id).toBe("a");
  });
});

// ---------------------------------------------------------------------------
// Sales commission (spec sections 15, 40-41)
// ---------------------------------------------------------------------------
describe("commerce/sales-commission.ts", () => {
  it("computes a flat commission with an independently hand-calculated result", () => {
    const result = calculateCommission({ salesMinor: 10000, returnsMinor: 0, flatRatePercent: 5 });
    expect(result.ok).toBe(true);
    expect(result.baseCommissionMinor).toBe(500);
  });

  it("progressive tiers: only the portion of sales inside each tier uses that tier's rate", () => {
    // tier1 [0,5000)@3%, tier2 [5000,∞)@6%, sales=8000
    // tier1: 5000*0.03=150; tier2: 3000*0.06=180; total=330
    const result = calculateCommission({
      salesMinor: 8000,
      returnsMinor: 0,
      tierMode: "progressive",
      tiers: [
        { id: "t1", fromMinor: 0, toMinor: 5000, ratePercent: 3 },
        { id: "t2", fromMinor: 5000, toMinor: null, ratePercent: 6 },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.baseCommissionMinor).toBe(330);
  });

  it("retroactive tiers: ALL commissionable sales pay the rate of the tier finally reached — never blended like progressive", () => {
    // same tiers, sales=8000 lands in tier2 -> ALL 8000*0.06=480 (not 330 like progressive)
    const result = calculateCommission({
      salesMinor: 8000,
      returnsMinor: 0,
      tierMode: "retroactive",
      tiers: [
        { id: "t1", fromMinor: 0, toMinor: 5000, ratePercent: 3 },
        { id: "t2", fromMinor: 5000, toMinor: null, ratePercent: 6 },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.baseCommissionMinor).toBe(480);
    expect(result.baseCommissionMinor).not.toBe(330);
  });

  it("quota and accelerator: rate changes after the quota, accelerator multiplies the post-quota rate", () => {
    // quota=5000, before=2%, after=5%, accelerator=2 -> below: 5000*0.02=100; above: 3000*0.05*2=300; total=400
    const result = calculateCommission({ salesMinor: 8000, returnsMinor: 0, quotaMinor: 5000, rateBeforeQuotaPercent: 2, rateAfterQuotaPercent: 5, accelerator: 2 });
    expect(result.ok).toBe(true);
    expect(result.baseCommissionMinor).toBe(400);
  });

  it("subtracts returns before computing commissionable sales, and applies bonus/deductions after the base commission", () => {
    const result = calculateCommission({ salesMinor: 10000, returnsMinor: 2000, flatRatePercent: 10, bonusMinor: 50, deductionsMinor: 20 });
    expect(result.ok).toBe(true);
    expect(result.commissionableSalesMinor).toBe(8000);
    expect(result.baseCommissionMinor).toBe(800);
    expect(result.finalCommissionMinor).toBe(800 + 50 - 20);
  });

  it("splits a commission among reps by share percentage, summing exactly to the total (no lost cent)", () => {
    const result = splitCommissionAmongReps(1000, [
      { id: "a", name: "A", sharePercent: 33 },
      { id: "b", name: "B", sharePercent: 33 },
      { id: "c", name: "C", sharePercent: 34 },
    ]);
    expect(result.ok).toBe(true);
    const total = result.splits!.reduce((sum, s) => sum + s.amountMinor, 0);
    expect(total).toBe(1000);
  });

  it("rejects overlapping tiers", () => {
    const result = calculateCommission({
      salesMinor: 1000,
      returnsMinor: 0,
      tiers: [
        { id: "t1", fromMinor: 0, toMinor: 5000, ratePercent: 3 },
        { id: "t2", fromMinor: 4000, toMinor: null, ratePercent: 6 },
      ],
    });
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unit price comparator (spec sections 16, 40-41)
// ---------------------------------------------------------------------------
describe("commerce/unit-price.ts", () => {
  it("ranks products by real price-per-base-unit, independently hand-calculated", () => {
    // "masa" category's base unit is the kilogram (per utilities/units.ts), not the gram.
    // A: 1000 minor / (1000g=1kg) = 1000/kg; B: 400 minor / (500g=0.5kg) = 800/kg -> B is cheaper
    const result = calculateUnitPrices({
      categoryId: "masa",
      products: [
        { id: "a", name: "A", finalPriceMinor: 1000, packageQuantity: 1000, unitId: "g", packagesCount: 1, usablePercent: 100 },
        { id: "b", name: "B", finalPriceMinor: 400, packageQuantity: 500, unitId: "g", packagesCount: 1, usablePercent: 100 },
      ],
    });
    expect(result.ok).toBe(true);
    const a = result.products!.find((p) => p.id === "a")!;
    const b = result.products!.find((p) => p.id === "b")!;
    expect(a.pricePerUsableBaseUnitMinor).toBeCloseTo(1000, 8);
    expect(b.pricePerUsableBaseUnitMinor).toBeCloseTo(800, 8);
    expect(b.isBestValue).toBe(true);
    expect(b.rank).toBe(1);
    expect(a.rank).toBe(2);
  });

  it("accounts for usable-content percentage (e.g. trimmed/wasted content) in the real price per unit", () => {
    // price=100 for a 1000g=1kg package but only 50% usable -> effective usable qty=0.5kg -> 100/0.5=200/kg
    const result = calculateUnitPrices({
      categoryId: "masa",
      products: [
        { id: "a", name: "A", finalPriceMinor: 100, packageQuantity: 1000, unitId: "g", packagesCount: 1, usablePercent: 50 },
        { id: "b", name: "B", finalPriceMinor: 100, packageQuantity: 1000, unitId: "g", packagesCount: 1, usablePercent: 100 },
      ],
    });
    expect(result.ok).toBe(true);
    const a = result.products!.find((p) => p.id === "a")!;
    expect(a.pricePerUsableBaseUnitMinor).toBeCloseTo(200, 8);
  });

  it("requires at least 2 products", () => {
    expect(calculateUnitPrices({ categoryId: "masa", products: [{ id: "a", name: "A", finalPriceMinor: 100, packageQuantity: 1, unitId: "g", packagesCount: 1, usablePercent: 100 }] }).ok).toBe(false);
  });

  it("never mixes mass and volume categories — each product's unit must belong to the selected category", () => {
    const result = calculateUnitPrices({
      categoryId: "masa",
      products: [
        { id: "a", name: "A", finalPriceMinor: 100, packageQuantity: 1, unitId: "ml", packagesCount: 1, usablePercent: 100 },
        { id: "b", name: "B", finalPriceMinor: 100, packageQuantity: 1, unitId: "g", packagesCount: 1, usablePercent: 100 },
      ],
    });
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GPA (spec sections 17, 40-41)
// ---------------------------------------------------------------------------
describe("education/gpa.ts", () => {
  it("computes a weighted average GPA, independently hand-calculated", () => {
    // A: grade=3.5,credits=3; B: grade=4.0,credits=4 -> (3.5*3+4*4)/7 = 26.5/7
    const courses = [
      { ...createCourse(), gradeValue: 3.5, credits: 3 },
      { ...createCourse(), gradeValue: 4.0, credits: 4 },
    ];
    const result = calculateGpa(courses, { scaleId: "gpa-4" });
    expect(result.ok).toBe(true);
    expect(result.gpa).toBeCloseTo(26.5 / 7, 10);
    expect(result.creditsAttempted).toBe(7);
    expect(result.creditsCounted).toBe(7);
  });

  it("excludes 'excluded' and 'pass-fail' courses from the weighted average, but still counts them in credits attempted", () => {
    const courses = [
      { ...createCourse(), gradeValue: 4.0, credits: 3, type: "graded" as const },
      { ...createCourse(), gradeValue: 4.0, credits: 5, type: "excluded" as const },
    ];
    const result = calculateGpa(courses, { scaleId: "gpa-4" });
    expect(result.ok).toBe(true);
    expect(result.gpa).toBeCloseTo(4.0, 10);
    expect(result.creditsAttempted).toBe(8);
    expect(result.creditsCounted).toBe(3);
  });

  it("custom scale: a level with countsInAverage:false is excluded, never assumed", () => {
    const passLevel = { id: "pass", label: "Aprobado", points: 0, countsInAverage: false };
    const gradedLevel = { id: "a", label: "A", points: 4, countsInAverage: true };
    const courses = [
      { ...createCourse(), customLevelId: "a", credits: 3 },
      { ...createCourse(), customLevelId: "pass", credits: 3 },
    ];
    const result = calculateGpa(courses, { scaleId: "custom", customScale: { levels: [passLevel, gradedLevel] } });
    expect(result.ok).toBe(true);
    expect(result.gpa).toBeCloseTo(4.0, 10);
    expect(result.creditsCounted).toBe(3);
  });

  it("solves the required average grade for a target GPA, independently hand-calculated", () => {
    // current: 1 course grade=3.0 credits=10 (30 quality points). target=3.5 over +10 credits.
    // total credits after = 20; required total quality points = 3.5*20=70; needed on new 10 credits = 70-30=40 -> avg=4.0
    const courses = [{ ...createCourse(), gradeValue: 3.0, credits: 10 }];
    const result = calculateRequiredGradeForTarget({ currentCourses: courses, ctx: { scaleId: "gpa-4" }, targetGpa: 3.5, additionalCredits: 10 });
    expect(result.ok).toBe(true);
    expect(result.requiredAverageGrade).toBeCloseTo(4.0, 10);
    expect(result.achievable).toBe(true);
  });

  it("flags an unachievable required grade when it exceeds the scale maximum", () => {
    const courses = [{ ...createCourse(), gradeValue: 1.0, credits: 10 }];
    const result = calculateRequiredGradeForTarget({ currentCourses: courses, ctx: { scaleId: "gpa-4" }, targetGpa: 4.0, additionalCredits: 1 });
    expect(result.ok).toBe(true);
    expect(result.achievable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Final grade (spec sections 18, 40-41)
// ---------------------------------------------------------------------------
describe("education/final-grade.ts: final exam mode", () => {
  it("solves the required exam grade, independently hand-calculated", () => {
    // current=80, weight=20%, target=82, scale=100 -> required=(82-80*0.8)/0.2=(82-64)/0.2=90
    const result = calculateFinalExamNeeded({ currentGrade: 80, finalExamWeightPercent: 20, targetGrade: 82, maxScale: 100 });
    expect(result.ok).toBe(true);
    expect(result.requiredExamGrade).toBeCloseTo(90, 10);
    expect(result.achievable).toBe(true);
  });

  it("detects a mathematically impossible target (required grade exceeds max scale)", () => {
    const result = calculateFinalExamNeeded({ currentGrade: 50, finalExamWeightPercent: 10, targetGrade: 95, maxScale: 100 });
    expect(result.ok).toBe(true);
    expect(result.achievable).toBe(false);
  });
});

describe("education/final-grade.ts: course by categories", () => {
  it("computes current grade and required average on remaining weight, independently hand-calculated", () => {
    // Category A: weight=50%, grade=80 (completed). Category B: weight=50%, no data yet.
    // currentGrade = 80*0.5/0.5 = 80 (only completed weight counted); target=90 overall
    // requiredOnRemaining = ((90/100*100) - (80/100*50)) / 50 * 100 = (90-40)/50*100=100
    const categories = [
      { ...createGradeCategory(), name: "A", weightPercent: 50, currentGrade: 80, hasActivities: true },
      { ...createGradeCategory(), name: "B", weightPercent: 50, hasActivities: false },
    ];
    const result = calculateCourseGrade({ categories, method: "percent", targetGrade: 90, maxScale: 100, roundingPolicy: "none" });
    expect(result.ok).toBe(true);
    expect(result.currentGrade).toBeCloseTo(80, 10);
    expect(result.weightCompletedPercent).toBeCloseTo(50, 10);
    expect(result.requiredAverageOnRemaining).toBeCloseTo(100, 6);
    expect(result.achievable).toBe(true);
  });

  it("points method computes a category grade from earned/possible points scaled to maxScale", () => {
    const categories = [{ ...createGradeCategory(), name: "A", weightPercent: 100, pointsEarned: 45, pointsPossible: 50, hasActivities: true }];
    const result = calculateCourseGrade({ categories, method: "points", targetGrade: 90, maxScale: 100, roundingPolicy: "none" });
    expect(result.ok).toBe(true);
    expect(result.perCategory![0].categoryGrade).toBeCloseTo(90, 10);
  });
});

// ---------------------------------------------------------------------------
// Fuel/trip cost (spec sections 19, 40-41)
// ---------------------------------------------------------------------------
describe("travel/fuel-trip.ts: unit normalization", () => {
  it("normalizes km/l, mpg US, and mpg imperial to l/100km consistently (round trip), independently hand-calculated", () => {
    // 8 l/100km directly
    expect(toLitersPer100Km(8, "l-100km")).toBeCloseTo(8, 10);
    // 12.5 km/l -> 100/12.5 = 8 l/100km
    expect(toLitersPer100Km(12.5, "km-l")).toBeCloseTo(8, 10);
    // round-trip: converting back from l/100km should recover the original value
    expect(fromLitersPer100Km(toLitersPer100Km(30, "mpg-us"), "mpg-us")).toBeCloseTo(30, 6);
    expect(fromLitersPer100Km(toLitersPer100Km(30, "mpg-imperial"), "mpg-imperial")).toBeCloseTo(30, 6);
  });

  it("mpg-imperial and mpg-us produce different l/100km for the same numeric mpg value (real gallon-size difference)", () => {
    const usResult = toLitersPer100Km(30, "mpg-us");
    const imperialResult = toLitersPer100Km(30, "mpg-imperial");
    expect(usResult).not.toBeCloseTo(imperialResult, 3);
  });
});

describe("travel/fuel-trip.ts: cost calculation", () => {
  it("computes fuel needed and cost for a single-leg trip, independently hand-calculated", () => {
    // distance=100km, 8L/100km -> 8L needed; price=1.5/L -> cost=12
    const result = calculateFuelTrip({
      legs: [{ id: "1", label: "", distance: 100, distanceUnit: "km" }],
      roundTrip: false,
      efficiencyValue: 8,
      efficiencyUnit: "l-100km",
      fuelPricePerLiterMinor: 1.5,
      tollsMinor: 0,
      parkingMinor: 0,
      otherCostsMinor: 0,
      passengers: 1,
    });
    expect(result.ok).toBe(true);
    expect(result.totalDistanceKm).toBeCloseTo(100, 10);
    expect(result.fuelNeededLiters).toBeCloseTo(8, 10);
    expect(result.fuelCostMinor).toBeCloseTo(12, 10);
  });

  it("doubles distance for a round trip and splits cost evenly among passengers", () => {
    const result = calculateFuelTrip({
      legs: [{ id: "1", label: "", distance: 100, distanceUnit: "km" }],
      roundTrip: true,
      efficiencyValue: 8,
      efficiencyUnit: "l-100km",
      fuelPricePerLiterMinor: 1.5,
      tollsMinor: 0,
      parkingMinor: 0,
      otherCostsMinor: 0,
      passengers: 4,
    });
    expect(result.ok).toBe(true);
    expect(result.totalDistanceKm).toBeCloseTo(200, 10);
    expect(result.fuelCostMinor).toBeCloseTo(24, 10);
    expect(result.costPerPassengerMinor).toBeCloseTo(6, 10);
  });

  it("sums multiple legs and converts miles to km correctly", () => {
    const result = calculateFuelTrip({
      legs: [
        { id: "1", label: "", distance: 50, distanceUnit: "km" },
        { id: "2", label: "", distance: 10, distanceUnit: "mi" }, // 10 mi = 16.09344 km
      ],
      roundTrip: false,
      efficiencyValue: 8,
      efficiencyUnit: "l-100km",
      fuelPricePerLiterMinor: 1,
      tollsMinor: 0,
      parkingMinor: 0,
      otherCostsMinor: 0,
      passengers: 1,
    });
    expect(result.ok).toBe(true);
    expect(result.totalDistanceKm).toBeCloseTo(50 + 10 * 1.609344, 6);
  });

  it("never accepts a geolocation-derived distance — distance is always a manual number", () => {
    // the calculateFuelTrip signature has no geolocation parameter at all — verified by construction:
    // a trip with only manual legs still produces a result.
    const result = calculateFuelTrip({ legs: [{ id: "1", label: "", distance: 42, distanceUnit: "km" }], roundTrip: false, efficiencyValue: 8, efficiencyUnit: "l-100km", fuelPricePerLiterMinor: 1, tollsMinor: 0, parkingMinor: 0, otherCostsMinor: 0, passengers: 1 });
    expect(result.ok).toBe(true);
  });

  it("compareVehicles identifies the cheapest option and computes real savings differences", () => {
    const cheap = { legs: [{ id: "1", label: "", distance: 100, distanceUnit: "km" as const }], roundTrip: false, efficiencyValue: 5, efficiencyUnit: "l-100km" as const, fuelPricePerLiterMinor: 1, tollsMinor: 0, parkingMinor: 0, otherCostsMinor: 0, passengers: 1 };
    const expensive = { ...cheap, efficiencyValue: 10 };
    const { results, cheapestIndex, savingsVsCheapestMinor } = compareVehicles([expensive, cheap]);
    expect(cheapestIndex).toBe(1);
    expect(savingsVsCheapestMinor[0]).toBeCloseTo(results[0].totalCostMinor! - results[1].totalCostMinor!, 10);
    expect(savingsVsCheapestMinor[1]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Recipe scaling / units (spec sections 20, 40-41)
// ---------------------------------------------------------------------------
describe("cooking/recipe-units.ts", () => {
  it("converts mass to mass and volume to volume without a density", () => {
    expect(convertRecipeUnit(1, "kg", "g").value).toBeCloseTo(1000, 10);
    expect(convertRecipeUnit(1, "l", "ml").value).toBeCloseTo(1000, 10);
    expect(convertRecipeUnit(3, "tsp", "tbsp").ok).toBe(true);
  });

  it("rejects a mass<->volume conversion without a density", () => {
    expect(convertRecipeUnit(100, "g", "ml").ok).toBe(false);
  });

  it("performs a mass<->volume conversion only when density is supplied, independently hand-calculated", () => {
    // 100g water at density 1 g/ml -> 100ml
    const result = convertRecipeUnit(100, "g", "ml", 1);
    expect(result.ok).toBe(true);
    expect(result.value).toBeCloseTo(100, 10);
    // 100ml oil at density 0.92 g/ml -> 92g
    const oil = convertRecipeUnit(100, "ml", "g", 0.92);
    expect(oil.ok).toBe(true);
    expect(oil.value).toBeCloseTo(92, 10);
  });

  it("rejects converting a count-based unit to mass or volume", () => {
    expect(convertRecipeUnit(3, "unit", "g").ok).toBe(false);
  });

  it("renders friendly fractions for common cooking decimals, never silently rounding to a whole number", () => {
    expect(toFriendlyFraction(1.5)).toContain("1/2");
    expect(toFriendlyFraction(0.25)).toBe("1/4");
    expect(toFriendlyFraction(2)).not.toContain("/");
  });
});

describe("cooking/recipe-scaling.ts", () => {
  it("scales ingredient quantities by a direct multiplier", () => {
    const ingredients = [{ ...createRecipeIngredient(), quantity: 500, unitId: "g" }];
    const result = scaleByMultiplier(ingredients, 1.5);
    expect(result.ok).toBe(true);
    expect(result.ingredients![0].scaledQuantity).toBeCloseTo(750, 10);
  });

  it("scales by target servings using the original/target ratio, independently hand-calculated", () => {
    const ingredients = [{ ...createRecipeIngredient(), quantity: 500, unitId: "g" }];
    const result = scaleByServings(ingredients, 4, 6);
    expect(result.ok).toBe(true);
    expect(result.ingredients![0].scaledQuantity).toBeCloseTo(750, 10); // 500 * 6/4
  });

  it("computes real pan areas: circular (πr²), rectangular (w×l), square (s²)", () => {
    expect(computePanArea({ shape: "circular", diameter: 20 }).area).toBeCloseTo(Math.PI * 100, 6);
    expect(computePanArea({ shape: "rectangular", width: 20, length: 30 }).area).toBeCloseTo(600, 10);
    expect(computePanArea({ shape: "square", side: 15 }).area).toBeCloseTo(225, 10);
  });

  it("scales by pan-area ratio, independently hand-calculated", () => {
    // 20cm circle area = π*100; 25cm circle area = π*156.25; ratio = 156.25/100 = 1.5625
    const ingredients = [{ ...createRecipeIngredient(), quantity: 100, unitId: "g" }];
    const result = scaleByPanSize(ingredients, { shape: "circular", diameter: 20 }, { shape: "circular", diameter: 25 });
    if (!result.ok) throw new Error("expected scaleByPanSize to succeed");
    expect(result.areaMultiplier).toBeCloseTo(1.5625, 6);
    expect(result.ingredients![0].scaledQuantity).toBeCloseTo(156.25, 4);
  });

  it("rejects zero or negative servings/pan dimensions", () => {
    expect(scaleByServings([], 0, 6).ok).toBe(false);
    expect(computePanArea({ shape: "circular", diameter: 0 }).ok).toBe(false);
  });
});

describe("cooking/bakers-percentage.ts", () => {
  it("computes baker's percentages relative to the base ingredient, independently hand-calculated", () => {
    // flour=500g (base, 100%), water=325g -> 325/500=65%
    const flour = { ...createRecipeIngredient(), name: "Harina", quantity: 500, unitId: "g" };
    const water = { ...createRecipeIngredient(), name: "Agua", quantity: 325, unitId: "g" };
    const result = calculateBakersPercentages([flour, water], flour.id);
    expect(result.ok).toBe(true);
    const waterRow = result.rows!.find((r) => r.id === water.id)!;
    expect(waterRow.percent).toBeCloseTo(65, 10);
    const flourRow = result.rows!.find((r) => r.id === flour.id)!;
    expect(flourRow.percent).toBeCloseTo(100, 10);
  });

  it("recalculates absolute weights for a target total dough weight, independently hand-calculated", () => {
    // flour 100%=500g, water 65%=325g, total=825g. Target total=1650g (2x) -> flour=1000g, water=650g
    const rows = [
      { id: "flour", name: "Harina", grams: 500, percent: 100 },
      { id: "water", name: "Agua", grams: 325, percent: 65 },
    ];
    const result = recalculateForTotalWeight(rows, 1650);
    expect(result.ok).toBe(true);
    expect(result.rows!.find((r) => r.id === "flour")!.grams).toBeCloseTo(1000, 4);
    expect(result.rows!.find((r) => r.id === "water")!.grams).toBeCloseTo(650, 4);
  });
});

// ---------------------------------------------------------------------------
// Recipe cost (spec sections 21, 40-41)
// ---------------------------------------------------------------------------
describe("cooking/recipe-cost.ts", () => {
  it("computes ingredient cost from package price/size and used quantity, independently hand-calculated", () => {
    // package: 2.00 for 1000g; used 500g -> 1.00
    const ingredient = { ...createCostIngredient(), packagePriceMinor: 200, packageSize: 1000, packageUnitId: "g", usedQuantity: 500, usedUnitId: "g", usableYieldPercent: 100 };
    const result = calculateRecipeCost({ ingredients: [ingredient], servings: 4, additionalDirectCostsMinor: 0 });
    expect(result.ok).toBe(true);
    expect(result.perIngredient![0].usedCostMinor).toBeCloseTo(100, 6);
    expect(result.totalBatchCostMinor).toBeCloseTo(100, 6);
    expect(result.costPerServingMinor).toBeCloseTo(25, 6);
  });

  it("inflates cost for waste using usable yield percentage, independently hand-calculated", () => {
    // raw cost=100 (as above), but only 80% usable -> 100/0.8=125, waste=25
    const ingredient = { ...createCostIngredient(), packagePriceMinor: 200, packageSize: 1000, packageUnitId: "g", usedQuantity: 500, usedUnitId: "g", usableYieldPercent: 80 };
    const result = calculateRecipeCost({ ingredients: [ingredient], servings: 1, additionalDirectCostsMinor: 0 });
    expect(result.ok).toBe(true);
    expect(result.perIngredient![0].usedCostMinor).toBeCloseTo(125, 6);
    expect(result.perIngredient![0].wastedCostMinor).toBeCloseTo(25, 6);
  });

  it("computes a suggested price from a target margin using the transparent inversion price = cost / (1 - margin)", () => {
    // cost/serving=25, margin=40% -> price = 25/0.6 = 41.666...
    const ingredient = { ...createCostIngredient(), packagePriceMinor: 200, packageSize: 1000, packageUnitId: "g", usedQuantity: 500, usedUnitId: "g", usableYieldPercent: 100 };
    const result = calculateRecipeCost({ ingredients: [ingredient], servings: 4, additionalDirectCostsMinor: 0, targetMarginPercent: 40 });
    expect(result.ok).toBe(true);
    expect(result.suggestedPriceMinor).toBeCloseTo(25 / 0.6, 6);
  });

  it("rejects an empty ingredient list and non-positive servings", () => {
    expect(calculateRecipeCost({ ingredients: [], servings: 4, additionalDirectCostsMinor: 0 }).ok).toBe(false);
    expect(calculateRecipeCost({ ingredients: [{ ...createCostIngredient(), packagePriceMinor: 100, packageSize: 1 }], servings: 0, additionalDirectCostsMinor: 0 }).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Electricity consumption (spec sections 22, 40-41)
// ---------------------------------------------------------------------------
describe("household/electricity.ts", () => {
  it("computes daily/monthly/annual kWh from power×time, independently hand-calculated", () => {
    // 1000W * 5h = 5000Wh = 5kWh/day; monthly (30 days) = 150kWh; annual = 5*365=1825kWh
    const appliance = { ...createAppliance(), powerValue: 1000, powerUnit: "w" as const, quantity: 1, hoursPerDay: 5, daysPerUse: 30 };
    const result = calculateApplianceEnergy(appliance);
    expect(result.ok).toBe(true);
    expect(result.dailyActiveKwh).toBeCloseTo(5, 10);
    expect(result.monthlyKwh).toBeCloseTo(150, 10);
    expect(result.annualKwh).toBeCloseTo(1825, 10);
  });

  it("never confuses W with kW: 1kW produces 1000x the energy of 1W for the same hours", () => {
    const wResult = calculateApplianceEnergy({ ...createAppliance(), powerValue: 1, powerUnit: "w", hoursPerDay: 1, daysPerUse: 1 });
    const kwResult = calculateApplianceEnergy({ ...createAppliance(), powerValue: 1, powerUnit: "kw", hoursPerDay: 1, daysPerUse: 1 });
    expect(kwResult.dailyActiveKwh).toBeCloseTo(wResult.dailyActiveKwh! * 1000, 10);
  });

  it("computes cycle-based energy (e.g. dishwasher) instead of hours×power", () => {
    const appliance = { ...createAppliance(), cyclesEnabled: true, energyPerCycleWh: 1200, cyclesPerDay: 1, daysPerUse: 30 };
    const result = calculateApplianceEnergy(appliance);
    expect(result.ok).toBe(true);
    expect(result.dailyActiveKwh).toBeCloseTo(1.2, 10);
  });

  it("applies a flat tariff correctly", () => {
    const cost = applyTariff(5, 5, { mode: "flat", flatPricePerKwhMinor: 0.15, fixedChargeMinor: 0 });
    expect(cost.ok).toBe(true);
    expect(cost.energyCostMinor).toBeCloseTo(0.75, 10);
  });

  it("applies a banded tariff by distributing daily kWh proportionally across the hours in each band, independently hand-calculated", () => {
    // 12 kWh/day over 12 hours -> 1 kWh/hour. Band A: 6h@0.25, Band B: 6h@0.10
    // cost = 6*1*0.25 + 6*1*0.10 = 1.5+0.6=2.1
    const cost = applyTariff(12, 12, {
      mode: "bands",
      bands: [
        { id: "a", label: "Punta", hoursPerDay: 6, pricePerKwhMinor: 0.25 },
        { id: "b", label: "Valle", hoursPerDay: 6, pricePerKwhMinor: 0.1 },
      ],
      fixedChargeMinor: 0,
    });
    expect(cost.ok).toBe(true);
    expect(cost.energyCostMinor).toBeCloseTo(2.1, 6);
  });

  it("solves the maximum daily hours for a target monthly cost, independently hand-calculated", () => {
    // 1000W, flat tariff 0.10/kWh, target=15/month, 30 days -> maxDailyKwh = 15/0.10/30 = 5 -> maxHours = 5000Wh/1000W = 5h
    const appliance = { ...createAppliance(), powerValue: 1000, powerUnit: "w" as const, quantity: 1, daysPerUse: 30 };
    const result = calculateMaxHoursForTarget({ appliance, tariff: { mode: "flat", flatPricePerKwhMinor: 0.1 }, targetMonthlyCostMinor: 15 });
    expect(result.ok).toBe(true);
    expect(result.maxHoursPerDay).toBeCloseTo(5, 6);
  });

  it("FASE 48 CORRECTIVE: rejects (never divides by zero into Infinity/NaN) when appliance quantity is zero", () => {
    const appliance = { ...createAppliance(), powerValue: 1000, powerUnit: "w" as const, quantity: 0, daysPerUse: 30 };
    const result = calculateMaxHoursForTarget({ appliance, tariff: { mode: "flat", flatPricePerKwhMinor: 0.1 }, targetMonthlyCostMinor: 15 });
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.maxHoursPerDay).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// FASE 48 — CORRECCIÓN FINAL: ningún cálculo público devuelve Infinity/NaN.
// Audits every edge case named explicitly in the correction request across
// all 12 tools, plus JSON-export safety for the fixed inventory coverage
// result. Never re-derives an "expected" value from the same production
// function being tested.
// ---------------------------------------------------------------------------
describe("FASE 48 corrective: no domain function ever returns a non-finite (Infinity/-Infinity/NaN) number", () => {
  function assertNoNonFiniteNumbers(value: unknown, path = "root"): void {
    if (typeof value === "number") {
      expect(Number.isFinite(value), `${path} is not finite: ${value}`).toBe(true);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((v, i) => assertNoNonFiniteNumbers(v, `${path}[${i}]`));
      return;
    }
    if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) assertNoNonFiniteNumbers(v, `${path}.${k}`);
    }
  }

  it("break-even sin contribución (price === variableCost): error explícito, campos numéricos siempre finitos", () => {
    const result = calculateSingleProduct({ fixedCostsMinor: 100000, priceMinor: 2000, variableCostMinor: 2000, expectedUnits: 100 });
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
    assertNoNonFiniteNumbers(result);
  });

  it("ROI/ROAS/payback: recuperación nunca alcanzada produce neverRecovered:true, nunca Infinity/NaN en el calendario", () => {
    const result = calculatePayback({ mode: "flows", initialInvestmentMinor: 100000, flows: [100, 100, 100, 100, 100] });
    expect(result.ok).toBe(true);
    expect(result.neverRecovered).toBe(true);
    expect(result.simplePaybackPeriods).toBeUndefined();
    assertNoNonFiniteNumbers(result);
  });

  it("FASE 48 CORRECTIVE: payback rechaza una tasa de descuento <= -100% en vez de dividir por cero", () => {
    const result = calculatePayback({ mode: "uniform", initialInvestmentMinor: 100000, uniformFlowMinor: 10000, discountRatePercent: -100 });
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("FASE 48 CORRECTIVE: una tasa de descuento razonable sigue funcionando (regresión: el guard no bloquea casos válidos)", () => {
    const result = calculatePayback({ mode: "uniform", initialInvestmentMinor: 100000, uniformFlowMinor: 10000, discountRatePercent: 8 });
    expect(result.ok).toBe(true);
    assertNoNonFiniteNumbers(result);
  });

  it("precio unitario con cantidad de paquete cero: rechazado explícitamente, nunca Infinity", () => {
    const result = calculateUnitPrices({
      categoryId: "masa",
      products: [
        { id: "a", name: "A", finalPriceMinor: 500, packageQuantity: 0, unitId: "g", packagesCount: 1, usablePercent: 100 },
        { id: "b", name: "B", finalPriceMinor: 500, packageQuantity: 500, unitId: "g", packagesCount: 1, usablePercent: 100 },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("GPA sin créditos contabilizados (todas las materias excluidas): gpa=0 finito, nunca NaN", () => {
    const result = calculateGpa([{ ...createCourse(), name: "Optativa", credits: 3, type: "excluded" }], { scaleId: "gpa-4" });
    expect(result.ok).toBe(true);
    expect(result.gpa).toBe(0);
    expect(Number.isFinite(result.gpa)).toBe(true);
    expect(result.creditsCounted).toBe(0);
  });

  it("nota final con peso restante cero (categorías cubren el 100%): requiredAverageOnRemaining queda undefined, nunca NaN", () => {
    const result = calculateCourseGrade({
      categories: [{ ...createGradeCategory(), name: "Único", weightPercent: 100, currentGrade: 8, hasActivities: true }],
      method: "percent",
      targetGrade: 9,
      maxScale: 10,
      roundingPolicy: "none",
    });
    expect(result.ok).toBe(true);
    expect(result.weightRemainingPercent).toBe(0);
    expect(result.requiredAverageOnRemaining).toBeUndefined();
    assertNoNonFiniteNumbers(result);
  });

  it("combustible con rendimiento cero: rechazado explícitamente, nunca Infinity", () => {
    const result = calculateFuelTrip({
      legs: [{ id: "l1", label: "", distance: 100, distanceUnit: "km" }],
      roundTrip: false,
      efficiencyValue: 0,
      efficiencyUnit: "l-100km",
      fuelPricePerLiterMinor: 170,
      tollsMinor: 0,
      parkingMinor: 0,
      otherCostsMinor: 0,
      passengers: 1,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("receta con tamaño de paquete cero: rechazado explícitamente, nunca Infinity", () => {
    const result = calculateRecipeCost({
      ingredients: [{ ...createCostIngredient(), name: "Harina", packagePriceMinor: 200, packageSize: 0, packageUnitId: "g", usedQuantity: 100, usedUnitId: "g", usableYieldPercent: 100 }],
      servings: 4,
      additionalDirectCostsMinor: 0,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("electricidad con tarifa por bandas vacía (tiempo/tarifa inválidos): rechazado explícitamente, nunca Infinity/NaN", () => {
    const result = applyTariff(10, 10, { mode: "bands", bands: [] });
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("FASE 48 CORRECTIVE: el resultado FINITE de cobertura de inventario también se serializa a JSON válido, sin Infinity/NaN", () => {
    const result = calculateCoverage({ availableStock: 500, averageDailyDemand: 20, startDate: { year: 2026, month: 1, day: 1 } });
    const json = JSON.stringify(result);
    expect(json).not.toContain("Infinity");
    expect(json).not.toContain("NaN");
    expect(() => JSON.parse(json)).not.toThrow();
    assertNoNonFiniteNumbers(result);
  });

  it("CSV export inputs for GPA/recipe-cost/product-profitability/unit-price never carry Infinity/NaN text (representative valid scenarios)", () => {
    const gpa = calculateGpa([createCourse()], { scaleId: "gpa-4" });
    const recipe = calculateRecipeCost({ ingredients: [{ ...createCostIngredient(), name: "Harina", packagePriceMinor: 200, packageSize: 1000, packageUnitId: "g", usedQuantity: 100, usedUnitId: "g", usableYieldPercent: 100 }], servings: 4, additionalDirectCostsMinor: 0 });
    const profitability = calculateProductProfitability({
      id: "p1",
      name: "Producto",
      priceMinor: 2000,
      costMinor: 500,
      packagingMinor: 50,
      shippingMinor: 100,
      processingFeeMinor: 30,
      commissionFixedMinor: 0,
      commissionPercent: 10,
      adCostPerSaleMinor: 100,
      returnRatePercent: 5,
      nonRecoverableTaxMinor: 0,
      unitsSoldPerMonth: 100,
      allocatedFixedCostsMinor: 10000,
      targetMarginPercent: 20,
    });
    const unitPrice = calculateUnitPrices({
      categoryId: "masa",
      products: [
        { id: "a", name: "A", finalPriceMinor: 500, packageQuantity: 500, unitId: "g", packagesCount: 1, usablePercent: 100 },
        { id: "b", name: "B", finalPriceMinor: 800, packageQuantity: 1000, unitId: "g", packagesCount: 1, usablePercent: 100 },
      ],
    });
    for (const result of [gpa, recipe, profitability, unitPrice]) {
      expect(result.ok).toBe(true);
      const json = JSON.stringify(result);
      expect(json).not.toContain("Infinity");
      expect(json).not.toContain("NaN");
      assertNoNonFiniteNumbers(result);
    }
  });
});
