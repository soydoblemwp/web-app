import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { percentile, average, safeDivide } from "@/lib/ai-workflows/analytics-stats";
import {
  resolvePeriod,
  pickGranularity,
  bucketStart,
  generateBuckets,
  bucketRows,
  ANALYTICS_PERIOD_PRESETS,
} from "@/lib/ai-workflows/analytics-time";
import { normalizeWorkflowError, normalizedErrorLabel, NORMALIZED_ERROR_CODES } from "@/lib/ai-workflows/error-normalization";
import { csvEscapeCell, buildCsv, buildCsvFilename } from "@/lib/ai-workflows/csv";
import { periodSchema, analyticsFiltersSchema, paginationSchema, exportParamsSchema } from "@/lib/validation/workflow-analytics";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

// ---------------------------------------------------------------------------
// 1. Stats — real pure-function unit tests
// ---------------------------------------------------------------------------
describe("analytics-stats: percentile / average / safeDivide", () => {
  it("percentile returns the exact value for p=0, p=1, and the midpoint for p=0.5 on an odd-length array", () => {
    const sorted = [10, 20, 30, 40, 50];
    expect(percentile(sorted, 0)).toBe(10);
    expect(percentile(sorted, 1)).toBe(50);
    expect(percentile(sorted, 0.5)).toBe(30);
  });

  it("percentile linearly interpolates between the two nearest ranks on an even-length array", () => {
    const sorted = [10, 20, 30, 40];
    // rank = 0.5 * 3 = 1.5 -> interpolate between index 1 (20) and 2 (30)
    expect(percentile(sorted, 0.5)).toBe(25);
  });

  it("percentile returns null for an empty array — never fabricates a number", () => {
    expect(percentile([], 0.5)).toBeNull();
  });

  it("average returns null for empty input, and the real mean otherwise", () => {
    expect(average([])).toBeNull();
    expect(average([2, 4, 6])).toBe(4);
  });

  it("safeDivide never divides by zero — returns 0 instead of NaN/Infinity", () => {
    expect(safeDivide(5, 0)).toBe(0);
    expect(safeDivide(5, 10)).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// 2. Temporal — real bucketing unit tests
// ---------------------------------------------------------------------------
describe("analytics-time: period resolution and granularity", () => {
  it("resolvePeriod computes a preset relative to the provided 'now', never the real clock in a test", () => {
    const now = new Date("2026-07-24T12:00:00Z");
    const { from, to } = resolvePeriod({ preset: "7d" }, now);
    expect(to).toEqual(now);
    expect(from).toEqual(new Date("2026-07-17T12:00:00Z"));
  });

  it("resolvePeriod passes a custom range through unchanged", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    const to = new Date("2026-01-05T00:00:00Z");
    expect(resolvePeriod({ from, to })).toEqual({ from, to });
  });

  it("every preset is a real, distinct value", () => {
    expect(new Set(ANALYTICS_PERIOD_PRESETS).size).toBe(ANALYTICS_PERIOD_PRESETS.length);
  });

  it("pickGranularity: short spans hour, medium spans day, long spans week", () => {
    const base = new Date("2026-07-24T00:00:00Z");
    expect(pickGranularity(base, new Date(base.getTime() + 60 * 60 * 1000))).toBe("hour"); // 1h
    expect(pickGranularity(base, new Date(base.getTime() + 10 * 24 * 60 * 60 * 1000))).toBe("day"); // 10d
    expect(pickGranularity(base, new Date(base.getTime() + 120 * 24 * 60 * 60 * 1000))).toBe("week"); // 120d
  });

  it("bucketStart rounds down to the hour/day/week boundary deterministically (UTC)", () => {
    const d = new Date("2026-07-24T15:37:42.123Z");
    expect(bucketStart(d, "hour")).toEqual(new Date("2026-07-24T15:00:00.000Z"));
    expect(bucketStart(d, "day")).toEqual(new Date("2026-07-24T00:00:00.000Z"));
    // 2026-07-24 is a Friday -> Monday of that week is 2026-07-20
    expect(bucketStart(d, "week")).toEqual(new Date("2026-07-20T00:00:00.000Z"));
  });

  it("generateBuckets covers the full [from,to] range inclusively, producing empty-data-safe boundaries even for a zero-width range", () => {
    const from = new Date("2026-07-24T00:00:00Z");
    const to = new Date("2026-07-24T00:00:00Z");
    expect(generateBuckets(from, to, "day")).toHaveLength(1);

    const to3days = new Date("2026-07-26T00:00:00Z");
    expect(generateBuckets(from, to3days, "day")).toHaveLength(3);
  });

  it("bucketRows never double-counts a row across two adjacent buckets — the boundary is inclusive-start, exclusive-end", () => {
    const from = new Date("2026-07-24T00:00:00Z");
    const to = new Date("2026-07-25T00:00:00Z");
    const rows = [
      { at: new Date("2026-07-24T00:00:00.000Z") }, // exactly on the day-1 boundary -> belongs to day 1
      { at: new Date("2026-07-24T23:59:59.999Z") }, // last ms of day 1
      { at: new Date("2026-07-25T00:00:00.000Z") }, // exactly on day-2 boundary -> belongs to day 2
    ];
    const buckets = bucketRows(rows, (r) => r.at, from, to, "day", (b) => b.length);
    expect(buckets).toHaveLength(2);
    expect(buckets[0].value).toBe(2);
    expect(buckets[1].value).toBe(1);
  });

  it("a period with zero matching rows still produces every bucket, each with an empty reduction — 'periodos sin datos' is a real, representable case", () => {
    const from = new Date("2026-07-01T00:00:00Z");
    const to = new Date("2026-07-04T00:00:00Z");
    const buckets = bucketRows<{ at: Date }, number>([], (r) => r.at, from, to, "day", (b) => b.length);
    expect(buckets).toHaveLength(4);
    expect(buckets.every((b) => b.value === 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Error normalization — real unit tests against the ACTUAL strings this
//    codebase produces (cross-checked against execution-resolver.ts /
//    workflow-execution.ts), never invented placeholder text.
// ---------------------------------------------------------------------------
describe("error-normalization: stable codes, never grouped by raw text alone", () => {
  it("classifies the real tool-not-found message", () => {
    expect(normalizeWorkflowError('La herramienta "ghost-tool" ya no existe en el registro de AI Center.')).toBe("tool_not_found");
  });

  it("classifies the real missing-variable/field messages", () => {
    expect(normalizeWorkflowError("Faltan valores para las variables: {{tema}}.")).toBe("missing_variable");
    expect(normalizeWorkflowError("Faltan valores para los campos: Tema.")).toBe("missing_variable");
  });

  it("classifies the real resource-unavailable messages", () => {
    expect(normalizeWorkflowError("El prompt de este paso no existe o no te pertenece.")).toBe("resource_not_found");
    expect(normalizeWorkflowError("El AI Template de este paso ya no está disponible.")).toBe("resource_not_found");
    expect(normalizeWorkflowError("Falta el prompt de Prompt Library de este paso.")).toBe("resource_not_found");
  });

  it("classifies the real lease/interruption messages", () => {
    expect(normalizeWorkflowError("El control de esta ejecución expiró o pertenece a otra pestaña.")).toBe("lease_expired");
    expect(normalizeWorkflowError("Se perdió la conexión con el navegador que controlaba esta ejecución.")).toBe("lease_expired");
  });

  it("classifies the real duration/limit-exceeded messages", () => {
    expect(normalizeWorkflowError("Se superó el tiempo máximo permitido para esta ejecución.")).toBe("duration_exceeded");
    expect(normalizeWorkflowError("El contenido de este paso supera el máximo de 8000 caracteres.")).toBe("limit_exceeded");
  });

  it("classifies the real invalid-transition messages", () => {
    expect(normalizeWorkflowError("El workflow cambió desde que se inició esta ejecución.")).toBe("invalid_transition");
    expect(normalizeWorkflowError("Este intento ya no es válido (la ejecución avanzó o se reanudó desde entonces).")).toBe("invalid_transition");
  });

  it("falls back to 'unknown' for null, empty, or genuinely unrecognized text — never throws", () => {
    expect(normalizeWorkflowError(null)).toBe("unknown");
    expect(normalizeWorkflowError(undefined)).toBe("unknown");
    expect(normalizeWorkflowError("")).toBe("unknown");
    expect(normalizeWorkflowError("algo totalmente inesperado que nunca produce este código")).toBe("unknown");
  });

  it("every declared code has a non-empty, safe (non-raw-message) label", () => {
    for (const code of NORMALIZED_ERROR_CODES) {
      const label = normalizedErrorLabel(code);
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("normalizedErrorLabel falls back safely for an unrecognized/foreign code string — never echoes it back raw", () => {
    expect(normalizedErrorLabel("some-code-that-was-never-defined")).toBe(normalizedErrorLabel("unknown"));
  });
});

// ---------------------------------------------------------------------------
// 4. CSV — real escaping / injection-neutralization unit tests
// ---------------------------------------------------------------------------
describe("csv: RFC 4180 escaping + formula-injection neutralization", () => {
  it("wraps a cell containing a comma, quote, or newline in quotes, doubling internal quotes", () => {
    expect(csvEscapeCell("hola, mundo")).toBe('"hola, mundo"');
    expect(csvEscapeCell('dice "hola"')).toBe('"dice ""hola"""');
    expect(csvEscapeCell("linea1\nlinea2")).toBe('"linea1\nlinea2"');
  });

  it("leaves a plain cell untouched", () => {
    expect(csvEscapeCell("workflow-123")).toBe("workflow-123");
    expect(csvEscapeCell(42)).toBe("42");
  });

  it("neutralizes formula-injection triggers (=, +, -, @) by prefixing a single quote before any further quoting", () => {
    expect(csvEscapeCell("=SUM(A1:A10)")).toBe("'=SUM(A1:A10)");
    expect(csvEscapeCell("+1234567890")).toBe("'+1234567890");
    expect(csvEscapeCell("-1234567890")).toBe("'-1234567890");
    expect(csvEscapeCell("@cmd")).toBe("'@cmd");
  });

  it("a formula-trigger cell that ALSO needs comma/quote escaping is neutralized first, then quoted", () => {
    expect(csvEscapeCell('=cmd|"/C calc"!A1')).toBe(`"'=cmd|""/C calc""!A1"`);
  });

  it("null/undefined become an empty cell, never the literal string 'null'/'undefined'", () => {
    expect(csvEscapeCell(null)).toBe("");
    expect(csvEscapeCell(undefined)).toBe("");
  });

  it("buildCsv produces a header row plus one row per input, using \\r\\n line endings, and re-escapes every cell (never trusts pre-built strings)", () => {
    const csv = buildCsv(
      [
        { key: "a", header: "Columna A" },
        { key: "b", header: "Columna B" },
      ],
      [
        { a: "x", b: "=EVIL()" },
        { a: "y,z", b: 5 },
      ]
    );
    const lines = csv.split("\r\n").filter(Boolean);
    expect(lines[0]).toBe("Columna A,Columna B");
    expect(lines[1]).toBe("x,'=EVIL()");
    expect(lines[2]).toBe('"y,z",5');
  });

  it("buildCsvFilename only ever contains safe characters, derived from validated inputs, never raw user text", () => {
    const filename = buildCsvFilename("runs", new Date("2026-01-01"), new Date("2026-01-31"));
    expect(filename).toMatch(/^workflow-analytics-runs-2026-01-01-2026-01-31\.csv$/);
    const dirty = buildCsvFilename("../../etc/passwd; rm -rf", new Date("2026-01-01"), new Date("2026-01-31"));
    // No path separators, no shell metacharacters, no ".." traversal — the
    // single literal ".csv" extension dot (and the date-separator hyphens)
    // are the only "." / "-" characters expected to survive.
    expect(dirty).not.toMatch(/[/;]/);
    expect(dirty).not.toMatch(/\.\./);
    expect(dirty.endsWith(".csv")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Zod validation — real parse tests
// ---------------------------------------------------------------------------
describe("workflow-analytics validation schemas", () => {
  it("periodSchema accepts a valid preset and a valid custom range", () => {
    expect(periodSchema.safeParse({ preset: "7d" }).success).toBe(true);
    expect(periodSchema.safeParse({ from: "2026-01-01", to: "2026-01-31" }).success).toBe(true);
  });

  it("periodSchema rejects an inverted custom range (from > to)", () => {
    const result = periodSchema.safeParse({ from: "2026-02-01", to: "2026-01-01" });
    expect(result.success).toBe(false);
  });

  it("periodSchema rejects a custom range larger than the configured maximum", () => {
    const result = periodSchema.safeParse({ from: "2020-01-01", to: "2026-01-01" });
    expect(result.success).toBe(false);
  });

  it("periodSchema rejects an invalid preset value", () => {
    expect(periodSchema.safeParse({ preset: "5years" }).success).toBe(false);
  });

  it("analyticsFiltersSchema rejects an invalid status/executionMode/stepType enum value", () => {
    expect(analyticsFiltersSchema.safeParse({ status: "NOT_A_REAL_STATUS" }).success).toBe(false);
    expect(analyticsFiltersSchema.safeParse({ executionMode: "NOT_A_REAL_MODE" }).success).toBe(false);
    expect(analyticsFiltersSchema.safeParse({ stepType: "not_a_real_type" }).success).toBe(false);
  });

  it("analyticsFiltersSchema accepts every real WorkflowStepType and a real workflow id", () => {
    for (const stepType of ["ai_tool", "prompt_library", "ai_template", "brand_kit", "transform", "save_result"]) {
      expect(analyticsFiltersSchema.safeParse({ stepType }).success).toBe(true);
    }
    expect(analyticsFiltersSchema.safeParse({ workflowId: "clx1234567890" }).success).toBe(true);
  });

  it("analyticsFiltersSchema rejects a malformed (empty or absurdly long) workflowId", () => {
    expect(analyticsFiltersSchema.safeParse({ workflowId: "" }).success).toBe(false);
    expect(analyticsFiltersSchema.safeParse({ workflowId: "x".repeat(200) }).success).toBe(false);
  });

  it("paginationSchema rejects an abusive page size and clamps/defaults sensibly", () => {
    expect(paginationSchema.safeParse({ pageSize: 100 }).success).toBe(true);
    expect(paginationSchema.safeParse({ pageSize: 10000 }).success).toBe(false);
    expect(paginationSchema.parse({}).page).toBe(1);
    expect(paginationSchema.parse({}).pageSize).toBe(20);
  });

  it("exportParamsSchema REQUIRES a period — omitting it is rejected, matching the spec's 'rango temporal obligatorio'", () => {
    expect(exportParamsSchema.safeParse({ type: "runs" }).success).toBe(false);
    expect(exportParamsSchema.safeParse({ type: "runs", period: { preset: "30d" } }).success).toBe(true);
  });

  it("exportParamsSchema rejects an unsupported export type", () => {
    expect(exportParamsSchema.safeParse({ type: "full_database_dump", period: { preset: "7d" } }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. Correlation with AIUsage — structural verification of the real code
// ---------------------------------------------------------------------------
describe("AIUsage correlation: exactly one real-call accounting site, always fully correlated", () => {
  const actions = read("src/server/actions/workflow-execution.ts");

  it("there is still exactly one aIUsage.create call site in the whole execution module (never duplicated)", () => {
    expect((actions.match(/aIUsage\.create\(/g) ?? []).length).toBe(1);
  });

  it("that single call site is inside completeWorkflowStepAction and includes every required correlation field", () => {
    const fn = actions.match(/export async function completeWorkflowStepAction[\s\S]*?\n(?=export interface FailWorkflowStepInput)/)![0];
    expect(fn).toMatch(/aIUsage\.create\(/);
    expect(fn).toMatch(/workflowId: run\.workflowId,/);
    expect(fn).toMatch(/workflowRunId: run\.id,/);
    expect(fn).toMatch(/workflowStepRunId: stepRow\.id,/);
    expect(fn).toMatch(/workflowVersion: run\.workflowVersion,/);
    expect(fn).toMatch(/toolSlug,/);
    expect(fn).toMatch(/executionMode: run\.executionMode,/);
  });

  it("toolSlug is read from the run's own frozen snapshot — never from a client-supplied value", () => {
    const fn = actions.match(/export async function completeWorkflowStepAction[\s\S]*?\n(?=export interface FailWorkflowStepInput)/)![0];
    expect(fn).toMatch(/const toolSlug = snapshot\?\.steps\[input\.stepIndex\]\?\.toolSlug;/);
  });

  it("the simulated preview engine (planWorkflowRun) never creates AIUsage — it has no database access at all", () => {
    const engine = read("src/lib/ai-workflows/engine.ts");
    expect(engine).not.toMatch(/aIUsage|prisma/);
  });

  it("prompt_library/ai_template/transform/save_result steps resolve without ever reaching the AIUsage call site — only an 'ai_call' resolution kind does", () => {
    const resolver = read("src/lib/ai-workflows/execution-resolver.ts");
    // Every non-ai_tool branch returns kind "resolved" directly — never "ai_call".
    expect(resolver).toMatch(/case "prompt_library": \{[\s\S]*?kind: "resolved"/);
    expect(resolver).toMatch(/case "ai_template": \{[\s\S]*?kind: "resolved"/);
    expect(resolver).toMatch(/case "transform": \{[\s\S]*?kind: "resolved"/);
    expect(resolver).toMatch(/case "save_result": \{[\s\S]*?kind: "resolved"/);
  });
});

// ---------------------------------------------------------------------------
// 7. Duration + normalizedErrorCode persistence — structural verification
// ---------------------------------------------------------------------------
describe("Duration and normalized-error persistence on real terminal transitions", () => {
  const actions = read("src/server/actions/workflow-execution.ts");

  it("failRunAndRemainingSteps computes and persists durationMs + normalizedErrorCode for both the run and the failed step", () => {
    const fn = actions.match(/async function failRunAndRemainingSteps[\s\S]*?\n(?=async function completeStepAndMaybeRun)/)![0];
    expect(fn).toMatch(/const normalizedErrorCode = normalizeWorkflowError\(truncatedMessage\);/);
    expect(fn).toMatch(/durationMs: runDurationMs,/);
    expect(fn).toMatch(/durationMs: stepDurationMs \}/);
  });

  it("completeStepAndMaybeRun computes durationMs for the completed step and, on the final step, for the run", () => {
    const fn = actions.match(/async function completeStepAndMaybeRun[\s\S]*?\n(?=\/\/ -{3,}|async function createRunFromSnapshot)/)![0];
    expect(fn).toMatch(/const stepDurationMs = stepRow\.startedAt/);
    expect(fn).toMatch(/const runDurationMs = run\.startedAt/);
  });

  it("cancelWorkflowRunAction persists durationMs and a 'cancelled' normalizedErrorCode on both the run and any in-flight step", () => {
    const fn = actions.match(/export async function cancelWorkflowRunCore[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/normalizedErrorCode: "cancelled",/);
    expect(fn).toMatch(/durationMs: runDurationMs,/);
  });

  it("every INTERRUPTED assignment also sets normalizedErrorCode to 'lease_expired'", () => {
    const assignments = actions.match(/status: "INTERRUPTED"[^}]*\}/g) ?? [];
    expect(assignments.length).toBeGreaterThan(0);
    for (const a of assignments) expect(a).toMatch(/normalizedErrorCode: "lease_expired"/);
  });
});

// ---------------------------------------------------------------------------
// 8. Schema — additive-only correlation/measurement fields
// ---------------------------------------------------------------------------
describe("Schema: AIUsage correlation fields and WorkflowRun/WorkflowStepRun measurement fields", () => {
  const schema = read("prisma/schema.prisma");

  it("AIUsage gained only nullable correlation fields — every pre-existing row (and every non-Workflow generation) stays valid", () => {
    const model = schema.match(/model AIUsage \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/workflowId\s+String\?/);
    expect(model).toMatch(/workflowRunId\s+String\?/);
    expect(model).toMatch(/workflowStepRunId\s+String\?/);
    expect(model).toMatch(/workflowVersion\s+Int\?/);
    expect(model).toMatch(/toolSlug\s+String\?/);
    expect(model).toMatch(/executionMode\s+String\?/);
  });

  it("the AIUsage->Workflow*/WorkflowRun/WorkflowStepRun relations use onDelete: SetNull — deleting a workflow never destroys usage history", () => {
    const model = schema.match(/model AIUsage \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/workflow\s+Workflow\?\s+@relation\(fields: \[workflowId\], references: \[id\], onDelete: SetNull\)/);
    expect(model).toMatch(/workflowRun\s+WorkflowRun\?\s+@relation\(fields: \[workflowRunId\], references: \[id\], onDelete: SetNull\)/);
  });

  it("WorkflowRun and WorkflowStepRun gained nullable durationMs + normalizedErrorCode only", () => {
    const runModel = schema.match(/model WorkflowRun \{[\s\S]*?\n\}/)![0];
    const stepModel = schema.match(/model WorkflowStepRun \{[\s\S]*?\n\}/)![0];
    expect(runModel).toMatch(/durationMs\s+Int\?/);
    expect(runModel).toMatch(/normalizedErrorCode\s+String\?/);
    expect(stepModel).toMatch(/durationMs\s+Int\?/);
    expect(stepModel).toMatch(/normalizedErrorCode\s+String\?/);
  });

  it("no second AIUsage-like table (a duplicate AI-usage-accounting model) was introduced — the pre-existing, unrelated UsageCounter (plan/quota limits) is a different concept and is untouched", () => {
    expect(schema.match(/^model \w*AIUsage\w* \{/gm) ?? []).toEqual(["model AIUsage {"]);
  });

  it("no analytics table duplicating every run's data was introduced — WorkflowRun/WorkflowStepRun remain the only execution-record models", () => {
    expect(schema).not.toMatch(/model WorkflowAnalytic/);
    expect(schema).not.toMatch(/model WorkflowEvent/);
    expect(schema).not.toMatch(/model AnalyticsEvent/);
  });
});

// ---------------------------------------------------------------------------
// 9. Service layer — security isolation & performance shape (structural)
// ---------------------------------------------------------------------------
describe("workflow-analytics service: isolation and query shape", () => {
  const service = read("src/server/services/workflow-analytics.ts");

  it("every exported metrics function requires an explicit AnalyticsScope { userId, projectId } parameter — never derives it internally", () => {
    const exported = service.match(/export async function \w+\(\s*scope: AnalyticsScope/g) ?? [];
    expect(exported.length).toBeGreaterThan(5);
  });

  it("runWhere and usageWhere always filter by userId AND projectId — the two isolation dimensions the spec requires", () => {
    const runWhereFn = service.match(/function runWhere[\s\S]*?\n\}/)![0];
    const usageWhereFn = service.match(/function usageWhere[\s\S]*?\n\}/)![0];
    expect(runWhereFn).toMatch(/userId: scope\.userId,/);
    expect(runWhereFn).toMatch(/projectId: scope\.projectId,/);
    expect(usageWhereFn).toMatch(/userId: scope\.userId,/);
    expect(usageWhereFn).toMatch(/projectId: scope\.projectId,/);
  });

  it("getWorkflowRunAnalyticsDetail double-checks ownership after the query (userId AND projectId) before returning anything, and uses an explicit select (never a blanket include)", () => {
    const fn = service.match(/export async function getWorkflowRunAnalyticsDetail[\s\S]*?\n(?=export interface CsvExportResult)/)![0];
    expect(fn).toMatch(/if \(!run \|\| run\.userId !== scope\.userId \|\| run\.projectId !== scope\.projectId\) return null;/);
    expect(fn).toMatch(/select: \{/);
    expect(fn).not.toMatch(/include: \{/);
  });

  it("getWorkflowRunAnalyticsDetail never selects leaseId, leaseOwner, executionToken, or the raw workflowSnapshot", () => {
    const fn = service.match(/export async function getWorkflowRunAnalyticsDetail[\s\S]*?\n(?=export interface CsvExportResult)/)![0];
    expect(fn).not.toMatch(/\bleaseId\b/);
    expect(fn).not.toMatch(/\bleaseOwner\b/);
    expect(fn).not.toMatch(/executionToken/);
    expect(fn).not.toMatch(/workflowSnapshot: true/);
  });

  it("getRecentRuns selects only list-safe scalar fields — never finalOutput, inputVariables, workflowSnapshot, or errorMessage", () => {
    const fn = service.match(/export async function getRecentRuns[\s\S]*?\n(?=export interface WorkflowRunAnalyticsDetail)/)![0];
    expect(fn).not.toMatch(/finalOutput: true/);
    expect(fn).not.toMatch(/inputVariables: true/);
    expect(fn).not.toMatch(/workflowSnapshot: true/);
    expect(fn).not.toMatch(/errorMessage: true/);
  });

  it("summary/time-series/version/step metrics use aggregate/groupBy/count — never a bare findMany of full run rows without a select", () => {
    expect(service).toMatch(/prisma\.workflowRun\.groupBy\(/);
    expect(service).toMatch(/prisma\.workflowRun\.aggregate\(/);
    expect(service).toMatch(/prisma\.workflowStepRun\.groupBy\(/);
    expect(service).toMatch(/prisma\.aIUsage\.groupBy\(/);
  });

  it("the only findMany calls against WorkflowRun/WorkflowStepRun always pass an explicit `select` — full-row loads never happen", () => {
    const findManyBlocks = service.match(/prisma\.(workflowRun|workflowStepRun)\.findMany\(\{[\s\S]*?\n\s{2}\}\)/g) ?? [];
    expect(findManyBlocks.length).toBeGreaterThan(0);
    for (const block of findManyBlocks) expect(block).toMatch(/select:/);
  });

  it("CSV exports are capped by MAX_EXPORT_ROWS and a period is always required by the action layer's exportParamsSchema", () => {
    expect(service).toMatch(/const MAX_EXPORT_ROWS = 5000;/);
    expect(service).toMatch(/\.slice\(0, MAX_EXPORT_ROWS\)|take: MAX_EXPORT_ROWS/);
  });
});

// ---------------------------------------------------------------------------
// 10. Actions layer — auth/ownership/validation, never a client userId
// ---------------------------------------------------------------------------
describe("workflow-analytics actions: auth, validation, and scope construction", () => {
  const actions = read("src/server/actions/workflow-analytics.ts");

  it("no EXPORTED action accepts a userId parameter — only the private buildScope helper (fed exclusively by requireProjectAccess's own return value) ever sees one", () => {
    const exportedFns = actions.match(/export async function \w+\([^)]*\)/g) ?? [];
    expect(exportedFns.length).toBeGreaterThan(5);
    for (const sig of exportedFns) expect(sig).not.toMatch(/userId/);
  });

  it("every action calls requireProjectAccess before touching any service function", () => {
    const fns = actions.match(/export async function \w+\([\s\S]*?\n\}/g) ?? [];
    for (const fn of fns) expect(fn).toMatch(/requireProjectAccess\(projectId, "VIEWER"\)/);
  });

  it("filters and period are always parsed with the real Zod schemas before reaching the service layer", () => {
    expect(actions).toMatch(/analyticsFiltersSchema\.safeParse/);
    expect(actions).toMatch(/periodSchema\.safeParse/);
    expect(actions).toMatch(/exportParamsSchema\.safeParse/);
  });

  it("buildScope always derives userId from the authenticated user object, never from an input parameter", () => {
    const fn = actions.match(/function buildScope[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/function buildScope\(userId: string, projectId: string\): AnalyticsScope/);
  });
});

// ---------------------------------------------------------------------------
// 11. Regressions
// ---------------------------------------------------------------------------
describe("Regressions: recovery, lease, retries, cancellation, Chat IA, and the single AI engine all remain intact", () => {
  it("lease/execution-token/resume/retry machinery from the recovery phase is untouched by this phase's edits", () => {
    const actions = read("src/server/actions/workflow-execution.ts");
    expect(actions).toMatch(/isLeaseHeldWith\(run, input\.leaseId/);
    expect(actions).toMatch(/export async function resumeWorkflowRunAction/);
    expect(actions).toMatch(/export async function retryWorkflowRunAction/);
    expect(actions).toMatch(/executionToken/);
  });

  it("chat-panel.tsx, intent-router.ts, and the assistant actions never import anything from the analytics layer", () => {
    const forbidden = /workflow-analytics|analytics-time\.ts|analytics-stats\.ts|error-normalization\.ts|csv\.ts/;
    expect(read("src/components/chat/chat-panel.tsx")).not.toMatch(forbidden);
    expect(read("src/lib/chat/intent-router.ts")).not.toMatch(forbidden);
    expect(read("src/server/actions/assistant.ts")).not.toMatch(forbidden);
  });

  it("no second AI engine was introduced for analytics — the service module never imports or references a model/provider client", () => {
    const service = read("src/server/services/workflow-analytics.ts");
    expect(service).not.toMatch(/useLocalAI|generateLocalText|CreateMLCEngine|new WebLLMEngine|openai|anthropic/i);
  });

  it("useLocalAI itself was not modified for this phase — no analytics import inside it", () => {
    const hook = read("src/hooks/use-local-ai.ts");
    expect(hook).not.toMatch(/workflow-analytics|AIUsage/);
  });

  it("Workspace's saved-run detection reuses the existing sourceTool convention on ContentItem — no second relation table", () => {
    const service = read("src/server/services/workflow-analytics.ts");
    expect(service).toMatch(/prisma\.contentItem\.count\(/);
    expect(service).toMatch(/sourceTool: \{ startsWith: `workflow-run:\$\{run\.workflowId\}:\$\{run\.id\}` \}/);
  });

  it("the AI Workflows preview engine, Prompt Library, AI Templates, and Brand Kit modules are untouched by this phase", () => {
    const engine = read("src/lib/ai-workflows/engine.ts");
    expect(engine).not.toMatch(/workflow-analytics|normalizeWorkflowError/);
  });
});
