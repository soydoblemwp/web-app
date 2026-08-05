import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { AiAgentRun, AiAgentRunStep } from "@/generated/prisma/client";
import { classifyAgentModeRisk } from "@/lib/agents/governance-risk";
import { evaluateRunGovernance, recordRunGovernanceSnapshot } from "@/server/services/agent-governance";
import { reserveBudget, consumeBudget, releaseBudget } from "@/server/services/agent-governance-budget";
import { refreshProgress, finalizeIfAllStepsResolved, failRunAndSkipRemaining } from "@/server/services/agent-run-lifecycle";
import { buildChatTurnContext, decideChatResponse, finalizeAiAnswer, type DeterministicAnswer, type NeedsGenerationAnswer } from "@/server/services/customer-support-chat";

/**
 * AI Agent Studio integration for customer-support-agent (Fase 40 spec
 * section 7) — the ONLY place this feature creates/completes an AiAgentRun,
 * always through the real classifyAgentModeRisk/evaluateRunGovernance/
 * budget functions the rest of AI Agent Studio uses. Two entry shapes,
 * sharing the exact same decision logic (customer-support-chat.ts) and the
 * exact same AiAgentRun/AiAgentRunStep tables — never a second engine:
 *
 *   1. Dashboard test mode (spec section 22) drives the REAL, full
 *      orchestrator (createDraftRun -> confirmRun -> startRun ->
 *      prepareNextStep -> completeAiStep, src/server/services/
 *      agent-orchestrator.ts) exactly like every other official agent.
 *      `prepareCustomerSupportStep`/`completeCustomerSupportStep` below are
 *      the per-agent hooks that orchestrator dispatches to, the same
 *      pattern src/server/services/agent-performance-strategist.ts already
 *      established for a bespoke (non-marker-field) output shape.
 *   2. The public widget endpoint has no live human to run a draft/confirm/
 *      approval form through for a single already-typed chat message, so
 *      `startPublicSupportRun`/`completePublicSupportRun` call the SAME
 *      governance/budget primitives directly rather than the heavier
 *      multi-step form machinery — a documented, honest adaptation, not a
 *      rival execution path (see README note in customer-support-chat.ts).
 */

const CUSTOMER_SUPPORT_AGENT_KEY = "customer-support-agent";

interface PrepareResult {
  error?: string;
  done?: boolean;
  runFinalStatus?: string;
  ai?: { stepOrder: number; systemPrompt: string; userPrompt: string; executionToken: string };
}
interface CompleteResult {
  error?: string;
  done?: boolean;
  runFinalStatus?: string;
}

// ---------------------------------------------------------------------------
// 1. Dashboard test-mode hooks (dispatched from agent-orchestrator.ts)
// ---------------------------------------------------------------------------

export async function prepareCustomerSupportStep(projectId: string, userId: string, run: AiAgentRun, step: AiAgentRunStep): Promise<PrepareResult> {
  const values = ((run.approvedInput ?? run.input) as unknown as { values?: Record<string, unknown> } | null)?.values ?? {};
  const question = typeof values.visitorQuestion === "string" ? values.visitorQuestion.trim() : "";
  if (!question) {
    await failRunAndSkipRemaining(run, step.id, "Escribe una pregunta para probar el agente.", "VALIDATION");
    return { error: "Escribe una pregunta para probar el agente." };
  }

  const governance = await evaluateRunGovernance({
    projectId,
    userId,
    hasProjectAccess: true,
    agentRef: CUSTOMER_SUPPORT_AGENT_KEY,
    mode: null,
    operationType: "PREPARE_STEP",
    riskLevel: classifyAgentModeRisk(CUSTOMER_SUPPORT_AGENT_KEY, null),
  });
  if (governance.decision !== "ALLOW") return { error: governance.reason };

  const ctx = await buildChatTurnContext(projectId, question, "es");
  const decision = decideChatResponse(ctx, question, true);

  if (decision.kind === "DETERMINISTIC") {
    await completeDeterministicStep(run, step, decision);
    const finalStatus = await finalizeIfAllStepsResolved(run);
    return { done: true, runFinalStatus: finalStatus ?? undefined };
  }

  const executionToken = randomUUID();
  await prisma.aiAgentRunStep.update({
    where: { id: step.id },
    data: { executionToken, input: { values: { visitorQuestion: question }, pending: decision } as unknown as Prisma.InputJsonValue },
  });
  return { ai: { stepOrder: step.order, systemPrompt: decision.systemPrompt, userPrompt: decision.userPrompt, executionToken } };
}

