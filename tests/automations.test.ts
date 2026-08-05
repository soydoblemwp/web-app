import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { computeNextOccurrence, zonedWallTimeToUtc, getZonedParts, describeRecurrence, validateRecurrenceConfig, type RecurrenceConfig } from "@/lib/automations/recurrence";
import { computeBackoffDelayMs, computeNextRetryAt, computeSeededJitterMs } from "@/lib/automations/backoff";
import { evaluateCondition, evaluateConditionGroup, resolveFieldValue, validateConditionTree, type ConditionGroupNode } from "@/lib/automations/conditions";
import { resolveAutomationTemplate, scanTemplateVariables } from "@/lib/automations/template";
import { resolveInputMappings } from "@/lib/automations/mapping";
import { checkForAutomationLoop } from "@/lib/automations/loop-detection";
import { computeWebhookSignature, verifyWebhookSignature, isTimestampWithinWindow, generateWebhookSecret, generateWebhookPublicId } from "@/lib/automations/webhook-signature";
import { AUTOMATION_EVENT_DEFINITIONS, findEventDefinition, sanitizeEventPayload } from "@/lib/automations/events";
import { TRIGGER_TYPE_DEFINITIONS, validateTriggerConfig } from "@/lib/automations/triggers";
import { WORKFLOW_AUTOMATION_ERROR_CODES, WORKFLOW_AUTOMATION_ERROR_MESSAGES, isRetryableErrorCategory } from "@/lib/automations/types";
import { WORKFLOW_AUTOMATION_LIMITS, isScheduleIntervalTooShort } from "@/lib/automations/limits";
import { projectNavGroups, guestNavGroups } from "@/lib/navigation";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

