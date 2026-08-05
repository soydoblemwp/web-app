import { describe, expect, it } from "vitest";
import { calculateEngagement, ENGAGEMENT_METHODS, ENGAGEMENT_PLATFORMS } from "@/lib/public-tools/engagement";

// ---------------------------------------------------------------------------
// Calculadora de engagement (Fase 41 correction, spec section 6)
// ---------------------------------------------------------------------------
describe("engagement.ts: calculateEngagement", () => {
  it("has all 6 required platforms", () => {
    const ids = ENGAGEMENT_PLATFORMS.map((p) => p.id);
    for (const expected of ["instagram", "tiktok", "facebook", "youtube", "linkedin", "x"]) expect(ids).toContain(expected);
  });

  it("has all 4 required methods", () => {
    const ids = ENGAGEMENT_METHODS.map((m) => m.id);
    for (const expected of ["followers", "reach", "impressions", "views"]) expect(ids).toContain(expected);
  });

  it("calculates the rate by followers correctly", () => {
    const result = calculateEngagement("followers", { followers: 1000, likes: 80, comments: 15, shares: 5 });
    expect(result.ok).toBe(true);
    expect(result.ratePercent).toBeCloseTo(10, 5);
  });

  it("calculates the rate by reach correctly", () => {
    const result = calculateEngagement("reach", { reach: 2000, likes: 100, saves: 100 });
    expect(result.ok).toBe(true);
    expect(result.ratePercent).toBeCloseTo(10, 5);
  });

  it("calculates the rate by impressions correctly", () => {
    const result = calculateEngagement("impressions", { impressions: 5000, likes: 250 });
    expect(result.ok).toBe(true);
    expect(result.ratePercent).toBeCloseTo(5, 5);
  });

  it("calculates the rate by views correctly", () => {
    const result = calculateEngagement("views", { views: 10000, likes: 500, comments: 500 });
    expect(result.ok).toBe(true);
    expect(result.ratePercent).toBeCloseTo(10, 5);
  });

  it("prevents division by zero when the denominator is 0", () => {
    const result = calculateEngagement("followers", { followers: 0, likes: 10 });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/mayor que cero/);
  });

  it("prevents division by zero when the denominator is missing entirely", () => {
    const result = calculateEngagement("reach", { likes: 10 });
    expect(result.ok).toBe(false);
  });

  it("rejects negative values", () => {
    const result = calculateEngagement("followers", { followers: 1000, likes: -5 });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/negativo/);
  });

  it("rejects a negative denominator", () => {
    const result = calculateEngagement("followers", { followers: -100, likes: 5 });
    expect(result.ok).toBe(false);
  });

  it("accepts decimal values", () => {
    const result = calculateEngagement("followers", { followers: 1000.5, likes: 50.25 });
    expect(result.ok).toBe(true);
    expect(result.ratePercent).toBeGreaterThan(0);
  });

  it("treats missing optional engagement fields as zero rather than throwing", () => {
    const result = calculateEngagement("followers", { followers: 1000 });
    expect(result.ok).toBe(true);
    expect(result.ratePercent).toBe(0);
  });

  it("always returns the formula used", () => {
    const result = calculateEngagement("views", { views: 1000, likes: 10 });
    expect(result.formula).toMatch(/visualizaciones/);
  });

  it("sums likes, comments, shares, saves and clicks together as the engagement actions", () => {
    const result = calculateEngagement("followers", { followers: 100, likes: 1, comments: 2, shares: 3, saves: 4, clicks: 5 });
    expect(result.engagementActions).toBe(15);
  });

  it("rejects a non-finite value (e.g. NaN from a malformed input)", () => {
    const result = calculateEngagement("followers", { followers: 1000, likes: Number.NaN });
    expect(result.ok).toBe(false);
  });
});