export async function completeCustomerSupportStep(projectId: string, userId: string, run: AiAgentRun, step: AiAgentRunStep, output: string, executionToken: string): Promise<CompleteResult> {
  if (step.executionToken !== executionToken) return { error: "Este intento ya no es valido (la ejecucion avanzo o se reanudo desde entonces)." };
  if (!output.trim()) return { error: "La generacion no produjo ningun resultado." };

  const stepInput = (step.input as unknown as { pending?: NeedsGenerationAnswer } | null) ?? {};
  if (!stepInput.pending) {
    await failRunAndSkipRemaining(run, step.id, "Estado inconsistente: no hay una generacion pendiente para este paso.", "INTERNAL_SAFE");
    return { error: "Estado inconsistente." };
  }

  // customer-support-agent is always READ_ONLY (governance-risk.ts) — it never persists a real
  // content/campaign/social resource, only a conversation transcript row, so (matching
  // agent-performance-strategist.ts's ANALYZE-mode precedent) there is no COMPLETE_WRITE gate here.
  const answer = finalizeAiAnswer(stepInput.pending, output);
  await completeDeterministicStep(run, step, answer);
  const finalStatus = await finalizeIfAllStepsResolved(run);
  return { done: true, runFinalStatus: finalStatus ?? undefined };
}

async function completeDeterministicStep(run: AiAgentRun, step: AiAgentRunStep, answer: DeterministicAnswer) {
  await prisma.aiAgentRunStep.update({
    where: { id: step.id },
    data: { status: "COMPLETED", output: answer as unknown as Prisma.InputJsonValue, completedAt: new Date(), executionToken: null },
  });
  await consumeBudget(run.projectId, "PROJECT", "", "AI_STEPS", "DAILY", 1, 1);
  await refreshProgress(run.id);
}

// ---------------------------------------------------------------------------
// 2. Public widget single-shot path
// ---------------------------------------------------------------------------

export type PublicTurnStart =
  | { kind: "DENIED"; reason: string }
  | { kind: "ANSWERED"; runId: string; answer: DeterministicAnswer }
  | { kind: "GENERATING"; runId: string; executionToken: string; systemPrompt: string; userPrompt: string };

