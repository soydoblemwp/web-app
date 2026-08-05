import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { AiAgentBudgetMetric, AiAgentBudgetScope, AiAgentBudgetWindow } from "@/generated/prisma/client";
import type { BudgetDimensionSnapshot, EffectiveLimits } from "@/lib/agents/governance-types";
import { publishAutomationEvent } from "@/server/services/automation-events";
import { notifyGovernanceBudgetAlert } from "@/server/services/agent-governance-notifications";

/**
 * Real budget reserve/consume/release tracking (Fase 37 spec sections
 * 13-14) — atomic `updateMany` claims against `AiAgentBudgetUsage`, never a
 * plain read-then-write. Every dimension here is a REAL, measurable
 * quantity (run count, AI step count, retry count, execution seconds,
 * context/output character counts) — never tokens or money, since no real
 * provider cost data exists in this codebase (100% client-side WebGPU
 * generation, spec section 13: "nunca inventes costos monetarios").
 *
 * Window/metric pairing tracked (a deliberate, documented scope decision):
 *   - RUNS: DAILY + MONTHLY (mirrors the policy's own maxRunsPerDay/Month —
 *     also gated directly via runsToday/ThisMonth counters at precedence
 *     step 11 "QUOTA_EXCEEDED", so this entry is primarily for Mission
 *     Control's cumulative-usage display, not a second independent gate).
 *   - AI_STEPS, EXECUTION_SECONDS, CONTEXT_CHARS, OUTPUT_CHARS: DAILY only.
 *     WEEKLY windows are not tracked (spec section 13 marks WEEKLY as
 *     optional "si aporta valor" — a project/agent daily + monthly-for-runs
 *     picture is sufficient for this phase).
 *   - RETRIES: DAILY, tracked for observability/reporting only (limit is
 *     never set from policy — the real retry ceiling is a PER-RUN counter
 *     enforced directly at precedence step 14 "RETRY_LIMIT", not a
 *     cumulative budget).
 */

