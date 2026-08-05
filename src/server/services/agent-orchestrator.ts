import "server-only";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { AiAgentRun, AiAgentRunStep } from "@/generated/prisma/client";
import { resolveAgent, type ResolvedAgent } from "@/server/services/agent-catalog";
import { resolveAgentContext } from "@/server/services/agent-context";
import { buildMemoryInstructions } from "@/server/services/agent-memory";
import { buildAgentPrompt, parseAndValidateAgentOutput, attachDeterministicSeoScore } from "@/server/services/agent-stages";
import { buildInputZodSchema } from "@/lib/agents/dynamic-form";
import { buildBrandProfileContext } from "@/lib/brand-profiles/context";
import { isRunTerminal } from "@/lib/agents/state-machine";
import type { AgentContextSelection } from "@/lib/agents/types";
import { refreshProgress, finalizeIfAllStepsResolved, failRunAndSkipRemaining } from "@/server/services/agent-run-lifecycle";
import { preparePerformanceStrategistStep, completePerformanceStrategistStep } from "@/server/services/agent-performance-strategist";
import { prepareCustomerSupportStep, completeCustomerSupportStep } from "@/server/services/agent-customer-support";
import { classifyAgentModeRisk } from "@/lib/agents/governance-risk";
import { evaluateRunGovernance, recordRunGovernanceSnapshot } from "@/server/services/agent-governance";
import { createApprovalRequest, findValidApprovalForRun } from "@/server/services/agent-governance-approvals";
import { reserveBudget, consumeBudget, releaseBudget } from "@/server/services/agent-governance-budget";

/** `AiAgentRun` has no single agentRef column — governance keys overrides/state by whichever of officialAgentKey/customAgentId/teamId is actually set. */
function agentRefOf(run: { officialAgentKey: string | null; customAgentId: string | null; teamId: string | null }): string {
  return run.officialAgentKey ?? run.customAgentId ?? run.teamId ?? "";
}

function runPath(projectId: string, runId?: string) {
  return runId ? `/dashboard/${projectId}/agents/runs/${runId}` : `/dashboard/${projectId}/agents`;
}

async function getOwnedRun(runId: string, projectId: string) {
  const run = await prisma.aiAgentRun.findUnique({
    where: { id: runId },
    include: { steps: { orderBy: { order: "asc" } }, team: { include: { members: { orderBy: { order: "asc" } } } } },
  });
  if (!run || run.projectId !== projectId) return null;
  return run;
}
type OwnedRun = NonNullable<Awaited<ReturnType<typeof getOwnedRun>>>;

interface StepInput {
  values: Record<string, unknown>;
  context: AgentContextSelection;
}
function inputOf(run: Pick<AiAgentRun, "input">): StepInput {
  return run.input as unknown as StepInput;
}
function approvedInputOf(run: AiAgentRun): StepInput {
  return (run.approvedInput ?? run.input) as unknown as StepInput;
}

// ---------------------------------------------------------------------------
// Draft creation, input autosave, confirm/start
// ---------------------------------------------------------------------------

export async function createDraftRun(
  projectId: string,
  userId: string,
  idempotencyKey: string,
  target: { officialAgentKey?: string | null; customAgentId?: string | null; teamId?: string | null }
) {
  const created = await prisma.aiAgentRun.upsert({
    where: { createdById_idempotencyKey: { createdById: userId, idempotencyKey } },
    create: {
      projectId,
      createdById: userId,
      idempotencyKey,
      officialAgentKey: target.officialAgentKey ?? null,
      customAgentId: target.customAgentId ?? null,
      teamId: target.teamId ?? null,
      status: "DRAFT",
      input: { values: {}, context: {} } as unknown as Prisma.InputJsonValue,
    },
    update: {},
  });
  if (created.projectId !== projectId) return { error: "Esta clave ya se usó en otro proyecto." };
  revalidatePath(runPath(projectId));
  return { id: created.id };
}