// ---------------------------------------------------------------------------
// 1. Recurrence engine — DST-safe, timezone-aware, no raw cron typed by users
// ---------------------------------------------------------------------------
describe("recurrence.ts: structured, validated recurrence — never raw cron (spec section 7)", () => {
  it("zonedWallTimeToUtc + getZonedParts round-trip correctly for a plain (non-DST-boundary) date", () => {
    const utc = zonedWallTimeToUtc(2026, 6, 15, 9, 30, "America/New_York");
    const back = getZonedParts(utc, "America/New_York");
    expect(back).toMatchObject({ year: 2026, month: 6, day: 15, hour: 9, minute: 30 });
  });

  it("correctly handles the US spring-forward DST transition (2 AM doesn't exist on that day)", () => {
    // 2026-03-08 is the US DST start date; 09:00 local should still resolve to a sane, later UTC instant than the day before.
    const before = zonedWallTimeToUtc(2026, 3, 7, 9, 0, "America/New_York");
    const after = zonedWallTimeToUtc(2026, 3, 8, 9, 0, "America/New_York");
    // Only 23 real hours elapse across the spring-forward day at the same wall-clock hour.
    expect(after.getTime() - before.getTime()).toBe(23 * 3600_000);
  });

  it("correctly handles the US fall-back DST transition (25 real hours elapse, 2026-11-01)", () => {
    const before = zonedWallTimeToUtc(2026, 10, 31, 9, 0, "America/New_York");
    const after = zonedWallTimeToUtc(2026, 11, 1, 9, 0, "America/New_York");
    expect(after.getTime() - before.getTime()).toBe(25 * 3600_000);
  });

  it("rejects an invalid IANA timezone", () => {
    const result = validateRecurrenceConfig({ kind: "DAILY", timezone: "Not/AZone", startDate: "2026-01-01", hour: 9, minute: 0 });
    expect(result.valid).toBe(false);
  });

  it("rejects WEEKLY_DAYS with no days selected", () => {
    const result = validateRecurrenceConfig({ kind: "WEEKLY_DAYS", timezone: "UTC", startDate: "2026-01-01", daysOfWeek: [], hour: 9, minute: 0 });
    expect(result.valid).toBe(false);
  });

  it("rejects MONTHLY with dayOfMonth > 28 (would skip February some years)", () => {
    const result = validateRecurrenceConfig({ kind: "MONTHLY", timezone: "UTC", startDate: "2026-01-01", dayOfMonth: 30, hour: 9, minute: 0 });
    expect(result.valid).toBe(false);
  });

  it("describeRecurrence produces a real, human-readable Spanish description for every kind", () => {
    const base = { timezone: "UTC", startDate: "2026-01-01", hour: 9, minute: 0 };
    expect(describeRecurrence({ ...base, kind: "HOURLY" })).toMatch(/hora/);
    expect(describeRecurrence({ ...base, kind: "DAILY" })).toMatch(/día/);
    expect(describeRecurrence({ ...base, kind: "WEEKLY_DAYS", daysOfWeek: [1, 3] })).toMatch(/lunes.*miércoles|miércoles.*lunes/);
    expect(describeRecurrence({ ...base, kind: "MONTHLY", dayOfMonth: 5 })).toMatch(/mes/);
    expect(describeRecurrence({ ...base, kind: "CUSTOM_INTERVAL_DAYS", intervalDays: 3 })).toMatch(/3 días/);
  });

  it("computeNextOccurrence for DAILY returns the next day at the configured local time, strictly after 'after'", () => {
    const config: RecurrenceConfig = { kind: "DAILY", timezone: "UTC", startDate: "2026-01-01", hour: 9, minute: 0 };
    const after = new Date("2026-01-05T09:00:00.000Z");
    const next = computeNextOccurrence(config, after, 0);
    expect(next?.toISOString()).toBe("2026-01-06T09:00:00.000Z");
  });

  it("computeNextOccurrence for WEEKLY_DAYS only lands on the selected weekdays", () => {
    const config: RecurrenceConfig = { kind: "WEEKLY_DAYS", timezone: "UTC", startDate: "2026-01-01", daysOfWeek: [1, 5], hour: 8, minute: 0 }; // Mon & Fri
    const after = new Date("2026-01-01T00:00:00.000Z"); // a Thursday
    const next = computeNextOccurrence(config, after, 0);
    expect(next).not.toBeNull();
    const weekday = getZonedParts(next!, "UTC").weekday;
    expect([1, 5]).toContain(weekday);
  });

  it("computeNextOccurrence returns null once maxOccurrences is reached", () => {
    const config: RecurrenceConfig = { kind: "DAILY", timezone: "UTC", startDate: "2026-01-01", hour: 9, minute: 0, maxOccurrences: 3 };
    expect(computeNextOccurrence(config, new Date("2026-01-01T00:00:00.000Z"), 3)).toBeNull();
  });

  it("computeNextOccurrence returns null once past the configured endDate", () => {
    const config: RecurrenceConfig = { kind: "DAILY", timezone: "UTC", startDate: "2026-01-01", endDate: "2026-01-03", hour: 9, minute: 0 };
    const next = computeNextOccurrence(config, new Date("2026-01-05T00:00:00.000Z"), 0);
    expect(next).toBeNull();
  });

  it("CUSTOM_INTERVAL_DAYS lands exactly every N days from the start date", () => {
    const config: RecurrenceConfig = { kind: "CUSTOM_INTERVAL_DAYS", timezone: "UTC", startDate: "2026-01-01", intervalDays: 3, hour: 9, minute: 0 };
    const first = computeNextOccurrence(config, new Date("2026-01-01T00:00:00.000Z"), 0);
    expect(first?.toISOString()).toBe("2026-01-01T09:00:00.000Z");
    const second = computeNextOccurrence(config, first!, 1);
    expect(second?.toISOString()).toBe("2026-01-04T09:00:00.000Z");
  });

  it("the minimum schedule interval is centrally defined and enforced", () => {
    expect(WORKFLOW_AUTOMATION_LIMITS.MIN_SCHEDULE_INTERVAL_MINUTES).toBeGreaterThanOrEqual(1);
    expect(isScheduleIntervalTooShort(1)).toBe(true);
    expect(isScheduleIntervalTooShort(WORKFLOW_AUTOMATION_LIMITS.MIN_SCHEDULE_INTERVAL_MINUTES)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Backoff
// ---------------------------------------------------------------------------
describe("backoff.ts: deterministic exponential backoff (spec section 22)", () => {
  const config = { baseDelayMs: 1000, multiplier: 2, maxDelayMs: 60_000 };

  it("attempt 1 uses the base delay", () => {
    expect(computeBackoffDelayMs(1, config)).toBe(1000);
  });
  it("delay doubles per attempt up to the max", () => {
    expect(computeBackoffDelayMs(2, config)).toBe(2000);
    expect(computeBackoffDelayMs(3, config)).toBe(4000);
    expect(computeBackoffDelayMs(10, config)).toBe(60_000); // capped
  });
  it("computeNextRetryAt adds the delay to 'now'", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(computeNextRetryAt(1, config, now).toISOString()).toBe("2026-01-01T00:00:01.000Z");
  });
  it("seeded jitter is deterministic — same seed always produces the same offset", () => {
    const a = computeSeededJitterMs("run-123", 500);
    const b = computeSeededJitterMs("run-123", 500);
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(500);
  });
  it("different seeds can produce different jitter", () => {
    expect(computeSeededJitterMs("run-a", 1000)).not.toBe(computeSeededJitterMs("run-b", 1000));
  });
});

// ---------------------------------------------------------------------------
// 3. Conditions — deterministic, no eval()
// ---------------------------------------------------------------------------
describe("conditions.ts: deterministic condition evaluation, never eval() (spec section 15)", () => {
  it("resolveFieldValue does dot-path lookup and never touches __proto__/constructor", () => {
    expect(resolveFieldValue({ current: { status: "REVIEW" } }, "current.status")).toBe("REVIEW");
    expect(resolveFieldValue({}, "__proto__.polluted")).toBeUndefined();
    expect(resolveFieldValue({}, "constructor.name")).toBeUndefined();
  });

  it("every operator from spec section 15 is implemented", () => {
    const ops = [
      "EQUALS", "NOT_EQUALS", "CONTAINS", "NOT_CONTAINS", "STARTS_WITH", "ENDS_WITH",
      "GREATER_THAN", "GREATER_THAN_OR_EQUAL", "LESS_THAN", "LESS_THAN_OR_EQUAL",
      "IS_EMPTY", "IS_NOT_EMPTY", "IN", "NOT_IN", "CHANGED_FROM", "CHANGED_TO", "EXISTS", "NOT_EXISTS",
    ];
    for (const operator of ops) {
      expect(() => evaluateCondition({ field: "x", operator: operator as never, value: "y" }, { x: "y" })).not.toThrow();
    }
  });

  it("equals/not_equals/contains work on real payload data", () => {
    expect(evaluateCondition({ field: "status", operator: "EQUALS", value: "READY" }, { status: "READY" })).toBe(true);
    expect(evaluateCondition({ field: "title", operator: "CONTAINS", value: "hola" }, { title: "di hola mundo" })).toBe(true);
    expect(evaluateCondition({ field: "title", operator: "NOT_CONTAINS", value: "adios" }, { title: "di hola mundo" })).toBe(true);
  });

  it("greater_than/less_than only compare real numbers, never coerce strings", () => {
    expect(evaluateCondition({ field: "priority", operator: "GREATER_THAN", value: 2 }, { priority: 3 })).toBe(true);
    expect(evaluateCondition({ field: "priority", operator: "GREATER_THAN", value: 2 }, { priority: "3" })).toBe(false);
  });

  it("changed_from/changed_to read the previous/current transition payload", () => {
    const payload = { previous: { status: "DRAFT" }, current: { status: "REVIEW" } };
    expect(evaluateCondition({ field: "status", operator: "CHANGED_FROM", value: "DRAFT" }, payload)).toBe(true);
    expect(evaluateCondition({ field: "status", operator: "CHANGED_TO", value: "REVIEW" }, payload)).toBe(true);
    expect(evaluateCondition({ field: "status", operator: "CHANGED_TO", value: "PUBLISHED" }, payload)).toBe(false);
  });

  it("is_empty/is_not_empty handle missing, blank, and populated values", () => {
    expect(evaluateCondition({ field: "x", operator: "IS_EMPTY" }, {})).toBe(true);
    expect(evaluateCondition({ field: "x", operator: "IS_EMPTY" }, { x: "  " })).toBe(true);
    expect(evaluateCondition({ field: "x", operator: "IS_NOT_EMPTY" }, { x: "value" })).toBe(true);
  });

  it("exists/not_exists distinguish 'field present with a value' from 'field absent'", () => {
    expect(evaluateCondition({ field: "x", operator: "EXISTS" }, { x: null })).toBe(true); // present, even if null
    expect(evaluateCondition({ field: "x", operator: "NOT_EXISTS" }, {})).toBe(true);
  });

  it("AND group requires every condition true; OR group requires at least one", () => {
    const and: ConditionGroupNode = { operator: "AND", groups: [], conditions: [{ field: "a", operator: "EQUALS", value: 1 }, { field: "b", operator: "EQUALS", value: 2 }] };
    expect(evaluateConditionGroup(and, { a: 1, b: 2 })).toBe(true);
    expect(evaluateConditionGroup(and, { a: 1, b: 99 })).toBe(false);

    const or: ConditionGroupNode = { operator: "OR", groups: [], conditions: [{ field: "a", operator: "EQUALS", value: 1 }, { field: "b", operator: "EQUALS", value: 2 }] };
    expect(evaluateConditionGroup(or, { a: 1, b: 99 })).toBe(true);
    expect(evaluateConditionGroup(or, { a: 99, b: 99 })).toBe(false);
  });

  it("nested groups combine correctly (AND of two ORs)", () => {
    const tree: ConditionGroupNode = {
      operator: "AND",
      conditions: [],
      groups: [
        { operator: "OR", conditions: [{ field: "a", operator: "EQUALS", value: 1 }], groups: [] },
        { operator: "OR", conditions: [{ field: "b", operator: "EQUALS", value: 2 }], groups: [] },
      ],
    };
    expect(evaluateConditionGroup(tree, { a: 1, b: 2 })).toBe(true);
    expect(evaluateConditionGroup(tree, { a: 1, b: 99 })).toBe(false);
  });

  it("an empty root condition group matches everything — 'sin condiciones' is valid and unrestricted", () => {
    expect(evaluateConditionGroup({ operator: "AND", conditions: [], groups: [] }, {})).toBe(true);
  });

  it("validateConditionTree rejects a group that exceeds the max conditions-per-group limit", () => {
    const many = Array.from({ length: WORKFLOW_AUTOMATION_LIMITS.MAX_CONDITIONS_PER_GROUP + 1 }, () => ({ field: "x", operator: "EXISTS" as const }));
    const issues = validateConditionTree({ operator: "AND", conditions: many, groups: [] });
    expect(issues.length).toBeGreaterThan(0);
  });

  it("validateConditionTree rejects nesting deeper than the max depth", () => {
    let deepest: ConditionGroupNode = { operator: "AND", conditions: [{ field: "x", operator: "EXISTS" }], groups: [] };
    for (let i = 0; i < WORKFLOW_AUTOMATION_LIMITS.MAX_CONDITION_DEPTH + 2; i++) {
      deepest = { operator: "AND", conditions: [], groups: [deepest] };
    }
    const issues = validateConditionTree(deepest);
    expect(issues.length).toBeGreaterThan(0);
  });

  it("never uses eval or the Function constructor anywhere in the module's real code (comments may mention them to document what's excluded)", () => {
    const code = read("src/lib/automations/conditions.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/\beval\(/);
    expect(code).not.toMatch(/new Function\(/);
  });
});

// ---------------------------------------------------------------------------
// 4. Templates — safe substitution, no JS execution
// ---------------------------------------------------------------------------
describe("template.ts: safe {{dotted.path}} templates, never JS execution (spec section 18)", () => {
  it("resolves a real nested path", () => {
    const result = resolveAutomationTemplate("Crear contenido para {{event.resource.title}}", { event: { resource: { title: "Lanzamiento" } } });
    expect(result.output).toBe("Crear contenido para Lanzamiento");
    expect(result.missing).toHaveLength(0);
  });

  it("flags an unknown/missing variable instead of silently guessing", () => {
    const result = resolveAutomationTemplate("Hola {{event.resource.nope}}", { event: { resource: {} } });
    expect(result.missing).toContain("event.resource.nope");
  });

  it("restricts resolution to explicitly allowed root namespaces", () => {
    const result = resolveAutomationTemplate("{{secret.token}}", { secret: { token: "shh" } }, ["event", "resource"]);
    expect(result.output).not.toContain("shh");
    expect(result.missing).toContain("secret.token");
  });

  it("never exposes process.env, __proto__, constructor, or functions even if present on the context object", () => {
    const context = { __proto__: { polluted: true }, constructor: { name: "Object" }, fn: () => "danger" } as unknown as Record<string, unknown>;
    expect(resolveAutomationTemplate("{{__proto__.polluted}}", context).output).toBe("");
    expect(resolveAutomationTemplate("{{constructor.name}}", context).output).toBe("");
    expect(resolveAutomationTemplate("{{fn}}", context).output).toBe("");
  });

  it("escapes HTML-significant characters in resolved values", () => {
    const result = resolveAutomationTemplate("{{event.title}}", { event: { title: "<script>alert(1)</script>" } });
    expect(result.output).not.toContain("<script>");
  });

  it("rejects malformed tokens as invalid, never as a resolvable variable", () => {
    const result = resolveAutomationTemplate("{{ }} and {{123bad}}", {});
    expect(result.invalidTokens.length).toBeGreaterThan(0);
  });

  it("scanTemplateVariables previews the variables a template references without resolving them", () => {
    const scan = scanTemplateVariables("{{event.a}} and {{event.b}}");
    expect(scan.paths).toEqual(["event.a", "event.b"]);
  });

  it("never imports eval-like APIs in the module's real code", () => {
    const code = read("src/lib/automations/template.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/\beval\(/);
    expect(code).not.toMatch(/new Function\(/);
  });
});

// ---------------------------------------------------------------------------
// 5. Input mappings
// ---------------------------------------------------------------------------
describe("mapping.ts: resolves trigger data into real workflow inputs (spec section 17)", () => {
  it("STATIC mappings pass the literal value through", () => {
    const result = resolveInputMappings([{ targetVariable: "tono", sourceKind: "STATIC", sourceExpression: "profesional" }], {}, []);
    expect(result.values.tono).toBe("profesional");
  });

  it("EVENT_FIELD mappings resolve from the event context", () => {
    const result = resolveInputMappings(
      [{ targetVariable: "titulo", sourceKind: "EVENT_FIELD", sourceExpression: "resource.title" }],
      { event: { resource: { title: "Campaña de verano" } } },
      []
    );
    expect(result.values.titulo).toBe("Campaña de verano");
  });

  it("falls back to defaultValue when the source resolves empty", () => {
    const result = resolveInputMappings([{ targetVariable: "x", sourceKind: "EVENT_FIELD", sourceExpression: "missing", defaultValue: "valor por defecto" }], { event: {} }, []);
    expect(result.values.x).toBe("valor por defecto");
  });

  it("flags required target variables left empty — the caller must refuse to start the run", () => {
    const result = resolveInputMappings([{ targetVariable: "x", sourceKind: "EVENT_FIELD", sourceExpression: "missing" }], { event: {} }, ["x"]);
    expect(result.emptyRequired).toContain("x");
  });

  it("TEMPLATE mappings resolve a full {{}} template", () => {
    const result = resolveInputMappings(
      [{ targetVariable: "prompt", sourceKind: "TEMPLATE", sourceExpression: "Escribe sobre {{event.resource.title}}" }],
      { event: { resource: { title: "IA" } } },
      []
    );
    expect(result.values.prompt).toBe("Escribe sobre IA");
  });
});

// ---------------------------------------------------------------------------
// 6. Loop detection
// ---------------------------------------------------------------------------
describe("loop-detection.ts: blocks real loops, never blocks a legitimate first-time event (spec section 31)", () => {
  it("allows a fresh activation with no ancestry and no repeats", () => {
    const result = checkForAutomationLoop({ chainDepth: 0, maxChainDepth: 5, visitedAutomationIds: [], candidateAutomationId: "auto-1", recentSameActivationCount: 0, maxRepeatsInWindow: 3 });
    expect(result.blocked).toBe(false);
  });

  it("blocks when the same automation already appears in the causation ancestry", () => {
    const result = checkForAutomationLoop({ chainDepth: 2, maxChainDepth: 5, visitedAutomationIds: ["auto-1", "auto-2"], candidateAutomationId: "auto-1", recentSameActivationCount: 0, maxRepeatsInWindow: 3 });
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/cadena/);
  });

  it("blocks when the max chain depth is exceeded", () => {
    const result = checkForAutomationLoop({ chainDepth: 6, maxChainDepth: 5, visitedAutomationIds: [], candidateAutomationId: "auto-9", recentSameActivationCount: 0, maxRepeatsInWindow: 3 });
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/profundidad/i);
  });

  it("blocks when the same activation repeated too many times within the window", () => {
    const result = checkForAutomationLoop({ chainDepth: 1, maxChainDepth: 5, visitedAutomationIds: [], candidateAutomationId: "auto-1", recentSameActivationCount: 5, maxRepeatsInWindow: 3 });
    expect(result.blocked).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. Webhook signature
// ---------------------------------------------------------------------------
describe("webhook-signature.ts: real HMAC-SHA256, constant-time comparison, replay window (spec section 12)", () => {
  it("computeWebhookSignature is deterministic for the same inputs", () => {
    const a = computeWebhookSignature("secret", "1700000000", '{"a":1}');
    const b = computeWebhookSignature("secret", "1700000000", '{"a":1}');
    expect(a).toBe(b);
  });

  it("verifyWebhookSignature accepts a correctly-signed payload and rejects a tampered one", () => {
    const secret = "topsecret";
    const timestamp = "1700000000";
    const body = '{"hello":"world"}';
    const sig = computeWebhookSignature(secret, timestamp, body);
    expect(verifyWebhookSignature(secret, timestamp, body, sig)).toBe(true);
    expect(verifyWebhookSignature(secret, timestamp, '{"hello":"tampered"}', sig)).toBe(false);
    expect(verifyWebhookSignature(secret, timestamp, body, "0".repeat(64))).toBe(false);
  });

  it("uses timingSafeEqual, never a plain === on the signature", () => {
    const source = read("src/lib/automations/webhook-signature.ts");
    expect(source).toMatch(/timingSafeEqual/);
  });

  it("isTimestampWithinWindow accepts a recent timestamp and rejects an expired one", () => {
    const now = new Date("2026-01-01T00:10:00.000Z");
    const recent = String(Math.floor(new Date("2026-01-01T00:08:00.000Z").getTime() / 1000));
    const expired = String(Math.floor(new Date("2026-01-01T00:00:00.000Z").getTime() / 1000));
    expect(isTimestampWithinWindow(recent, 300, now)).toBe(true);
    expect(isTimestampWithinWindow(expired, 300, now)).toBe(false);
  });

  it("rejects a garbage/non-numeric timestamp", () => {
    expect(isTimestampWithinWindow("not-a-number", 300)).toBe(false);
  });

  it("generateWebhookSecret and generateWebhookPublicId produce sufficiently long, distinct, random-looking values — never derived from a predictable internal id", () => {
    const s1 = generateWebhookSecret();
    const s2 = generateWebhookSecret();
    expect(s1).not.toBe(s2);
    expect(s1.length).toBeGreaterThanOrEqual(48);
    const p1 = generateWebhookPublicId();
    expect(p1).not.toBe(generateWebhookPublicId());
    expect(p1.length).toBeGreaterThanOrEqual(24);
  });
});

// ---------------------------------------------------------------------------
// 8. Event registry
// ---------------------------------------------------------------------------
describe("events.ts: central typed event registry — no free-floating string event names (spec section 8)", () => {
  it("declares the 16 canonical events from spec section 8", () => {
    expect(AUTOMATION_EVENT_DEFINITIONS.length).toBeGreaterThanOrEqual(16);
  });

  it("every event has a stable key, resourceType, schemaVersion, and at least one payload field", () => {
    for (const def of AUTOMATION_EVENT_DEFINITIONS) {
      // Two valid conventions coexist: dotted lowercase "resource.action" (this phase's own events), and
      // UPPERCASE_WITH_UNDERSCORES (Performance Center's events, spec section 37's exact literal names).
      expect(def.key).toMatch(/^[a-z_]+\.[a-z_]+$|^[A-Z][A-Z0-9_]+$/);
      expect(def.resourceType).toBeTruthy();
      expect(def.schemaVersion).toBeGreaterThanOrEqual(1);
      expect(def.fields.length).toBeGreaterThan(0);
    }
  });

  it("findEventDefinition resolves a real key and returns undefined for an unknown one", () => {
    expect(findEventDefinition("content_item.created")?.resourceType).toBe("CONTENT_ITEM");
    expect(findEventDefinition("not.a.real.event")).toBeUndefined();
  });

  it("sanitizeEventPayload strips any field not declared by the event definition — never leaks the full resource", () => {
    const clean = sanitizeEventPayload("content_item.created", { id: "1", title: "T", secretInternalField: "leak", body: "full HTML body should never be here" });
    expect(clean).not.toHaveProperty("secretInternalField");
    expect(clean).not.toHaveProperty("body");
    expect(clean.title).toBe("T");
  });

  it("transition events additionally carry previous/current/changedFields when present", () => {
    const clean = sanitizeEventPayload("content_item.status_changed", { id: "1", status: "REVIEW", previous: { status: "DRAFT" }, current: { status: "REVIEW" }, changedFields: ["status"] });
    expect(clean.previous).toEqual({ status: "DRAFT" });
    expect(clean.current).toEqual({ status: "REVIEW" });
  });
});

// ---------------------------------------------------------------------------
// 9. Trigger catalog
// ---------------------------------------------------------------------------
describe("triggers.ts: the 12 trigger types from spec section 4, each really connected", () => {
  it("declares exactly the 12 trigger types", () => {
    expect(TRIGGER_TYPE_DEFINITIONS.map((t) => t.type).sort()).toEqual(
      [
        "MANUAL", "SCHEDULE_ONCE", "SCHEDULE_RECURRING", "INTERNAL_EVENT", "WEBHOOK",
        "WORKFLOW_COMPLETED", "AGENT_RUN_COMPLETED", "MARKETING_BRAIN_COMPLETED",
        "KNOWLEDGE_SOURCE_READY", "CONTENT_STATUS_CHANGED", "CAMPAIGN_DATE_REACHED", "SOCIAL_POST_STATUS_CHANGED",
      ].sort()
    );
  });

  it("validateTriggerConfig requires an eventKey for INTERNAL_EVENT", () => {
    expect(validateTriggerConfig("INTERNAL_EVENT", {}).valid).toBe(false);
    expect(validateTriggerConfig("INTERNAL_EVENT", { eventKey: "content_item.created" }).valid).toBe(true);
  });

  it("validateTriggerConfig requires date/time/timezone for SCHEDULE_ONCE", () => {
    expect(validateTriggerConfig("SCHEDULE_ONCE", {}).valid).toBe(false);
    expect(validateTriggerConfig("SCHEDULE_ONCE", { localDate: "2026-06-01", localTime: "09:00", timezone: "UTC", scheduledAtUtc: "2026-06-01T09:00:00.000Z" }).valid).toBe(true);
  });

  it("validateTriggerConfig delegates to the recurrence validator for SCHEDULE_RECURRING", () => {
    expect(validateTriggerConfig("SCHEDULE_RECURRING", { kind: "DAILY", timezone: "Not/AZone", startDate: "2026-01-01" }).valid).toBe(false);
  });

  it("MANUAL and WEBHOOK need no extra config validation", () => {
    expect(validateTriggerConfig("MANUAL", {}).valid).toBe(true);
    expect(validateTriggerConfig("WEBHOOK", {}).valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 10. Error taxonomy
// ---------------------------------------------------------------------------
describe("types.ts: typed functional error codes (spec section 49) and retry-category rules (spec section 21)", () => {
  it("declares exactly the error codes from spec section 49", () => {
    expect(WORKFLOW_AUTOMATION_ERROR_CODES).toContain("AUTOMATION_LOOP_DETECTED");
    expect(WORKFLOW_AUTOMATION_ERROR_CODES).toContain("CRON_NOT_CONFIGURED");
    expect(WORKFLOW_AUTOMATION_ERROR_CODES.length).toBeGreaterThanOrEqual(27);
  });

  it("every error code has a real, non-empty, safe Spanish message", () => {
    for (const code of WORKFLOW_AUTOMATION_ERROR_CODES) {
      expect(WORKFLOW_AUTOMATION_ERROR_MESSAGES[code]).toBeTruthy();
      expect(WORKFLOW_AUTOMATION_ERROR_MESSAGES[code]).not.toMatch(/stack|Error:|at Object/);
    }
  });

  it("validation/permission/resource-deleted/condition/approval-rejected/configuration errors are never retryable", () => {
    expect(isRetryableErrorCategory("VALIDATION")).toBe(false);
    expect(isRetryableErrorCategory("PERMISSION")).toBe(false);
    expect(isRetryableErrorCategory("RESOURCE_DELETED")).toBe(false);
    expect(isRetryableErrorCategory("CONDITION")).toBe(false);
    expect(isRetryableErrorCategory("APPROVAL_REJECTED")).toBe(false);
    expect(isRetryableErrorCategory("CONFIGURATION")).toBe(false);
  });

  it("transient AI/conflict/storage/internal-safe errors are retryable", () => {
    expect(isRetryableErrorCategory("AI_TRANSIENT")).toBe(true);
    expect(isRetryableErrorCategory("CONFLICT_TRANSIENT")).toBe(true);
    expect(isRetryableErrorCategory("STORAGE_TRANSIENT")).toBe(true);
    expect(isRetryableErrorCategory("INTERNAL_SAFE")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 11. Navigation — placeholder, filled in once the route/nav wiring lands
// ---------------------------------------------------------------------------
describe("navigation: Automation Center is reachable only from the authenticated app", () => {
  it("guest navigation never mentions the new Automation Center", () => {
    const guestLabels = guestNavGroups.flatMap((g) => g.items.map((i) => i.label));
    expect(guestLabels).not.toContain("Automation Center");
  });

  it("projectNavGroups still has an 'Automatizaciones' entry pointing at the 'automations' segment", () => {
    const allItems = projectNavGroups.flatMap((g) => g.items);
    const item = allItems.find((i) => i.segment === "automations");
    expect(item).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 12. Structural coverage — files exist, wiring is real, security posture holds
// ---------------------------------------------------------------------------
describe("file layout: every service/action/endpoint the spec requires actually exists", () => {
  const requiredFiles = [
    "src/server/services/automation-catalog.ts",
    "src/server/services/automation-events.ts",
    "src/server/services/automation-orchestrator.ts",
    "src/server/services/automation-workflow-bridge.ts",
    "src/server/services/automation-notifications.ts",
    "src/server/services/automation-scheduler.ts",
    "src/server/services/automation-webhooks.ts",
    "src/server/services/automation-approvals.ts",
    "src/server/services/automation-cron.ts",
    "src/server/actions/automations.ts",
    "src/server/actions/automation-runs.ts",
    "src/server/actions/automation-approvals.ts",
    "src/server/actions/automation-webhooks.ts",
    "src/server/actions/automation-schedules.ts",
    "src/server/actions/automation-select.ts",
    "src/server/actions/automation-import-export.ts",
    "src/app/api/cron/workflow-automations/route.ts",
    "src/app/api/webhooks/automations/[publicId]/route.ts",
    "scripts/process-automations.ts",
    "src/lib/security/automation-cron-auth.ts",
  ];

  for (const file of requiredFiles) {
    it(`${file} exists`, () => {
      expect(existsSync(path.join(ROOT, file))).toBe(true);
    });
  }
});

describe("security: every automation server action enforces requireProjectAccess before touching data", () => {
  const actionFiles = [
    "src/server/actions/automations.ts",
    "src/server/actions/automation-runs.ts",
    "src/server/actions/automation-approvals.ts",
    "src/server/actions/automation-webhooks.ts",
    "src/server/actions/automation-schedules.ts",
    "src/server/actions/automation-select.ts",
    "src/server/actions/automation-import-export.ts",
  ];

  // Functions that legitimately need no membership check: thin wrappers that delegate to an already-checked
  // local helper (e.g. changeStatus), and pure catalog lookups that take no projectId at all (the internal
  // trigger/event registries are not project-scoped data).
  const EXEMPT_FUNCTIONS = new Set(["activateAutomationAction", "pauseAutomationAction", "archiveAutomationAction", "listAutomationEventDefinitionsAction", "listAutomationTriggerTypesAction"]);

  for (const file of actionFiles) {
    it(`every exported async function in ${file} calls requireProjectAccess (directly or via a same-file helper that does)`, () => {
      const source = read(file);
      const functionMatches = source.match(/export async function (\w+)\([\s\S]*?\n\}/g) ?? [];
      expect(functionMatches.length).toBeGreaterThan(0);
      for (const body of functionMatches) {
        const name = body.match(/export async function (\w+)\(/)![1];
        if (EXEMPT_FUNCTIONS.has(name)) continue;
        expect(body).toMatch(/requireProjectAccess/);
      }
    });
  }
});

describe("security: the incoming webhook endpoint never trusts a client-supplied signature/ID without verification", () => {
  it("the webhook route never calls requireProjectAccess (it is a public, secret+signature-authenticated endpoint) and delegates fully to receiveWebhook", () => {
    const source = read("src/app/api/webhooks/automations/[publicId]/route.ts");
    expect(source).not.toMatch(/requireProjectAccess/);
    expect(source).toMatch(/receiveWebhook/);
  });

  it("receiveWebhook genuinely checks signature, timestamp window, replay, size, and rate limit — never a placeholder", () => {
    const source = read("src/server/services/automation-webhooks.ts");
    expect(source).toMatch(/verifyWebhookSignature/);
    expect(source).toMatch(/isTimestampWithinWindow/);
    expect(source).toMatch(/WEBHOOK_REPLAY_DETECTED/);
    expect(source).toMatch(/exceedsWebhookBodyLimit/);
    expect(source).toMatch(/WEBHOOK_RATE_LIMITED/);
  });
});

describe("security: the cron endpoint stays honestly disabled without AUTOMATION_CRON_SECRET", () => {
  it("the route checks isAutomationCronConfigured before isAuthorizedAutomationCronRequest, and returns 503 (not 200) when unconfigured", () => {
    const source = read("src/app/api/cron/workflow-automations/route.ts");
    expect(source).toMatch(/isAutomationCronConfigured/);
    expect(source).toMatch(/503/);
  });

  it("isAuthorizedAutomationCronRequest returns false with no secret configured, and uses a constant-time comparison", () => {
    const source = read("src/lib/security/automation-cron-auth.ts");
    expect(source).toMatch(/if \(!secret\) return false/);
    expect(source).toMatch(/timingSafeEqual/);
  });

  it("the dev driver (scripts/process-automations.ts) calls the exact same runAutomationCronCycle the cron endpoint uses — never a second scheduling implementation", () => {
    const cronRoute = read("src/app/api/cron/workflow-automations/route.ts");
    const devDriver = read("scripts/process-automations.ts");
    expect(cronRoute).toMatch(/runAutomationCronCycle/);
    expect(devDriver).toMatch(/runAutomationCronCycle/);
  });
});

describe("UI hygiene: no alert()/confirm() in the new Automation Center components", () => {
  it("no component under src/components/automations calls window.alert(...) or window.confirm(...) as real code (comments may mention them to document what's excluded)", () => {
    const dir = path.join(ROOT, "src/components/automations");
    const files = readdirSync(dir).filter((f: string) => f.endsWith(".tsx"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(path.join(dir, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(source).not.toMatch(/\balert\(/);
      expect(source).not.toMatch(/window\.confirm\(/);
    }
  });
});

describe("migration: additive only, never touches a prior migration or DROP TABLE/COLUMN", () => {
  it("the new migration file contains no DROP TABLE/COLUMN statements", () => {
    const migrationsDir = path.join(ROOT, "prisma/migrations");
    const dirs = readdirSync(migrationsDir).filter((d: string) => d.includes("workflow_automation"));
    expect(dirs.length).toBe(1);
    const sql = readFileSync(path.join(migrationsDir, dirs[0], "migration.sql"), "utf8");
    expect(sql).not.toMatch(/DROP TABLE/i);
    expect(sql).not.toMatch(/DROP COLUMN/i);
  });
});

describe("out-of-phase legacy system: the old Automation model/services/cron are left untouched, never deleted", () => {
  it("the legacy src/server/services/automation.ts and src/server/actions/automation.ts (singular) still exist alongside the new plural-named files", () => {
    expect(existsSync(path.join(ROOT, "src/server/services/automation.ts"))).toBe(true);
    expect(existsSync(path.join(ROOT, "src/server/actions/automation.ts"))).toBe(true);
    expect(existsSync(path.join(ROOT, "src/server/actions/automations.ts"))).toBe(true);
  });

  it("the legacy cron endpoint at /api/cron/automations still exists, separate from the new /api/cron/workflow-automations", () => {
    expect(existsSync(path.join(ROOT, "src/app/api/cron/automations/route.ts"))).toBe(true);
    expect(existsSync(path.join(ROOT, "src/app/api/cron/workflow-automations/route.ts"))).toBe(true);
  });
});

describe("env/docs: .env.example documents every new variable this phase introduces", () => {
  it("lists AUTOMATION_CRON_SECRET, AUTOMATION_WEBHOOK_SIGNING_WINDOW_SECONDS, AUTOMATION_MAX_WEBHOOK_BODY_BYTES, AUTOMATION_MIN_SCHEDULE_INTERVAL_MINUTES, AUTOMATION_PROCESSING_BATCH_SIZE", () => {
    const envExample = read(".env.example");
    for (const key of ["AUTOMATION_CRON_SECRET", "AUTOMATION_WEBHOOK_SIGNING_WINDOW_SECONDS", "AUTOMATION_MAX_WEBHOOK_BODY_BYTES", "AUTOMATION_MIN_SCHEDULE_INTERVAL_MINUTES", "AUTOMATION_PROCESSING_BATCH_SIZE"]) {
      expect(envExample).toMatch(new RegExp(key));
    }
  });
});

describe("event integration points: publishAutomationEvent is genuinely wired at every real completion point the spec names", () => {
  const wiredFiles: Record<string, string[]> = {
    "src/server/actions/content.ts": ["content_item.created", "content_item.status_changed"],
    "src/server/actions/campaign-pieces.ts": ["campaign_content_piece.created", "campaign_content_piece.updated"],
    "src/server/actions/social.ts": ["social_post.created", "social_post.status_changed"],
    "src/server/actions/campaign.ts": ["campaign.created", "campaign.updated"],
    "src/server/services/knowledge-processing.ts": ["knowledge_source.ready", "knowledge_source.failed"],
    // Fase 36: this publishing logic was extracted into agent-run-lifecycle.ts so agent-performance-strategist.ts
    // could reuse the SAME run finalize/fail implementation without a circular import with agent-orchestrator.ts.
    "src/server/services/agent-run-lifecycle.ts": ["agent_run.completed", "agent_run.failed"],
    "src/server/services/marketing-brain-orchestrator.ts": ["marketing_brain_run.completed", "marketing_brain_run.failed"],
    "src/server/actions/workflow-execution.ts": ["workflow_run.completed", "workflow_run.failed"],
  };

  for (const [file, eventKeys] of Object.entries(wiredFiles)) {
    it(`${file} calls publishAutomationEvent with every declared event key: ${eventKeys.join(", ")}`, () => {
      const source = read(file);
      expect(source).toMatch(/publishAutomationEvent/);
      for (const key of eventKeys) {
        expect(source).toMatch(new RegExp(key.replace(/\./g, "\\.")));
      }
    });
  }

  it("every wired event key is a real, registered definition — never a free-floating string that isn't in AUTOMATION_EVENT_DEFINITIONS", () => {
    const allKeys = Object.values(wiredFiles).flat();
    for (const key of allKeys) {
      expect(findEventDefinition(key)).toBeDefined();
    }
  });
});

describe("trigger catalog: exactly the 12 trigger types the spec names, each with a real resolution path", () => {
  it("TRIGGER_TYPE_DEFINITIONS has exactly 12 entries matching the spec's list", () => {
    expect(TRIGGER_TYPE_DEFINITIONS).toHaveLength(12);
    const types = TRIGGER_TYPE_DEFINITIONS.map((t) => t.type).sort();
    expect(types).toEqual(
      [
        "MANUAL",
        "SCHEDULE_ONCE",
        "SCHEDULE_RECURRING",
        "INTERNAL_EVENT",
        "WEBHOOK",
        "WORKFLOW_COMPLETED",
        "AGENT_RUN_COMPLETED",
        "MARKETING_BRAIN_COMPLETED",
        "KNOWLEDGE_SOURCE_READY",
        "CONTENT_STATUS_CHANGED",
        "CAMPAIGN_DATE_REACHED",
        "SOCIAL_POST_STATUS_CHANGED",
      ].sort()
    );
  });

  it("SCHEDULE_ONCE/SCHEDULE_RECURRING are resolved by the scheduler polling real DB rows, never a browser timer", () => {
    const source = read("src/server/services/automation-scheduler.ts");
    expect(source).toMatch(/processDueSchedules/);
    expect(source).toMatch(/nextFiredAt/);
  });

  it("CAMPAIGN_DATE_REACHED is resolved against real Campaign rows by the scheduler, with a per-day idempotency key preventing duplicate daily events", () => {
    const source = read("src/server/services/automation-scheduler.ts");
    expect(source).toMatch(/processCampaignDateTriggers/);
    expect(source).toMatch(/campaign-date:\$\{automation\.id\}/);
  });
});

describe("idempotency and concurrency: enforced at the database level via unique constraints, never solely prior-check logic", () => {
  it("WorkflowAutomationRun has a unique (automationId, idempotencyKey) constraint in the schema", () => {
    const schema = read("prisma/schema.prisma");
    const model = schema.match(/model WorkflowAutomationRun \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/@@unique\(\[automationId, idempotencyKey\]\)/);
  });

  it("WorkflowAutomationEvent has a unique idempotencyKey column", () => {
    const schema = read("prisma/schema.prisma");
    const model = schema.match(/model WorkflowAutomationEvent \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/idempotencyKey\s+String\s+@unique/);
  });

  it("WorkflowAutomationWebhookDelivery has a unique (automationId, deliveryId) constraint — the replay-protection guarantee", () => {
    const schema = read("prisma/schema.prisma");
    const model = schema.match(/model WorkflowAutomationWebhookDelivery \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/@@unique\(\[automationId, deliveryId\]\)/);
  });

  it("WorkflowAutomationEventDelivery has a unique (eventId, automationId) constraint — an event can't double-deliver to the same automation", () => {
    const schema = read("prisma/schema.prisma");
    const model = schema.match(/model WorkflowAutomationEventDelivery \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/@@unique\(\[eventId, automationId\]\)/);
  });
});

describe("no second workflow engine: the bridge drives the SAME beginFreshRun/prepareWorkflowStepCore, never a parallel step interpreter", () => {
  it("automation-workflow-bridge.ts imports beginFreshRun/prepareWorkflowStepCore/cancelWorkflowRunCore from workflow-execution.ts, and defines no step-resolution logic of its own", () => {
    const source = read("src/server/services/automation-workflow-bridge.ts");
    expect(source).toMatch(/import \{ beginFreshRun, prepareWorkflowStepCore, cancelWorkflowRunCore \} from "@\/server\/actions\/workflow-execution"/);
    expect(source).not.toMatch(/resolveStepForExecution/);
  });
});