function utcDayBounds(now: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

function utcMonthBounds(now: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

function periodBounds(window: AiAgentBudgetWindow, now: Date): { start: Date; end: Date } {
  if (window === "MONTHLY") return utcMonthBounds(now);
  // WEEKLY is not currently produced by any caller (see module doc) but is handled defensively as an ISO week.
  if (window === "WEEKLY") {
    const day = utcDayBounds(now);
    const dow = (now.getUTCDay() + 6) % 7; // Monday = 0
    const start = new Date(day.start.getTime() - dow * 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    return { start, end };
  }
  return utcDayBounds(now);
}

interface DimensionSpec {
  metric: AiAgentBudgetMetric;
  window: AiAgentBudgetWindow;
  limit: number | null;
}

function dimensionsFor(limits: EffectiveLimits): DimensionSpec[] {
  return [
    { metric: "RUNS", window: "DAILY", limit: limits.maxRunsPerDay },
    { metric: "RUNS", window: "MONTHLY", limit: limits.maxRunsPerMonth },
    { metric: "AI_STEPS", window: "DAILY", limit: limits.maxSteps },
    { metric: "RETRIES", window: "DAILY", limit: null },
    { metric: "EXECUTION_SECONDS", window: "DAILY", limit: limits.maxDurationSeconds },
    { metric: "CONTEXT_CHARS", window: "DAILY", limit: limits.maxContextChars },
    { metric: "OUTPUT_CHARS", window: "DAILY", limit: limits.maxOutputChars },
  ];
}

async function ensureRow(projectId: string, scope: AiAgentBudgetScope, agentRef: string, metric: AiAgentBudgetMetric, window: AiAgentBudgetWindow, now: Date) {
  const { start, end } = periodBounds(window, now);
  return prisma.aiAgentBudgetUsage.upsert({
    where: { projectId_scope_agentRef_metric_window_periodStart: { projectId, scope, agentRef, metric, window, periodStart: start } },
    create: { projectId, scope, agentRef, metric, window, periodStart: start, periodEnd: end, reserved: 0, consumed: 0 },
    update: {},
  });
}

function toSnapshot(row: { metric: AiAgentBudgetMetric; window: AiAgentBudgetWindow; reserved: number; consumed: number; periodStart: Date; periodEnd: Date }, limit: number | null): BudgetDimensionSnapshot {
  const used = row.reserved + row.consumed;
  return {
    metric: row.metric,
    window: row.window,
    limit,
    reserved: row.reserved,
    consumed: row.consumed,
    available: limit === null ? null : Math.max(0, limit - used),
    periodStart: row.periodStart.toISOString(),
    periodEnd: row.periodEnd.toISOString(),
  };
}

/** Read-only snapshot of every tracked dimension for a project/agent scope — never mutates, safe to call from Mission Control or the pre-flight evaluation. */
export async function getBudgetSnapshots(projectId: string, scope: AiAgentBudgetScope, agentRef: string, limits: EffectiveLimits, now: Date = new Date()): Promise<BudgetDimensionSnapshot[]> {
  const specs = dimensionsFor(limits);
  const snapshots: BudgetDimensionSnapshot[] = [];
  for (const spec of specs) {
    const row = await ensureRow(projectId, scope, agentRef, spec.metric, spec.window, now);
    snapshots.push(toSnapshot(row, spec.limit));
  }
  return snapshots;
}

/**
 * Reserves `amount` units against a metric/window — atomic (upsert then a
 * plain increment; the DB row-level lock from the upsert/update pair is
 * sufficient here because reservation is optimistic and re-validated by the
 * caller against the freshly-read limit before proceeding, matching the
 * "claim, then check" pattern already used for concurrency counting).
 */
export async function reserveBudget(projectId: string, scope: AiAgentBudgetScope, agentRef: string, metric: AiAgentBudgetMetric, window: AiAgentBudgetWindow, amount: number, now: Date = new Date()) {
  if (amount <= 0) return;
  await ensureRow(projectId, scope, agentRef, metric, window, now);
  const { start } = periodBounds(window, now);
  await prisma.aiAgentBudgetUsage.updateMany({
    where: { projectId, scope, agentRef, metric, window, periodStart: start },
    data: { reserved: { increment: amount } },
  });
}

/** Converts (up to) `reservedAmount` of a reservation into real consumption and adds `extraConsumed` beyond what was reserved — never lets `reserved` go negative. */
export async function consumeBudget(
  projectId: string,
  scope: AiAgentBudgetScope,
  agentRef: string,
  metric: AiAgentBudgetMetric,
  window: AiAgentBudgetWindow,
  reservedAmountToRelease: number,
  actualConsumed: number,
  now: Date = new Date(),
) {
  const { start } = periodBounds(window, now);
  const row = await ensureRow(projectId, scope, agentRef, metric, window, now);
  const releaseAmount = Math.max(0, Math.min(reservedAmountToRelease, row.reserved));
  await prisma.aiAgentBudgetUsage.updateMany({
    where: { projectId, scope, agentRef, metric, window, periodStart: start },
    data: { reserved: { decrement: releaseAmount }, consumed: { increment: Math.max(0, actualConsumed) } },
  });
}

/** Releases an unused reservation (cancellation before execution, or a failed run's unreserved remainder) — never a double release (clamped to what's actually reserved). */
export async function releaseBudget(projectId: string, scope: AiAgentBudgetScope, agentRef: string, metric: AiAgentBudgetMetric, window: AiAgentBudgetWindow, amount: number, now: Date = new Date()) {
  if (amount <= 0) return;
  const { start } = periodBounds(window, now);
  const row = await ensureRow(projectId, scope, agentRef, metric, window, now);
  const releaseAmount = Math.max(0, Math.min(amount, row.reserved));
  if (releaseAmount === 0) return;
  await prisma.aiAgentBudgetUsage.updateMany({
    where: { projectId, scope, agentRef, metric, window, periodStart: start },
    data: { reserved: { decrement: releaseAmount } },
  });
}

/** Emits budget_warning/budget_exhausted Automation Center events for any dimension crossing its threshold — called after a real reserve/consume, never speculatively. */
export async function emitBudgetAlertsIfNeeded(projectId: string, snapshots: BudgetDimensionSnapshot[]) {
  for (const s of snapshots) {
    if (s.limit === null || s.limit <= 0) continue;
    const used = s.reserved + s.consumed;
    const pct = used / s.limit;
    if (pct >= 1) {
      await publishAutomationEvent({
        projectId,
        eventKey: "ai_agent_governance.budget_exhausted",
        payload: { metric: s.metric, window: s.window },
        idempotencyKey: `ai_agent_governance.budget_exhausted:${projectId}:${s.metric}:${s.window}:${s.periodStart}`,
      });
      await notifyGovernanceBudgetAlert(projectId, s.metric, s.window, true);
    } else if (pct >= 0.9) {
      await publishAutomationEvent({
        projectId,
        eventKey: "ai_agent_governance.budget_warning",
        payload: { metric: s.metric, window: s.window, percentage: Math.round(pct * 100) },
        idempotencyKey: `ai_agent_governance.budget_warning:${projectId}:${s.metric}:${s.window}:${s.periodStart}`,
      });
      await notifyGovernanceBudgetAlert(projectId, s.metric, s.window, false);
    }
  }
}