/** `actingUserId` is the project OWNER — the same "system-provisioned attribution" precedent as agent-catalog.ts's ensureOfficialTeamBlueprints, since a public visitor has no User row to attribute the run to. `clientSupportsLocalAI` is reported by the widget itself (isWebGPUSupported()) — never assumed. */
export async function startPublicSupportRun(projectId: string, actingUserId: string, question: string, language: string, clientSupportsLocalAI: boolean): Promise<PublicTurnStart> {
  const governance = await evaluateRunGovernance({
    projectId,
    userId: actingUserId,
    hasProjectAccess: true,
    agentRef: CUSTOMER_SUPPORT_AGENT_KEY,
    mode: null,
    operationType: "CREATE_RUN",
    riskLevel: classifyAgentModeRisk(CUSTOMER_SUPPORT_AGENT_KEY, null),
    contextChars: question.length,
  });
  if (governance.decision !== "ALLOW") return { kind: "DENIED", reason: governance.reason };

  const run = await prisma.aiAgentRun.create({
    data: {
      projectId,
      createdById: actingUserId,
      officialAgentKey: CUSTOMER_SUPPORT_AGENT_KEY,
      idempotencyKey: randomUUID(),
      status: "RUNNING",
      startedAt: new Date(),
      currentStepOrder: 0,
      input: { values: { visitorQuestion: question }, context: {} } as unknown as Prisma.InputJsonValue,
      approvedInput: { values: { visitorQuestion: question }, context: {} } as unknown as Prisma.InputJsonValue,
    },
  });
  await recordRunGovernanceSnapshot(run.id, projectId, governance, null);
  await reserveBudget(projectId, "PROJECT", "", "RUNS", "DAILY", 1);
  await reserveBudget(projectId, "PROJECT", "", "RUNS", "MONTHLY", 1);
  await consumeBudget(projectId, "PROJECT", "", "RUNS", "DAILY", 1, 1);
  await consumeBudget(projectId, "PROJECT", "", "RUNS", "MONTHLY", 1, 1);

  const step = await prisma.aiAgentRunStep.create({
    data: { runId: run.id, order: 0, agentRef: CUSTOMER_SUPPORT_AGENT_KEY, status: "RUNNING", startedAt: new Date(), attemptCount: 1 },
  });

  const ctx = await buildChatTurnContext(projectId, question, language);
  const decision = decideChatResponse(ctx, question, clientSupportsLocalAI);

  if (decision.kind === "DETERMINISTIC") {
    await prisma.aiAgentRunStep.update({ where: { id: step.id }, data: { status: "COMPLETED", output: decision as unknown as Prisma.InputJsonValue, completedAt: new Date() } });
    await prisma.aiAgentRun.update({ where: { id: run.id }, data: { status: "COMPLETED", completedAt: new Date(), progressPercent: 100 } });
    return { kind: "ANSWERED", runId: run.id, answer: decision };
  }

  const executionToken = randomUUID();
  await prisma.aiAgentRunStep.update({
    where: { id: step.id },
    data: { executionToken, input: { values: { visitorQuestion: question }, pending: decision } as unknown as Prisma.InputJsonValue },
  });
  return { kind: "GENERATING", runId: run.id, executionToken, systemPrompt: decision.systemPrompt, userPrompt: decision.userPrompt };
}

export type PublicTurnComplete = { error: string } | { answer: DeterministicAnswer };

export async function completePublicSupportRun(projectId: string, runId: string, executionToken: string, output: string): Promise<PublicTurnComplete> {
  const run = await prisma.aiAgentRun.findUnique({ where: { id: runId }, include: { steps: true } });
  if (!run || run.projectId !== projectId) return { error: "Ejecucion no encontrada." };
  const step = run.steps.find((s) => s.status === "RUNNING");
  if (!step || step.executionToken !== executionToken) return { error: "Este intento ya no es valido." };
  if (!output.trim()) return { error: "La generacion no produjo ningun resultado." };

  const stepInput = (step.input as unknown as { pending?: NeedsGenerationAnswer } | null) ?? {};
  if (!stepInput.pending) return { error: "Estado inconsistente." };

  const answer = finalizeAiAnswer(stepInput.pending, output);
  await prisma.aiAgentRunStep.update({ where: { id: step.id }, data: { status: "COMPLETED", output: answer as unknown as Prisma.InputJsonValue, completedAt: new Date(), executionToken: null } });
  await prisma.aiAgentRun.update({ where: { id: runId }, data: { status: "COMPLETED", completedAt: new Date(), progressPercent: 100 } });
  await consumeBudget(projectId, "PROJECT", "", "AI_STEPS", "DAILY", 1, 1);
  await consumeBudget(projectId, "PROJECT", "", "OUTPUT_CHARS", "DAILY", 0, output.length);
  return { answer };
}

export async function failPublicSupportRun(projectId: string, runId: string, executionToken: string, reason: string): Promise<void> {
  const run = await prisma.aiAgentRun.findUnique({ where: { id: runId }, include: { steps: true } });
  if (!run || run.projectId !== projectId) return;
  const step = run.steps.find((s) => s.status === "RUNNING");
  if (!step || step.executionToken !== executionToken) return;
  await releaseBudget(projectId, "PROJECT", "", "RUNS", "DAILY", 1);
  await prisma.$transaction([
    prisma.aiAgentRunStep.update({ where: { id: step.id }, data: { status: "FAILED", errorMessage: reason.slice(0, 500), errorCategory: "AI", completedAt: new Date(), executionToken: null } }),
    prisma.aiAgentRun.update({ where: { id: runId }, data: { status: "FAILED", completedAt: new Date(), lastErrorMessage: reason.slice(0, 500), lastErrorCategory: "AI" } }),
  ]);
}
