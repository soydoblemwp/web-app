import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { mean, median, stddev, percentile, detectOutliersIQR, standardNormalCdf, confidenceIntervalForProportion, twoProportionZTest, twoSampleTTestApprox, recommendedMinimumSampleSize } from "@/lib/performance/statistics";
import { safeRatio, engagementRate, clickThroughRate, conversionRate, contentCompletionRate, approvalRate, automationSuccessRate } from "@/lib/performance/derived-metrics";
import { parseCsv, serializeCsv, neutralizeCsvCell, detectDelimiter } from "@/lib/performance/csv";
import { validateJsonStructure, getValueAtPath, resolveImportRecordsArray } from "@/lib/performance/json-import";
import { computeDataQuality } from "@/lib/performance/data-quality";
import { classifyTrend } from "@/lib/performance/trends";
import { detectValueAnomaly, detectActivityAnomaly } from "@/lib/performance/anomalies";
import { evaluateRules, listRules } from "@/lib/performance/rules";
import { getPeriodBounds, zonedDayKey, bucketByPeriod } from "@/lib/performance/periods";
import { computeMetricIdempotencyKey } from "@/lib/performance/idempotency";
import { PERFORMANCE_METRIC_DEFINITIONS, findMetricDefinition, isCustomMetricKey } from "@/lib/performance/metrics-catalog";
import { PERFORMANCE_ERROR_CODES, PERFORMANCE_ERROR_MESSAGES, performanceError } from "@/lib/performance/types";
import { PERFORMANCE_LIMITS } from "@/lib/performance/limits";
import { manualMetricEntrySchema, createExperimentSchema } from "@/lib/validation/performance";