export async function updateRunInput(projectId: string, runId: string, values: Record<string, unknown>, context: Partial<AgentContextSelection>) {
  const run = await getOwnedRun(runId, projectId);
  if (!run) return { error: "Ejecución no encontrada." };
  if (run.status !== "DRAFT" && run.status !== "READY") return { error: "La entrada no se puede editar mientras la ejecución está en curso o ya finalizó." };

  const current = inputOf(run);
  const merged: StepInput = { values: { ...current.values, ...values }, context: { ...current.context, ...context } };
  await prisma.aiAgentRun.update({
    where: { id: runId },
    data: { input: merged as unknown as Prisma.InputJsonValue, ...(run.status === "READY" ? { status: "DRAFT" } : {}) },
  });
  revalidatePath(runPath(projectId, runId));
  return {};
}

/** Validates required inputs, snapshots approvedInput, creates the step rows, moves to READY. Safe to re-call while unstarted. */
export async function confirmRun(projectId: string, runId: string, userId: string) {
  const run = await getOwnedRun(runId, projectId);
  if (!run) return { error: "Ejecución no encontrada." };
  if (run.status !== "DRAFT" && run.status !== "READY") return { error: "Esta ejecución ya no se puede confirmar." };

  const draft = inputOf(run);

  let stepAgentRefs: { agentRef: string; requiresApproval: boolean }[];
  if (run.teamId) {
    if (!run.team) return { error: "Equipo no encontrado." };
    const enabled = run.team.members.filter((m) => m.enabled);
    if (enabled.length === 0) return { error: "El equipo no tiene agentes activos." };
    stepAgentRefs = enabled.map((m) => ({ agentRef: m.agentRef, requiresApproval: m.requireApproval }));
  } else {
    const ref = run.officialAgentKey ?? run.customAgentId;
    if (!ref) return { error: "Esta ejecución no tiene un agente asignado." };
    const agent = await resolveAgent(projectId, ref);
    if (!agent) return { error: "El agente seleccionado ya no está disponible." };
    stepAgentRefs = [{ agentRef: ref, requiresApproval: agent.requireApproval }];
  }

  const entryAgent = await resolveAgent(projectId, stepAgentRefs[0].agentRef);
  if (!entryAgent) return { error: "El primer agente del flujo ya no está disponible." };
  const inputSchema = buildInputZodSchema([...entryAgent.requiredInputs, ...entryAgent.optionalInputs]);
  const parsed = inputSchema.safeParse(draft.values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Completa los campos obligatorios del primer agente." };

  if (draft.context.brandProfileId) {
    const profile = await prisma.brandProfile.findUnique({ where: { id: draft.context.brandProfileId } });
    if (!profile || profile.userId !== userId) return { error: "El Brand Profile seleccionado no está disponible para este usuario." };
  }

  // Governance gate (Fase 37 spec section 18: "antes de crear una ejecución"). `confirmRun` is the
  // real commit point — createDraftRun only opens an empty, uncounted form. Re-evaluated again at
  // startRun (input is still editable between confirm and start).
  const agentRef = agentRefOf(run);
  const modeValue = stepAgentRefs[0].agentRef === "performance-strategist" && typeof draft.values.mode === "string" ? draft.values.mode : null;
  const riskLevel = classifyAgentModeRisk(agentRef, modeValue);
  const contextChars = JSON.stringify(draft.values ?? {}).length;
  const governance = await evaluateRunGovernance({
    projectId,
    userId,
    hasProjectAccess: true,
    agentRef,
    mode: modeValue,
    operationType: "CREATE_RUN",
    riskLevel,
    contextChars,
  });
  if (governance.decision === "DENY") return { error: governance.reason };
  if (governance.decision === "REQUIRE_APPROVAL") {
    if (governance.policyId === null || governance.policyVersion === null) return { error: governance.reason };
    await createApprovalRequest({
      projectId,
      requestedById: userId,
      agentRef,
      mode: modeValue,
      riskLevel: governance.riskLevel,
      sanitizedInput: draft.values,
      reason: governance.reason,
      policyId: governance.policyId,
      policyVersion: governance.policyVersion,
      idempotencyKey: `confirm-run:${runId}`,
    });
    return { error: "Esta ejecución requiere aprobación humana antes de poder confirmarse. Revisa Mission Control para aprobarla.", requiresApproval: true };
  }

  await prisma.$transaction([
    prisma.aiAgentRunStep.deleteMany({ where: { runId } }),
    prisma.aiAgentApproval.deleteMany({ where: { runId } }),
    prisma.aiAgentRun.update({
      where: { id: runId },
      data: { approvedInput: draft as unknown as Prisma.InputJsonValue, status: "READY", currentStepOrder: null },
    }),
    prisma.aiAgentRunStep.createMany({
      data: stepAgentRefs.map((s, order) => ({ runId, order, agentRef: s.agentRef, requiresApproval: s.requiresApproval })),
    }),
  ]);

  revalidatePath(runPath(projectId, runId));
  return {};
}

export async function startRun(projectId: string, runId: string, userId: string) {
  const run = await getOwnedRun(runId, projectId);
  if (!run) return { error: "Ejecución no encontrada." };
  if (run.status !== "READY") return { error: "Esta ejecución no está lista para iniciarse." };

  // Second, final governance gate (Fase 37 spec sections 12/18: "antes de iniciar una ejecución" +
  // re-validar tras la aprobación) — input is frozen (approvedInput) by now, so this is where the
  // immutable per-run decision snapshot is taken and the RUNS budget is actually reserved+consumed.
  const approvedInput = approvedInputOf(run);
  const agentRef = agentRefOf(run);
  const modeValue = run.officialAgentKey === "performance-strategist" && typeof approvedInput.values.mode === "string" ? approvedInput.values.mode : null;
  const riskLevel = classifyAgentModeRisk(agentRef, modeValue);
  const priorApproval = await findValidApprovalForRun(projectId, agentRef, modeValue, userId);
  const governance = await evaluateRunGovernance({
    projectId,
    userId,
    hasProjectAccess: true,
    agentRef,
    mode: modeValue,
    operationType: "CREATE_RUN",
    riskLevel,
    contextChars: JSON.stringify(approvedInput.values ?? {}).length,
    preApprovedRequestId: priorApproval?.id ?? null,
  });
  if (governance.decision !== "ALLOW") {
    await recordRunGovernanceSnapshot(runId, projectId, governance, priorApproval?.id ?? null).catch(() => null);
    return { error: governance.reason };
  }

  await prisma.aiAgentRun.update({ where: { id: runId }, data: { status: "RUNNING", startedAt: run.startedAt ?? new Date(), currentStepOrder: 0 } });
  await recordRunGovernanceSnapshot(runId, projectId, governance, priorApproval?.id ?? null);
  if (priorApproval) await prisma.aiAgentGovernanceApproval.update({ where: { id: priorApproval.id }, data: { createdRunId: runId } }).catch(() => null);
  await reserveBudget(projectId, "PROJECT", "", "RUNS", "DAILY", 1);
  await reserveBudget(projectId, "PROJECT", "", "RUNS", "MONTHLY", 1);
  await consumeBudget(projectId, "PROJECT", "", "RUNS", "DAILY", 1, 1);
  await consumeBudget(projectId, "PROJECT", "", "RUNS", "MONTHLY", 1, 1);
  revalidatePath(runPath(projectId, runId));
  return {};
}

// ---------------------------------------------------------------------------
// Progress + finalization
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Transfer between agents (spec section 11) — the previous step's output
// becomes CONTEXT for the next one; when the next agent's required input
// includes a content_item reference the previous step didn't already
// satisfy, an intermediate ContentItem is created (once, idempotently) so
// the reference is real and traceable rather than silently dropped.
// ---------------------------------------------------------------------------

async function prepareStepInput(projectId: string, userId: string, run: OwnedRun, step: AiAgentRunStep, nextAgent: ResolvedAgent): Promise<{ error?: string; input?: StepInput }> {
  if (step.order === 0) return { input: approvedInputOf(run) };

  const previousStep = await prisma.aiAgentRunStep.findFirst({ where: { runId: run.id, order: step.order - 1 } });
  if (!previousStep || previousStep.status !== "COMPLETED" || !previousStep.output) {
    return { error: "El paso anterior no produjo un resultado válido para transferir." };
  }
  const previousOutput = previousStep.output as Record<string, unknown>;
  const base = approvedInputOf(run);

  const needsContentItem = nextAgent.requiredInputs.some((f) => f.type === "content_item");
  const values: Record<string, unknown> = { ...base.values };

  if (needsContentItem && !values.sourceContentItemId && !values.contentItemId) {
    const existingResource = await prisma.aiAgentResource.findFirst({ where: { runId: run.id, stepId: previousStep.id, type: "CONTENT_ITEM" } });
    let contentItemId = existingResource?.contentItemId ?? null;

    if (!contentItemId) {
      const title = (previousOutput.title as string | undefined) || `Resultado de ${previousStep.agentRef}`;
      const body = (previousOutput.body as string | undefined) || (previousOutput.correctedBody as string | undefined) || JSON.stringify(previousOutput);
      const contentItem = await prisma.contentItem.create({
        data: { projectId, authorId: userId, type: "OTHER", title: title.slice(0, 300), body, sourceTool: "agent-studio" },
      });
      await prisma.aiAgentResource.create({
        data: { runId: run.id, stepId: previousStep.id, type: "CONTENT_ITEM", action: "CREATED", contentItemId: contentItem.id },
      });
      contentItemId = contentItem.id;
    }
    const targetKey = nextAgent.requiredInputs.find((f) => f.type === "content_item")!.key;
    values[targetKey] = contentItemId;
  }

  return { input: { values, context: { ...base.context, previousRunIds: [] } } };
}

// ---------------------------------------------------------------------------
// The executor
// ---------------------------------------------------------------------------

export interface ExecutorState {
  error?: string;
  done?: boolean;
  waitingForApproval?: { stepOrder: number; agentRef: string; comment: string | null; rejected: boolean };
  runFinalStatus?: string;
  ai?: { stepOrder: number; systemPrompt: string; userPrompt: string; executionToken: string };
}

export async function prepareNextStep(projectId: string, runId: string, userId: string): Promise<ExecutorState> {
  const run = await getOwnedRun(runId, projectId);
  if (!run) return { error: "Ejecución no encontrada." };

  if (run.status === "WAITING_FOR_APPROVAL") {
    const gateStep = run.steps.find((s) => s.status === "WAITING_FOR_APPROVAL");
    if (!gateStep) return { error: "Estado inconsistente: no se encontró el paso en espera de aprobación." };
    const approval = await prisma.aiAgentApproval.findUnique({ where: { runId_stepOrder: { runId, stepOrder: gateStep.order } } });
    return {
      waitingForApproval: {
        stepOrder: gateStep.order,
        agentRef: gateStep.agentRef,
        comment: approval?.comment ?? null,
        rejected: approval?.status === "REJECTED" || approval?.status === "CHANGES_REQUESTED",
      },
    };
  }

  if (run.status !== "RUNNING") return { error: "Esta ejecución no está en curso." };

  const step = run.steps.find((s) => s.status === "PENDING" || s.status === "RUNNING");
  if (!step) {
    const finalStatus = await finalizeIfAllStepsResolved(run);
    return { done: true, runFinalStatus: finalStatus ?? undefined };
  }

  const agent = await resolveAgent(projectId, step.agentRef);
  if (!agent) {
    await failRunAndSkipRemaining(run, step.id, `El agente "${step.agentRef}" ya no está disponible.`, "DEPENDENCY");
    return { error: `El agente "${step.agentRef}" ya no está disponible.` };
  }

  // Governance gate before claiming this step (spec section 18: "antes de reclamar un paso"). Left
  // untouched — no failRunAndSkipRemaining — because a DENY here is very often transient (project/agent
  // paused, emergency stop, concurrency, budget): the step stays PENDING and a later call can succeed
  // once the condition clears. performance-strategist has its OWN, more precise per-mode gate inside
  // preparePerformanceStrategistStep (mode isn't known generically — ANALYZE is READ_ONLY, everything
  // else is DRAFT_WRITE), so it's intentionally skipped here to avoid double-gating on the wrong risk.
  if (step.agentRef !== "performance-strategist") {
    const riskLevel = classifyAgentModeRisk(step.agentRef, null);
    const governance = await evaluateRunGovernance({ projectId, userId, hasProjectAccess: true, agentRef: step.agentRef, mode: null, operationType: "PREPARE_STEP", riskLevel });
    if (governance.decision !== "ALLOW") return { error: governance.reason };
  }

  if (step.requiresApproval) {
    const approval = await prisma.aiAgentApproval.upsert({
      where: { runId_stepOrder: { runId, stepOrder: step.order } },
      create: { runId, stepOrder: step.order, status: "PENDING" },
      update: {},
    });
    if (approval.status !== "APPROVED") {
      await prisma.$transaction([
        prisma.aiAgentRunStep.update({ where: { id: step.id }, data: { status: "WAITING_FOR_APPROVAL" } }),
        prisma.aiAgentRun.update({ where: { id: runId }, data: { status: "WAITING_FOR_APPROVAL", currentStepOrder: step.order } }),
      ]);
      return { waitingForApproval: { stepOrder: step.order, agentRef: step.agentRef, comment: approval.comment, rejected: approval.status === "REJECTED" || approval.status === "CHANGES_REQUESTED" } };
    }
  }

  const guard = await prisma.aiAgentRunStep.updateMany({
    where: { id: step.id, status: "PENDING" },
    data: { status: "RUNNING", startedAt: step.startedAt ?? new Date(), attemptCount: { increment: 1 } },
  });
  const freshStep = await prisma.aiAgentRunStep.findUniqueOrThrow({ where: { id: step.id } });
  if (guard.count === 0 && freshStep.status !== "RUNNING") {
    return { error: "Este paso ya se está ejecutando en otra pestaña." };
  }
  if (guard.count > 0) await reserveBudget(projectId, "PROJECT", "", "AI_STEPS", "DAILY", 1);

  // Performance Strategist (Fase 36) bypasses the generic marker-field prompt/parse engine entirely —
  // its output shape (a strategy brief + up to 3 heterogeneous scenarios, or a deterministic
  // measurement plan/review) genuinely cannot fit one flat/block record. Everything else about the
  // run (claiming, locks, idempotency, events, finalization) still flows through this SAME orchestrator.
  if (step.agentRef === "performance-strategist") {
    return preparePerformanceStrategistStep(projectId, userId, run, freshStep);
  }
  if (step.agentRef === "customer-support-agent") {
    return prepareCustomerSupportStep(projectId, userId, run, freshStep);
  }

  const prepared = await prepareStepInput(projectId, userId, run, freshStep, agent);
  if (prepared.error || !prepared.input) {
    await failRunAndSkipRemaining(run, freshStep.id, prepared.error ?? "No se pudo preparar la entrada de este paso.", "DEPENDENCY");
    return { error: prepared.error };
  }

  await prisma.aiAgentRunStep.update({ where: { id: freshStep.id }, data: { input: prepared.input as unknown as Prisma.InputJsonValue } });
  await prisma.aiAgentRun.update({ where: { id: runId }, data: { currentStepOrder: step.order } });

  const [contextItems, memoryInstructions, brandProfile] = await Promise.all([
    resolveAgentContext(projectId, userId, prepared.input.context),
    buildMemoryInstructions(projectId, step.agentRef),
    (agent.brandProfileId || prepared.input.context.brandProfileId)
      ? prisma.brandProfile.findUnique({ where: { id: agent.brandProfileId ?? prepared.input.context.brandProfileId! } })
      : Promise.resolve(null),
  ]);

  const extraInstructions: string[] = [];
  if (step.agentRef === "research-agent" && contextItems.length === 0) {
    extraInstructions.push("ADVERTENCIA: no se proporcionó ninguna fuente. Indica claramente en INFO_FALTANTE que no hay fuentes suficientes y limita HECHOS a lo aportado directamente por el usuario en el tema.");
  }

  const brandContext = brandProfile ? buildBrandProfileContext(brandProfile) : "";
  const { systemPrompt, userPrompt } = buildAgentPrompt({
    agentDefinition: { ...agent, key: step.agentRef } as never,
    inputValues: prepared.input.values,
    context: contextItems,
    brandContext,
    memoryInstructions,
    extraInstructions,
  });

  const executionToken = randomUUID();
  await prisma.aiAgentRunStep.update({ where: { id: freshStep.id }, data: { executionToken } });
  return { ai: { stepOrder: step.order, systemPrompt, userPrompt, executionToken } };
}

export async function completeAiStep(projectId: string, runId: string, userId: string, output: string, executionToken: string): Promise<ExecutorState> {
  const run = await getOwnedRun(runId, projectId);
  if (!run) return { error: "Ejecución no encontrada." };
  if (run.status !== "RUNNING") return { error: "Esta ejecución no está en curso." };

  const step = run.steps.find((s) => s.status === "RUNNING");
  if (!step || step.executionToken !== executionToken) return { error: "Este intento ya no es válido (la ejecución avanzó o se reanudó desde entonces)." };
  if (!output.trim()) return { error: "La generación no produjo ningún resultado." };

  if (step.agentRef === "performance-strategist") {
    return completePerformanceStrategistStep(projectId, userId, run, step, output, executionToken);
  }
  if (step.agentRef === "customer-support-agent") {
    return completeCustomerSupportStep(projectId, userId, run, step, output, executionToken);
  }

  const agent = await resolveAgent(projectId, step.agentRef);
  if (!agent) {
    await failRunAndSkipRemaining(run, step.id, `El agente "${step.agentRef}" ya no está disponible.`, "DEPENDENCY");
    return { error: "Agente no disponible." };
  }

  // Governance gate before persisting this write (spec section 18: "antes de completar una escritura
  // importante"). Every official agent besides performance-strategist's ANALYZE mode classifies as
  // DRAFT_WRITE (agent-orchestrator only ever persists structured JSON on the step — see
  // src/lib/agents/governance-risk.ts), so this effectively covers every real write this engine makes.
  const completeGovernance = await evaluateRunGovernance({
    projectId,
    userId,
    hasProjectAccess: true,
    agentRef: step.agentRef,
    mode: null,
    operationType: "COMPLETE_WRITE",
    riskLevel: classifyAgentModeRisk(step.agentRef, null),
    expectedOutputChars: output.length,
  });
  if (completeGovernance.decision !== "ALLOW") return { error: completeGovernance.reason };

  const outcome = parseAndValidateAgentOutput({ ...agent, key: step.agentRef } as never, output);
  if (outcome.status === "failed") {
    await consumeBudget(projectId, "PROJECT", "", "AI_STEPS", "DAILY", 1, 1);
    if (run.team?.errorStrategy === "CONTINUE_INDEPENDENT_BRANCHES") {
      await prisma.aiAgentRunStep.update({
        where: { id: step.id },
        data: { status: "FAILED", errorMessage: outcome.errorMessage, errorCategory: outcome.errorCategory, completedAt: new Date() },
      });
      await refreshProgress(run.id);
      const finalStatus = await finalizeIfAllStepsResolved(run);
      if (finalStatus) return { done: true, runFinalStatus: finalStatus };
      await prisma.aiAgentRun.update({ where: { id: runId }, data: { status: "RUNNING" } });
      return { done: true };
    }
    await failRunAndSkipRemaining(run, step.id, outcome.errorMessage ?? "La generación falló.", outcome.errorCategory ?? "OUTPUT_SCHEMA");
    return { error: outcome.errorMessage };
  }

  let finalOutput: NonNullable<typeof outcome.output> = outcome.output ?? {};
  if (step.agentRef === "seo-agent" && !Array.isArray(finalOutput)) {
    const input = step.input as unknown as StepInput | null;
    const contentItemId = input?.values?.contentItemId as string | undefined;
    if (contentItemId) finalOutput = await attachDeterministicSeoScore(contentItemId, finalOutput);
  }

  await prisma.aiAgentRunStep.update({
    where: { id: step.id },
    data: { status: "COMPLETED", output: finalOutput as unknown as Prisma.InputJsonValue, completedAt: new Date(), executionToken: null },
  });
  await consumeBudget(projectId, "PROJECT", "", "AI_STEPS", "DAILY", 1, 1);
  await consumeBudget(projectId, "PROJECT", "", "OUTPUT_CHARS", "DAILY", 0, output.length);
  await consumeBudget(projectId, "PROJECT", "", "CONTEXT_CHARS", "DAILY", 0, JSON.stringify(step.input ?? {}).length);
  await refreshProgress(run.id);

  const finalStatus = await finalizeIfAllStepsResolved(run);
  if (finalStatus) return { done: true, runFinalStatus: finalStatus };
  return { done: true };
}

export async function failAiStep(projectId: string, runId: string, executionToken: string, errorMessage: string) {
  const run = await getOwnedRun(runId, projectId);
  if (!run) return { error: "Ejecución no encontrada." };
  const step = run.steps.find((s) => s.status === "RUNNING");
  if (!step || step.executionToken !== executionToken) return {};
  // The client-side generation itself never produced usable output — the reserved AI_STEPS unit is
  // released, not consumed (spec section 14: "al fallar... liberar la parte no usada"), distinct from
  // completeAiStep's outcome.status === "failed" path where a real (if invalid) output WAS generated.
  await releaseBudget(projectId, "PROJECT", "", "AI_STEPS", "DAILY", 1);
  await failRunAndSkipRemaining(run, step.id, errorMessage || "La generación falló.", "AI");
  return {};
}

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

export async function decideApproval(
  projectId: string,
  runId: string,
  userId: string,
  stepOrder: number,
  decision: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED",
  comment: string,
  revisedOutput?: Record<string, unknown>
) {
  const run = await getOwnedRun(runId, projectId);
  if (!run) return { error: "Ejecución no encontrada." };
  const step = run.steps.find((s) => s.order === stepOrder);
  if (!step || step.status !== "WAITING_FOR_APPROVAL") return { error: "Este paso no está esperando aprobación." };

  await prisma.aiAgentApproval.upsert({
    where: { runId_stepOrder: { runId, stepOrder } },
    create: { runId, stepOrder, status: decision, decidedById: userId, decidedAt: new Date(), comment: comment || null, revisedOutput: revisedOutput as unknown as Prisma.InputJsonValue },
    update: { status: decision, decidedById: userId, decidedAt: new Date(), comment: comment || null, revisedOutput: revisedOutput as unknown as Prisma.InputJsonValue },
  });

  if (decision === "APPROVED") {
    if (revisedOutput && step.status === "WAITING_FOR_APPROVAL" && step.output) {
      await prisma.aiAgentRunStep.update({ where: { id: step.id }, data: { output: revisedOutput as unknown as Prisma.InputJsonValue } });
    }
    await prisma.$transaction([
      prisma.aiAgentRunStep.update({ where: { id: step.id }, data: { status: step.output ? "COMPLETED" : "PENDING", completedAt: step.output ? new Date() : null } }),
      prisma.aiAgentRun.update({ where: { id: runId }, data: { status: "RUNNING" } }),
    ]);
    await refreshProgress(runId);
    const refreshed = await getOwnedRun(runId, projectId);
    if (refreshed) await finalizeIfAllStepsResolved(refreshed);
  }
  revalidatePath(runPath(projectId, runId));
  return {};
}

// ---------------------------------------------------------------------------
// Retry / cancel / resume / duplicate / archive
// ---------------------------------------------------------------------------

export async function retryFailedStep(projectId: string, runId: string, userId: string, stepOrder: number) {
  const run = await getOwnedRun(runId, projectId);
  if (!run) return { error: "Ejecución no encontrada." };
  if (run.status !== "FAILED" && run.status !== "PARTIALLY_COMPLETED") return { error: "Solo se puede reintentar una ejecución fallida o parcialmente completada." };
  const step = run.steps.find((s) => s.order === stepOrder);
  if (!step || step.status !== "FAILED") return { error: "Este paso no falló — no hay nada que reintentar." };

  const governance = await evaluateRunGovernance({
    projectId,
    userId,
    hasProjectAccess: true,
    agentRef: step.agentRef,
    mode: null,
    operationType: "RETRY",
    riskLevel: classifyAgentModeRisk(step.agentRef, null),
    retryCount: run.attemptCount,
  });
  if (governance.decision !== "ALLOW") return { error: governance.reason };

  await prisma.$transaction([
    prisma.aiAgentRunStep.update({ where: { id: step.id }, data: { status: "PENDING", errorMessage: null, errorCategory: null } }),
    prisma.aiAgentRunStep.updateMany({ where: { runId, status: "SKIPPED" }, data: { status: "PENDING" } }),
    prisma.aiAgentRun.update({ where: { id: runId }, data: { status: "RUNNING", lastErrorMessage: null, lastErrorCategory: null, attemptCount: { increment: 1 } } }),
  ]);
  revalidatePath(runPath(projectId, runId));
  return {};
}

export async function cancelRun(projectId: string, runId: string) {
  const run = await getOwnedRun(runId, projectId);
  if (!run) return { error: "Ejecución no encontrada." };
  if (isRunTerminal(run.status)) return {};

  await prisma.$transaction([
    prisma.aiAgentRun.update({ where: { id: runId }, data: { status: "CANCELLED", cancelledAt: new Date(), completedAt: new Date() } }),
    prisma.aiAgentRunStep.updateMany({ where: { runId, status: { in: ["PENDING", "RUNNING", "WAITING_FOR_APPROVAL"] } }, data: { status: "CANCELLED" } }),
  ]);
  revalidatePath(runPath(projectId, runId));
  return {};
}

export async function resumeRun(projectId: string, runId: string, userId: string) {
  const run = await getOwnedRun(runId, projectId);
  if (!run) return { error: "Ejecución no encontrada." };
  if (run.status !== "RUNNING" && run.status !== "WAITING_FOR_APPROVAL") return { error: "Esta ejecución no necesita reanudarse." };

  const agentRef = agentRefOf(run);
  const governance = await evaluateRunGovernance({
    projectId,
    userId,
    hasProjectAccess: true,
    agentRef,
    mode: null,
    operationType: "RESUME",
    riskLevel: classifyAgentModeRisk(agentRef, null),
  });
  if (governance.decision !== "ALLOW") return { error: governance.reason };

  const stuckStep = run.steps.find((s) => s.status === "RUNNING");
  if (stuckStep) await prisma.aiAgentRunStep.update({ where: { id: stuckStep.id }, data: { status: "PENDING", executionToken: null } });
  if (run.status !== "RUNNING") await prisma.aiAgentRun.update({ where: { id: runId }, data: { status: "RUNNING" } });
  revalidatePath(runPath(projectId, runId));
  return {};
}

export async function duplicateRun(projectId: string, userId: string, runId: string) {
  const run = await getOwnedRun(runId, projectId);
  if (!run) return { error: "Ejecución no encontrada." };

  const created = await prisma.aiAgentRun.create({
    data: {
      projectId,
      createdById: userId,
      idempotencyKey: randomUUID(),
      officialAgentKey: run.officialAgentKey,
      customAgentId: run.customAgentId,
      teamId: run.teamId,
      status: "DRAFT",
      input: inputOf(run) as unknown as Prisma.InputJsonValue,
      sourceRunId: run.id,
    },
  });
  revalidatePath(runPath(projectId));
  return { id: created.id };
}

export async function archiveRun(projectId: string, runId: string) {
  const run = await getOwnedRun(runId, projectId);
  if (!run) return { error: "Ejecución no encontrada." };
  if (!isRunTerminal(run.status)) return { error: "Solo se pueden archivar ejecuciones ya finalizadas." };
  await prisma.aiAgentRun.update({ where: { id: runId }, data: { status: "ARCHIVED" } });
  revalidatePath(runPath(projectId));
  return {};
}