// ---------------------------------------------------------------------------
// 1. Statistics — pure, dependency-free
// ---------------------------------------------------------------------------
describe("statistics.ts: pure statistical utilities (spec section 23)", () => {
  it("mean/median/stddev compute correctly on a known dataset", () => {
    const values = [2, 4, 4, 4, 5, 5, 7, 9];
    expect(mean(values)).toBe(5);
    expect(median(values)).toBe(4.5);
    expect(stddev(values)).toBeCloseTo(2.138, 2);
  });

  it("mean/median/stddev return null for empty/insufficient input — never NaN", () => {
    expect(mean([])).toBeNull();
    expect(median([])).toBeNull();
    expect(stddev([1])).toBeNull();
  });

  it("percentile interpolates correctly", () => {
    const values = [10, 20, 30, 40];
    expect(percentile(values, 50)).toBeCloseTo(25, 5);
    expect(percentile(values, 0)).toBe(10);
    expect(percentile(values, 100)).toBe(40);
  });

  it("detectOutliersIQR flags a clear outlier and requires at least 4 points", () => {
    expect(detectOutliersIQR([1, 2, 3])).toBeNull();
    const result = detectOutliersIQR([10, 12, 11, 13, 12, 100]);
    expect(result).not.toBeNull();
    expect(result!.outlierIndices).toContain(5);
  });

  it("standardNormalCdf matches known reference values", () => {
    expect(standardNormalCdf(0)).toBeCloseTo(0.5, 3);
    expect(standardNormalCdf(1.96)).toBeCloseTo(0.975, 2);
    expect(standardNormalCdf(-1.96)).toBeCloseTo(0.025, 2);
  });

  it("confidenceIntervalForProportion returns a sane bounded interval", () => {
    const interval = confidenceIntervalForProportion(50, 100);
    expect(interval).not.toBeNull();
    expect(interval!.proportion).toBe(0.5);
    expect(interval!.lowerBound).toBeGreaterThanOrEqual(0);
    expect(interval!.upperBound).toBeLessThanOrEqual(1);
  });

  it("confidenceIntervalForProportion returns null for zero total", () => {
    expect(confidenceIntervalForProportion(0, 0)).toBeNull();
  });

  it("twoProportionZTest detects a significant difference with large, clearly different samples", () => {
    const result = twoProportionZTest(100, 1000, 200, 1000);
    expect(result).not.toBeNull();
    expect(result!.significantAt95).toBe(true);
    expect(result!.pValue).toBeLessThan(0.05);
  });

  it("twoProportionZTest does NOT declare significance for near-identical small samples", () => {
    const result = twoProportionZTest(5, 10, 6, 10);
    expect(result).not.toBeNull();
    expect(result!.significantAt95).toBe(false);
  });

  it("twoSampleTTestApprox returns null when a sample has fewer than 2 points", () => {
    expect(twoSampleTTestApprox([1], [1, 2, 3])).toBeNull();
  });

  it("twoSampleTTestApprox detects a clear difference between two well-separated samples", () => {
    const result = twoSampleTTestApprox([10, 11, 9, 10, 12, 11, 10, 9, 10, 11], [20, 21, 19, 20, 22, 21, 20, 19, 20, 21]);
    expect(result).not.toBeNull();
    expect(result!.significantAt95).toBe(true);
  });

  it("recommendedMinimumSampleSize returns a sane positive integer for a realistic scenario", () => {
    const n = recommendedMinimumSampleSize(0.1, 0.05);
    expect(n).not.toBeNull();
    expect(n!).toBeGreaterThan(0);
  });

  it("recommendedMinimumSampleSize returns null for invalid rates", () => {
    expect(recommendedMinimumSampleSize(0, 0.05)).toBeNull();
    expect(recommendedMinimumSampleSize(1, 0.05)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. Derived metrics — safe division, never Infinity/NaN
// ---------------------------------------------------------------------------
describe("derived-metrics.ts: safe formulas with an explicit denominator (spec section 9)", () => {
  it("safeRatio computes a percentage correctly", () => {
    const result = safeRatio(25, 100);
    expect(result.value).toBe(25);
    expect(result.numerator).toBe(25);
    expect(result.denominator).toBe(100);
  });

  it("safeRatio never returns Infinity or NaN on division by zero", () => {
    const result = safeRatio(10, 0);
    expect(result.value).toBeNull();
    expect(Number.isFinite(result.value ?? 0)).toBe(true);
  });

  it("safeRatio handles non-finite inputs safely", () => {
    expect(safeRatio(Number.NaN, 10).value).toBeNull();
    expect(safeRatio(10, Number.POSITIVE_INFINITY).value).toBeNull();
  });

  it("engagementRate/clickThroughRate/conversionRate/contentCompletionRate/approvalRate/automationSuccessRate all apply safeRatio", () => {
    expect(engagementRate(50, 1000).value).toBe(5);
    expect(clickThroughRate(10, 200).value).toBe(5);
    expect(conversionRate(2, 10).value).toBe(20);
    expect(contentCompletionRate(3, 5).value).toBe(60);
    expect(approvalRate(8, 10).value).toBe(80);
    expect(automationSuccessRate(9, 10).value).toBe(90);
  });
});

// ---------------------------------------------------------------------------
// 3. CSV — safe parsing/serialization, formula injection protection
// ---------------------------------------------------------------------------
describe("csv.ts: safe CSV parsing/serialization (spec sections 12/42)", () => {
  it("parses a simple CSV with headers", () => {
    const { headers, rows } = parseCsv("name,value\nfoo,1\nbar,2");
    expect(headers).toEqual(["name", "value"]);
    expect(rows).toEqual([["foo", "1"], ["bar", "2"]]);
  });

  it("handles quoted fields with embedded commas and escaped quotes", () => {
    const { headers, rows } = parseCsv('name,note\n"Smith, John","He said ""hi"""');
    expect(headers).toEqual(["name", "note"]);
    expect(rows[0]).toEqual(["Smith, John", 'He said "hi"']);
  });

  it("handles embedded newlines inside quoted fields", () => {
    const { rows } = parseCsv('col\n"line1\nline2"');
    expect(rows[0]).toEqual(["line1\nline2"]);
  });

  it("supports a custom (semicolon) delimiter", () => {
    const { headers, rows } = parseCsv("a;b\n1;2", ";");
    expect(headers).toEqual(["a", "b"]);
    expect(rows).toEqual([["1", "2"]]);
  });

  it("detectDelimiter picks the most frequent candidate", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
  });

  it("never evaluates a cell that looks like a formula — parsing returns it as an inert string", () => {
    const { rows } = parseCsv("formula\n=1+1");
    expect(rows[0][0]).toBe("=1+1");
  });

  it("neutralizeCsvCell prefixes dangerous leading characters on export (CSV/formula injection protection)", () => {
    expect(neutralizeCsvCell("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(neutralizeCsvCell("+1+1")).toBe("'+1+1");
    expect(neutralizeCsvCell("@cmd")).toBe("'@cmd");
    expect(neutralizeCsvCell("normal text")).toBe("normal text");
  });

  it("serializeCsv round-trips through parseCsv and neutralizes dangerous cells", () => {
    const csv = serializeCsv(["name", "formula"], [["foo", "=cmd|calc"]]);
    expect(csv).toContain("'=cmd|calc");
    const parsed = parseCsv(csv);
    expect(parsed.rows[0][1]).toBe("'=cmd|calc");
  });
});

// ---------------------------------------------------------------------------
// 4. JSON import safety — prototype pollution, depth/size limits
// ---------------------------------------------------------------------------
describe("json-import.ts: safe JSON validation (spec section 13)", () => {
  it("accepts a normal, shallow object", () => {
    expect(validateJsonStructure({ a: 1, b: "text" }, 8, 1000).valid).toBe(true);
  });

  it("rejects __proto__/constructor/prototype keys anywhere in the structure", () => {
    // JSON.parse (not an object literal, where `__proto__: ...` sets the prototype instead of an own key) is how a real attacker-supplied payload would actually produce an own "__proto__" property.
    expect(validateJsonStructure(JSON.parse('{"__proto__": {"polluted": true}}'), 8, 1000).valid).toBe(false);
    expect(validateJsonStructure({ a: { constructor: {} } }, 8, 1000).valid).toBe(false);
    expect(validateJsonStructure([{ prototype: 1 }], 8, 1000).valid).toBe(false);
  });

  it("rejects structures deeper than the configured max depth", () => {
    const deep = { a: { b: { c: { d: { e: 1 } } } } };
    expect(validateJsonStructure(deep, 2, 1000).valid).toBe(false);
    expect(validateJsonStructure(deep, 10, 1000).valid).toBe(true);
  });

  it("rejects strings longer than the configured max length", () => {
    expect(validateJsonStructure({ a: "x".repeat(2000) }, 8, 100).valid).toBe(false);
  });

  it("getValueAtPath resolves a dotted path and rejects dangerous segments defensively", () => {
    expect(getValueAtPath({ metrics: { likes: 5 } }, "metrics.likes")).toBe(5);
    expect(getValueAtPath({ a: 1 }, "__proto__")).toBeUndefined();
  });

  it("resolveImportRecordsArray finds a root array or a named container property", () => {
    expect(resolveImportRecordsArray([1, 2, 3])).toEqual([1, 2, 3]);
    expect(resolveImportRecordsArray({ data: { items: [1, 2] } }, "data.items")).toEqual([1, 2]);
    expect(resolveImportRecordsArray({ data: "not an array" }, "data")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. Data quality — deterministic scoring
// ---------------------------------------------------------------------------
describe("data-quality.ts: deterministic data-quality scoring (spec section 16)", () => {
  it("scores INSUFFICIENT when there is no data at all", () => {
    const result = computeDataQuality({ expectedPoints: 30, actualPoints: 0, daysSinceLastUpdate: 999, duplicateCount: 0, conflictCount: 0, missingValueCount: 0, totalValueCount: 0, granularityConsistent: true, longestGapRatio: 1 });
    expect(result.level).toBe("INSUFFICIENT");
    expect(result.score).toBe(0);
  });

  it("scores EXCELLENT for full coverage, recent, consistent, complete, non-duplicated data", () => {
    const result = computeDataQuality({ expectedPoints: 30, actualPoints: 30, daysSinceLastUpdate: 0, duplicateCount: 0, conflictCount: 0, missingValueCount: 0, totalValueCount: 30, granularityConsistent: true, longestGapRatio: 0 });
    expect(result.level).toBe("EXCELLENT");
  });

  it("is deterministic — identical input always produces identical output", () => {
    const input = { expectedPoints: 30, actualPoints: 15, daysSinceLastUpdate: 3, duplicateCount: 2, conflictCount: 1, missingValueCount: 4, totalValueCount: 20, granularityConsistent: true, longestGapRatio: 0.2 };
    const a = computeDataQuality(input);
    const b = computeDataQuality(input);
    expect(a).toEqual(b);
  });

  it("surfaces warnings for low coverage, staleness, and duplicates", () => {
    const result = computeDataQuality({ expectedPoints: 30, actualPoints: 5, daysSinceLastUpdate: 20, duplicateCount: 3, conflictCount: 0, missingValueCount: 0, totalValueCount: 5, granularityConsistent: true, longestGapRatio: 0.1 });
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Trends — never classified from a single point
// ---------------------------------------------------------------------------
describe("trends.ts: deterministic trend classification (spec section 38)", () => {
  it("returns INSUFFICIENT_DATA for fewer than the configured minimum points", () => {
    const result = classifyTrend([{ date: new Date("2026-01-01"), value: 10 }]);
    expect(result.direction).toBe("INSUFFICIENT_DATA");
  });

  it("classifies a clearly rising series as RISING", () => {
    const points = [1, 2, 3, 4, 5, 6].map((i) => ({ date: new Date(2026, 0, i), value: i * 10 }));
    expect(classifyTrend(points).direction).toBe("RISING");
  });

  it("classifies a clearly falling series as FALLING", () => {
    const points = [1, 2, 3, 4, 5, 6].map((i) => ({ date: new Date(2026, 0, i), value: 100 - i * 10 }));
    expect(classifyTrend(points).direction).toBe("FALLING");
  });

  it("classifies a flat series as STABLE", () => {
    const points = [1, 2, 3, 4, 5].map((i) => ({ date: new Date(2026, 0, i), value: 50 }));
    expect(classifyTrend(points).direction).toBe("STABLE");
  });

  it("classifies a wildly oscillating series as VOLATILE, not RISING/FALLING", () => {
    const values = [10, 90, 5, 95, 8, 100];
    const points = values.map((v, i) => ({ date: new Date(2026, 0, i + 1), value: v }));
    expect(classifyTrend(points).direction).toBe("VOLATILE");
  });
});

// ---------------------------------------------------------------------------
// 7. Anomalies — transparent, never AI-based
// ---------------------------------------------------------------------------
describe("anomalies.ts: deterministic anomaly detection (spec section 39)", () => {
  it("requires a minimum history before flagging anything", () => {
    expect(detectValueAnomaly([10, 11], 500)).toBeNull();
  });

  it("flags a clear statistical outlier via STDDEV", () => {
    const history = [10, 11, 9, 10, 12, 11, 10, 9];
    const result = detectValueAnomaly(history, 100);
    expect(result).not.toBeNull();
    expect(result!.isAnomaly).toBe(true);
  });

  it("does not flag a value consistent with history", () => {
    const history = [10, 11, 9, 10, 12, 11, 10, 9];
    expect(detectValueAnomaly(history, 10.5)).toBeNull();
  });

  it("detectActivityAnomaly flags MISSING_DATA when activity drops to zero from a healthy baseline", () => {
    const result = detectActivityAnomaly(20, 0);
    expect(result).not.toBeNull();
    expect(result!.method).toBe("MISSING_DATA");
  });

  it("detectActivityAnomaly flags ACTIVITY_SPIKE for an unusual volume increase", () => {
    const result = detectActivityAnomaly(10, 40);
    expect(result).not.toBeNull();
    expect(result!.method).toBe("ACTIVITY_SPIKE");
  });

  it("detectActivityAnomaly does not flag normal variation", () => {
    expect(detectActivityAnomaly(10, 11)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 8. Deterministic rules registry
// ---------------------------------------------------------------------------
describe("rules.ts: central deterministic recommendation rules (spec section 26)", () => {
  it("has every rule the spec names, each declaring key/condition/severity/compatible actions/resources", () => {
    const rules = listRules();
    expect(rules.length).toBeGreaterThanOrEqual(17);
    for (const rule of rules) {
      expect(rule.key).toBeTruthy();
      expect(rule.severity).toBeTruthy();
      expect(rule.compatibleActions.length).toBeGreaterThan(0);
      expect(rule.compatibleResourceTypes.length).toBeGreaterThan(0);
    }
  });

  it("evaluateRules only returns rules whose condition genuinely matches the given facts", () => {
    const matches = evaluateRules("CONTENT_ITEM", { versionsCount: 10, seoScore: 90, hasCta: true, hasBrandProfile: true });
    expect(matches.some((m) => m.ruleKey === "content_many_revisions")).toBe(true);
    expect(matches.some((m) => m.ruleKey === "content_low_seo")).toBe(false);
    expect(matches.some((m) => m.ruleKey === "content_missing_cta")).toBe(false);
  });

  it("never fabricates a match when the needed fact is undefined", () => {
    const matches = evaluateRules("CONTENT_ITEM", {});
    expect(matches).toEqual([]);
  });

  it("rule messages are specific, not generic boilerplate", () => {
    const matches = evaluateRules("CONTENT_ITEM", { seoScore: 20 });
    const seoMatch = matches.find((m) => m.ruleKey === "content_low_seo");
    expect(seoMatch?.message).toMatch(/20/);
    expect(seoMatch?.message).not.toBe("Mejora tu contenido");
  });
});

// ---------------------------------------------------------------------------
// 9. Periods — timezone-aware, DST-safe (reuses Automation Center's engine)
// ---------------------------------------------------------------------------
describe("periods.ts: timezone-aware period bounds (spec section 10)", () => {
  it("getPeriodBounds for DAY returns the local calendar day, not the UTC day", () => {
    // 2026-06-15 23:30 in America/Los_Angeles is still 2026-06-15 locally, but 2026-06-16 in UTC.
    const reference = new Date("2026-06-16T06:30:00.000Z");
    const bounds = getPeriodBounds("DAY", reference, "America/Los_Angeles");
    expect(bounds).not.toBeNull();
    expect(zonedDayKey(bounds!.start, "America/Los_Angeles")).toBe("2026-06-15");
  });

  it("getPeriodBounds for MONTH spans the whole calendar month", () => {
    const bounds = getPeriodBounds("MONTH", new Date("2026-02-15T12:00:00.000Z"), "UTC");
    expect(bounds).not.toBeNull();
    expect(zonedDayKey(bounds!.start, "UTC")).toBe("2026-02-01");
  });

  it("getPeriodBounds returns null for CAMPAIGN/EXPERIMENT/CUSTOM_RANGE (caller must supply explicit bounds)", () => {
    expect(getPeriodBounds("CAMPAIGN", new Date(), "UTC")).toBeNull();
    expect(getPeriodBounds("CUSTOM_RANGE", new Date(), "UTC")).toBeNull();
  });

  it("bucketByPeriod groups points into the correct local-day buckets and sums values", () => {
    const points = [
      { date: new Date("2026-01-01T10:00:00.000Z"), value: 5 },
      { date: new Date("2026-01-01T20:00:00.000Z"), value: 3 },
      { date: new Date("2026-01-02T10:00:00.000Z"), value: 7 },
    ];
    const buckets = bucketByPeriod(points, "DAY", "UTC");
    expect(buckets).toHaveLength(2);
    expect(buckets[0].value).toBe(8);
    expect(buckets[1].value).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// 10. Idempotency keys
// ---------------------------------------------------------------------------
describe("idempotency.ts: stable dedup keys (spec sections 15/46)", () => {
  it("produces the exact same key for identical input", () => {
    const input = {
      projectId: "proj1",
      resourceType: "SOCIAL_POST" as const,
      resourceId: "post1",
      platform: "instagram",
      metricKey: "likes",
      measuredAt: new Date("2026-01-01T00:00:00Z"),
      periodStart: new Date("2026-01-01T00:00:00Z"),
      periodEnd: new Date("2026-01-01T23:59:59Z"),
      externalReference: null,
      source: "MANUAL" as const,
    };
    expect(computeMetricIdempotencyKey(input)).toBe(computeMetricIdempotencyKey(input));
  });

  it("produces different keys when any component differs", () => {
    const base = {
      projectId: "proj1",
      resourceType: "SOCIAL_POST" as const,
      resourceId: "post1",
      platform: "instagram",
      metricKey: "likes",
      measuredAt: new Date("2026-01-01T00:00:00Z"),
      periodStart: new Date("2026-01-01T00:00:00Z"),
      periodEnd: new Date("2026-01-01T23:59:59Z"),
      externalReference: null,
      source: "MANUAL" as const,
    };
    const changed = { ...base, metricKey: "views" };
    expect(computeMetricIdempotencyKey(base)).not.toBe(computeMetricIdempotencyKey(changed));
  });
});

// ---------------------------------------------------------------------------
// 11. Metric catalog — no arbitrary keys, custom_metric validated
// ---------------------------------------------------------------------------
describe("metrics-catalog.ts: the single source of truth for metric keys (spec section 8)", () => {
  it("every built-in definition declares unit/direction/aggregation/compatible resources", () => {
    expect(PERFORMANCE_METRIC_DEFINITIONS.length).toBeGreaterThan(20);
    for (const def of PERFORMANCE_METRIC_DEFINITIONS) {
      expect(def.unit).toBeTruthy();
      expect(def.direction).toBeTruthy();
      expect(def.aggregation).toBeTruthy();
      expect(def.compatibleResourceTypes.length).toBeGreaterThan(0);
    }
  });

  it("findMetricDefinition resolves a known key and returns undefined for an unknown one", () => {
    expect(findMetricDefinition("engagement_rate")).toBeDefined();
    expect(findMetricDefinition("totally_made_up_key")).toBeUndefined();
  });

  it("derived metrics declare their formula with an explicit numerator/denominator (spec section 9)", () => {
    const derived = PERFORMANCE_METRIC_DEFINITIONS.filter((d) => d.isDerived);
    expect(derived.length).toBeGreaterThan(0);
    for (const def of derived) {
      expect(def.formula).toBeDefined();
      expect(def.formula!.numeratorKey).toBeTruthy();
      expect(def.formula!.denominatorKey).toBeTruthy();
    }
  });

  it("isCustomMetricKey distinguishes project-scoped custom keys from built-ins", () => {
    expect(isCustomMetricKey("custom.my_metric")).toBe(true);
    expect(isCustomMetricKey("engagement_rate")).toBe(false);
  });

  it("external metrics from spec section 7 are all present", () => {
    const keys = PERFORMANCE_METRIC_DEFINITIONS.map((d) => d.key);
    for (const k of ["impressions", "reach", "views", "clicks", "reactions", "likes", "comments", "shares", "saves", "followers_gained", "profile_visits", "link_clicks", "watch_time_seconds", "average_watch_time_seconds", "video_completion_rate", "engagement_rate", "click_through_rate", "conversion_count", "conversion_rate", "revenue_value", "cost_value"]) {
      expect(keys).toContain(k);
    }
  });
});

// ---------------------------------------------------------------------------
// 12. Error codes — exactly the 26 the spec names, with safe UI messages
// ---------------------------------------------------------------------------
describe("types.ts: typed functional error codes (spec section 49)", () => {
  it("has exactly the error codes the spec lists, each with a safe user-facing message", () => {
    expect(PERFORMANCE_ERROR_CODES).toHaveLength(26);
    for (const code of PERFORMANCE_ERROR_CODES) {
      expect(PERFORMANCE_ERROR_MESSAGES[code]).toBeTruthy();
      expect(PERFORMANCE_ERROR_MESSAGES[code]).not.toMatch(/at .*\(.*:\d+:\d+\)/); // never a stack-trace-shaped string
    }
  });

  it("performanceError() returns the typed shape with a safe default message", () => {
    const result = performanceError("INSUFFICIENT_DATA");
    expect(result.code).toBe("INSUFFICIENT_DATA");
    expect(result.error).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 13. Limits — technical only, no commercial framing
// ---------------------------------------------------------------------------
describe("limits.ts: technical-only limits (spec section 51)", () => {
  it("every limit is a positive, finite number", () => {
    for (const [key, value] of Object.entries(PERFORMANCE_LIMITS)) {
      expect(Number.isFinite(value), `${key} should be finite`).toBe(true);
      expect(value, `${key} should be positive`).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 14. Validation schemas — reject invalid input safely
// ---------------------------------------------------------------------------
describe("validation/performance.ts: zod schemas reject invalid input", () => {
  it("manualMetricEntrySchema rejects a non-finite value", () => {
    const result = manualMetricEntrySchema.safeParse({
      resourceType: "SOCIAL_POST",
      metricKey: "likes",
      value: Number.NaN,
      measuredAt: "2026-01-01T00:00:00Z",
      periodStart: "2026-01-01T00:00:00Z",
      periodEnd: "2026-01-01T23:59:59Z",
    });
    expect(result.success).toBe(false);
  });

  it("manualMetricEntrySchema accepts a well-formed entry", () => {
    const result = manualMetricEntrySchema.safeParse({
      resourceType: "SOCIAL_POST",
      socialPostId: "clabcdefghijklmnopqrstuv",
      metricKey: "likes",
      value: 42,
      measuredAt: "2026-01-01T00:00:00Z",
      periodStart: "2026-01-01T00:00:00Z",
      periodEnd: "2026-01-01T23:59:59Z",
    });
    expect(result.success).toBe(true);
  });

  it("createExperimentSchema requires a non-empty hypothesis", () => {
    const result = createExperimentSchema.safeParse({
      name: "Test",
      hypothesis: "",
      type: "TITLE",
      primaryMetricKey: "engagement_rate",
      resourceType: "CONTENT_ITEM",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 15. Security — every Performance server action enforces requireProjectAccess
// ---------------------------------------------------------------------------
const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

describe("security: every Performance Intelligence server action enforces requireProjectAccess before touching data", () => {
  const actionFiles = [
    "src/server/actions/performance-metrics.ts",
    "src/server/actions/performance-imports.ts",
    "src/server/actions/performance-goals.ts",
    "src/server/actions/performance-experiments.ts",
    "src/server/actions/performance-recommendations.ts",
    "src/server/actions/performance-anomalies.ts",
    "src/server/actions/performance-reports.ts",
    "src/server/actions/performance-comparisons.ts",
    "src/server/actions/performance-select.ts",
    "src/server/actions/performance-marketing-brain-context.ts",
  ];

  // listMetricCatalogAction is a pure, project-agnostic catalog lookup — it takes no projectId at all (like the automation event/trigger registries).
  const EXEMPT_FUNCTIONS = new Set(["listMetricCatalogAction"]);

  for (const file of actionFiles) {
    it(`every exported async function in ${file} calls requireProjectAccess (directly or via a same-file helper that does)`, () => {
      const source = read(file);
      const functionMatches = source.match(/export async function (\w+)\([\s\S]*?\n\}/g) ?? [];
      expect(functionMatches.length).toBeGreaterThan(0);
      for (const body of functionMatches) {
        const name = body.match(/export async function (\w+)\(/)![1];
        if (EXEMPT_FUNCTIONS.has(name)) continue;
        expect(body, `${name} in ${file} should call requireProjectAccess`).toMatch(/requireProjectAccess/);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 16. UI hygiene — no alert()/confirm() anywhere in the new Performance UI
// ---------------------------------------------------------------------------
describe("UI hygiene: no alert()/confirm() in the new Performance Intelligence components", () => {
  it("no component under src/components/performance calls window.alert(...) or window.confirm(...) as real code", () => {
    const dir = path.join(ROOT, "src/components/performance");
    const files = readdirSync(dir).filter((f: string) => f.endsWith(".tsx"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(path.join(dir, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(source).not.toMatch(/\balert\(/);
      expect(source).not.toMatch(/window\.confirm\(/);
    }
  });
});

// ---------------------------------------------------------------------------
// 17. Migration — additive only, exactly one new migration, never DROP TABLE/COLUMN
// ---------------------------------------------------------------------------
describe("migration: additive only, never touches a prior migration or DROP TABLE/COLUMN (spec section 44/55)", () => {
  it("exactly one new migration directory was created for this phase", () => {
    const migrationsDir = path.join(ROOT, "prisma/migrations");
    const dirs = readdirSync(migrationsDir).filter((d: string) => d.includes("performance_center"));
    expect(dirs.length).toBe(1);
  });

  it("the new migration file contains no DROP TABLE/COLUMN statements", () => {
    const migrationsDir = path.join(ROOT, "prisma/migrations");
    const dirs = readdirSync(migrationsDir).filter((d: string) => d.includes("performance_center"));
    const sql = readFileSync(path.join(migrationsDir, dirs[0], "migration.sql"), "utf8");
    expect(sql).not.toMatch(/DROP TABLE/i);
    expect(sql).not.toMatch(/DROP COLUMN/i);
  });
});

// ---------------------------------------------------------------------------
// 18. Legacy coexistence — SocialMetric / CampaignMetricGoal untouched
// ---------------------------------------------------------------------------
describe("out-of-phase legacy systems: SocialMetric and CampaignMetricGoal are left untouched, never replaced", () => {
  it("the legacy SocialMetric and CampaignMetricGoal models still exist in the schema, unmodified in shape", () => {
    const schema = read("prisma/schema.prisma");
    expect(schema).toMatch(/model SocialMetric \{/);
    expect(schema).toMatch(/model CampaignMetricGoal \{/);
  });

  it("no new Performance* model duplicates ContentItem/ContentVersion/Campaign/CampaignContentPiece/SocialPost/AgentRun/WorkflowRun/KnowledgeSource — they're referenced via FKs, never re-declared", () => {
    const schema = read("prisma/schema.prisma");
    expect(schema).not.toMatch(/model PerformanceContentItem/);
    expect(schema).not.toMatch(/model PerformanceCampaign\b/);
    expect(schema).not.toMatch(/model PerformanceSocialPost/);
    expect(schema).not.toMatch(/model PerformanceUser\b/);
    expect(schema).not.toMatch(/model PerformanceProject\b/);
  });
});

// ---------------------------------------------------------------------------
// 19. Event integration — the 12 new event keys are registered and genuinely published
// ---------------------------------------------------------------------------
describe("event integration: the 12 Performance events (spec section 37) are registered and genuinely published at real completion points", () => {
  const eventKeys = [
    "PERFORMANCE_METRIC_CREATED",
    "PERFORMANCE_METRIC_UPDATED",
    "PERFORMANCE_IMPORT_COMPLETED",
    "PERFORMANCE_IMPORT_FAILED",
    "PERFORMANCE_GOAL_REACHED",
    "PERFORMANCE_GOAL_MISSED",
    "PERFORMANCE_ANOMALY_DETECTED",
    "PERFORMANCE_RECOMMENDATION_CREATED",
    "PERFORMANCE_RECOMMENDATION_ACCEPTED",
    "PERFORMANCE_EXPERIMENT_STARTED",
    "PERFORMANCE_EXPERIMENT_COMPLETED",
    "PERFORMANCE_EXPERIMENT_INCONCLUSIVE",
  ];

  it("every event key is registered in AUTOMATION_EVENT_DEFINITIONS", () => {
    const source = read("src/lib/automations/events.ts");
    for (const key of eventKeys) {
      expect(source).toMatch(new RegExp(`key: "${key}"`));
    }
  });

  const wiredFiles: Record<string, string[]> = {
    "src/server/services/performance-metric-records.ts": ["PERFORMANCE_METRIC_CREATED", "PERFORMANCE_METRIC_UPDATED"],
    "src/server/services/performance-imports.ts": ["PERFORMANCE_IMPORT_COMPLETED", "PERFORMANCE_IMPORT_FAILED"],
    "src/server/services/performance-goals.ts": ["PERFORMANCE_GOAL_REACHED", "PERFORMANCE_GOAL_MISSED"],
    "src/server/services/performance-anomalies.ts": ["PERFORMANCE_ANOMALY_DETECTED"],
    "src/server/services/performance-recommendations.ts": ["PERFORMANCE_RECOMMENDATION_CREATED", "PERFORMANCE_RECOMMENDATION_ACCEPTED"],
    "src/server/services/performance-experiments.ts": ["PERFORMANCE_EXPERIMENT_STARTED", "PERFORMANCE_EXPERIMENT_COMPLETED", "PERFORMANCE_EXPERIMENT_INCONCLUSIVE"],
  };

  for (const [file, keys] of Object.entries(wiredFiles)) {
    it(`${file} calls publishAutomationEvent with every declared event key: ${keys.join(", ")}`, () => {
      const source = read(file);
      expect(source).toMatch(/publishAutomationEvent/);
      for (const key of keys) {
        expect(source).toMatch(new RegExp(key));
      }
    });
  }

  it("publishAutomationEvent is called only from the SAME shared outbox helper Automation Center already uses — never a parallel outbox", () => {
    for (const file of Object.keys(wiredFiles)) {
      const source = read(file);
      expect(source).toMatch(/from "@\/server\/services\/automation-events"/);
    }
  });
});

// ---------------------------------------------------------------------------
// 20. Idempotency / concurrency — enforced at the database level
// ---------------------------------------------------------------------------
describe("idempotency and concurrency: enforced via real unique constraints and lock fields, never solely prior-check logic (spec sections 46/47)", () => {
  it("PerformanceMetricRecord.idempotencyKey is unique", () => {
    const schema = read("prisma/schema.prisma");
    const model = schema.match(/model PerformanceMetricRecord \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/idempotencyKey\s+String\s+@unique/);
  });

  it("PerformanceRecommendation.idempotencyKey is unique", () => {
    const schema = read("prisma/schema.prisma");
    const model = schema.match(/model PerformanceRecommendation \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/idempotencyKey\s+String\s+@unique/);
  });

  it("PerformanceAnomaly.idempotencyKey is unique", () => {
    const schema = read("prisma/schema.prisma");
    const model = schema.match(/model PerformanceAnomaly \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/idempotencyKey\s+String\s+@unique/);
  });

  it("PerformanceImport has lockedAt/lockedBy/lockExpiresAt/executionToken fields for atomic claiming", () => {
    const schema = read("prisma/schema.prisma");
    const model = schema.match(/model PerformanceImport \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/lockedAt/);
    expect(model).toMatch(/lockedBy/);
    expect(model).toMatch(/lockExpiresAt/);
    expect(model).toMatch(/executionToken/);
  });

  it("PerformanceImportRow.metricRecordId is unique (a row can only ever produce one metric record)", () => {
    const schema = read("prisma/schema.prisma");
    const model = schema.match(/model PerformanceImportRow \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/metricRecordId\s+String\?\s+@unique/);
  });

  it("processImportStep claims work via updateMany with an expected status + null lock, never a plain read-then-write", () => {
    const source = read("src/server/services/performance-imports.ts");
    expect(source).toMatch(/updateMany\(\{ where: \{ id: importId, status: row\.status, lockedAt: null \}/);
  });

  it("reconcileStaleImportLocks only releases expired locks — never auto-resolves them to a terminal status", () => {
    const source = read("src/server/services/performance-imports.ts");
    const fn = source.match(/export async function reconcileStaleImportLocks[\s\S]*?\n\}/)![0];
    expect(fn).not.toMatch(/status: "(COMPLETED|FAILED)"/);
  });
});

// ---------------------------------------------------------------------------
// 21. No second engine — AI Workflows "performance" step reuses real services
// ---------------------------------------------------------------------------
describe("no second engine: the AI Workflows 'performance' step is read-only and calls the SAME real Performance services, never a parallel implementation", () => {
  it("workflow-resources.ts's performance step resolver dynamically imports the real services, never re-implements metric computation", () => {
    const source = read("src/server/services/workflow-resources.ts");
    expect(source).toMatch(/case "performance"/);
    expect(source).toMatch(/getInternalMetricsSnapshot/);
  });

  it("the workflow engine's performance step type has no write/registration operation — only query/compare/recommend/experiment_result", () => {
    const source = read("src/lib/ai-workflows/engine.ts");
    expect(source).not.toMatch(/performance-register-metric/);
    expect(source).not.toMatch(/"register"/);
  });
});

// ---------------------------------------------------------------------------
// 22. Navigation — Performance Intelligence is authenticated-only, never guest
// ---------------------------------------------------------------------------
describe("navigation: Performance Intelligence is added to the authenticated project nav only, never guest mode (spec section 4)", () => {
  it("projectNavGroups includes a Performance Intelligence entry pointing at the 'performance' segment", () => {
    const source = read("src/lib/navigation.ts");
    expect(source).toMatch(/segment: "performance"/);
  });

  it("guestNavGroups has no Performance Intelligence entry", () => {
    const source = read("src/lib/navigation.ts");
    const guestSection = source.slice(source.indexOf("export const guestNavGroups"));
    expect(guestSection).not.toMatch(/Performance Intelligence/);
  });
});

// ---------------------------------------------------------------------------
// 23. Error codes catalog matches spec section 49 exactly
// ---------------------------------------------------------------------------
describe("error codes: exactly the 26 named in spec section 49", () => {
  it("PERFORMANCE_ERROR_CODES contains every named code", () => {
    const expectedCodes = [
      "PERFORMANCE_RESOURCE_NOT_FOUND",
      "METRIC_DEFINITION_NOT_FOUND",
      "METRIC_INVALID",
      "METRIC_DUPLICATE",
      "METRIC_INCOMPATIBLE",
      "METRIC_PERIOD_INVALID",
      "METRIC_VALUE_INVALID",
      "IMPORT_FILE_INVALID",
      "IMPORT_MAPPING_INVALID",
      "IMPORT_ROW_INVALID",
      "IMPORT_CONFLICT",
      "IMPORT_PROCESSING_CONFLICT",
      "INSUFFICIENT_DATA",
      "DATA_QUALITY_TOO_LOW",
      "COMPARISON_INCOMPATIBLE",
      "EXPERIMENT_INVALID",
      "EXPERIMENT_NOT_READY",
      "EXPERIMENT_INSUFFICIENT_SAMPLE",
      "EXPERIMENT_ALREADY_COMPLETED",
      "RECOMMENDATION_NOT_FOUND",
      "RECOMMENDATION_ALREADY_APPLIED",
      "ANOMALY_NOT_FOUND",
      "REPORT_GENERATION_FAILED",
      "LOCK_CONFLICT",
      "PERMISSION_DENIED",
      "INTERNAL_SAFE_ERROR",
    ];
    expect(expectedCodes).toHaveLength(26);
    for (const code of expectedCodes) {
      expect(PERFORMANCE_ERROR_CODES).toContain(code);
    }
  });
});
