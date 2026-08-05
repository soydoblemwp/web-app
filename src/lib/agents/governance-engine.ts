import { RISK_RANK, ARCHITECTURAL_RISK_CEILING } from "@/lib/agents/governance-types";
import type { PolicyEvaluationContext, PolicyEvaluationResult, RuleEvaluationEntry, EffectiveLimits } from "@/lib/agents/governance-types";
import { resolveOverride } from "@/lib/agents/governance-resolve";

/**
 * The single, deterministic, pure policy engine (Fase 37 spec sections 5-6;
 * extended by Fase 38 with step 8b) — no I/O, no randomness, no AI. Every
 * AiAgentRun lifecycle entry point (create/prepare/complete-write/retry/
 * resume) calls this SAME function through src/server/services/
 * agent-governance.ts, which does the real database reads/writes; this file
 * only ever decides. Every MODE-vs-AGENT override chain below is resolved
 * through the shared `resolveOverride()` helper (Fase 38 spec section 7) —
 * Policy Studio's effective-policy resolver in governance-resolve-policy.ts
 * calls the exact same helper, so the UI can never show a value the engine
 * wouldn't actually apply.
 *
 * Precedence (spec section 6, Fase 38 section 13-14 inserts step 8b),
 * evaluated in this exact order — the first rule that triggers a non-ALLOW
 * outcome wins, except "aprobación previa" (step 15) and "riesgo" (step 10),
 * which can only ever add `requireApproval: true` rather than DENY outright:
 *   1. hard architectural ceiling (never configurable by any policy)
 *   2/3. project access
 *   4. emergency stop
 *   5. project paused
 *   6. agent paused
 *   7. agent disabled (policy deny-list)
 *   8. mode disabled (MODE-scope rule override)
 *   8b. unknown-agent policy (Fase 38) — only when NO rule matches at all
 *   9. risk exceeds policy's maxRiskLevel
 *   10. risk-based approval requirement
 *   11. quota (runs/day, runs/month)
 *   12. budget (other metrics/windows)
 *   13. concurrency (project, then agent)
 *   14. retry limit (RETRY operations only)
 *   15. approval requirement resolution (rule override, or already pre-approved)
 *   16. final ALLOW
 */
export function evaluatePolicy(ctx: PolicyEvaluationContext): PolicyEvaluationResult {
  const rules: RuleEvaluationEntry[] = [];
  const warnings: string[] = [];
  const now = new Date().toISOString();

  const limits: EffectiveLimits = ctx.policy?.limits ?? {
    maxRunsPerDay: null,
    maxRunsPerMonth: null,
    maxConcurrentRunsPerProject: 5,
    maxConcurrentRunsPerAgent: 2,
    maxRetries: 3,
    maxDurationSeconds: null,
    maxSteps: null,
    maxContextChars: null,
    maxOutputChars: null,
    maxRiskLevel: "DRAFT_WRITE",
    requireApprovalAtOrAboveRisk: null,
    requireApproval: false,
    onBudgetExhausted: "DENY",
    unknownAgentBehavior: "ALLOW_DEFAULT",
  };

  function result(decision: PolicyEvaluationResult["decision"], code: string, reason: string, requireApproval = false): PolicyEvaluationResult {
    return {
      decision,
      code,
      reason,
      policyId: ctx.policy?.id ?? null,
      policyVersion: ctx.policy?.version ?? null,
      riskLevel: ctx.riskLevel,
      effectiveLimits: limits,
      budgetSnapshot: ctx.budgets,
      concurrencyObserved: ctx.concurrentRunsForProject,
      requireApproval,
      warnings,
      rulesEvaluated: rules,
      evaluatedAt: now,
    };
  }

  // 1. Hard architectural ceiling — never configurable, never bypassable by any policy (spec section 6).
  if (RISK_RANK[ctx.riskLevel] > RISK_RANK[ARCHITECTURAL_RISK_CEILING]) {
    rules.push({ code: "EXTERNAL_SIDE_EFFECT_UNSUPPORTED", outcome: "TRIGGERED", message: "Ningún agente de este proyecto puede realizar efectos externos automáticamente." });
    return result("DENY", "EXTERNAL_SIDE_EFFECT_UNSUPPORTED", "Esta operación implica un efecto externo automático, que ninguna política puede autorizar en este proyecto.");
  }
  rules.push({ code: "EXTERNAL_SIDE_EFFECT_UNSUPPORTED", outcome: "PASSED", message: "El riesgo declarado está dentro del techo arquitectónico soportado." });

  // 2/3. Project access & isolation.
  if (!ctx.hasProjectAccess) {
    rules.push({ code: "NO_PROJECT_ACCESS", outcome: "TRIGGERED", message: "El usuario no tiene acceso a este proyecto." });
    return result("DENY", "NO_PROJECT_ACCESS", "No tienes acceso a este proyecto.");
  }
  rules.push({ code: "NO_PROJECT_ACCESS", outcome: "PASSED", message: "Acceso al proyecto verificado." });

  // 4. Emergency stop.
  if (ctx.emergencyStopEnabled) {
    rules.push({ code: "EMERGENCY_STOP", outcome: "TRIGGERED", message: "El interruptor de emergencia está activo para este proyecto." });
    return result("DENY", "EMERGENCY_STOP", "El interruptor de emergencia de AI Agents está activo — no se pueden iniciar ni continuar ejecuciones.");
  }
  rules.push({ code: "EMERGENCY_STOP", outcome: "PASSED", message: "Interruptor de emergencia desactivado." });

  // 5. Project paused.
  if (ctx.projectPaused) {
    rules.push({ code: "PROJECT_PAUSED", outcome: "TRIGGERED", message: "El proyecto tiene pausadas las nuevas ejecuciones de AI Agents." });
    return result("DENY", "PROJECT_PAUSED", "Este proyecto tiene pausadas las nuevas ejecuciones de AI Agents.");
  }
  rules.push({ code: "PROJECT_PAUSED", outcome: "PASSED", message: "El proyecto no está pausado." });

  // 6. Agent paused.
  if (ctx.agentPaused) {
    rules.push({ code: "AGENT_PAUSED", outcome: "TRIGGERED", message: `El agente "${ctx.agentRef}" está pausado.` });
    return result("DENY", "AGENT_PAUSED", `El agente "${ctx.agentRef}" está pausado en este proyecto.`);
  }
  rules.push({ code: "AGENT_PAUSED", outcome: "PASSED", message: "El agente no está pausado." });

  // 7. Agent disabled (policy deny-list) + MODE/AGENT rule `enabled === false`, MODE always wins over AGENT.
  const modeEnabled = ctx.matchedModeRule?.enabled;
  const agentEnabled = ctx.matchedAgentRule?.enabled;
  if (ctx.policy?.disabledAgentRefs.includes(ctx.agentRef)) {
    rules.push({ code: "AGENT_DISABLED", outcome: "TRIGGERED", message: `El agente "${ctx.agentRef}" está deshabilitado por la política activa.` });
    return result("DENY", "AGENT_DISABLED", `El agente "${ctx.agentRef}" está deshabilitado por la política activa de este proyecto.`);
  }
  if (agentEnabled === false && modeEnabled !== true) {
    rules.push({ code: "AGENT_DISABLED", outcome: "TRIGGERED", message: `Una regla deshabilita explícitamente el agente "${ctx.agentRef}".` });
    return result("DENY", "AGENT_DISABLED", `El agente "${ctx.agentRef}" está deshabilitado por una regla de la política activa.`);
  }
  rules.push({ code: "AGENT_DISABLED", outcome: "PASSED", message: "El agente está habilitado." });

  // 8. Mode disabled (MODE-scope override wins over AGENT-scope).
  if (ctx.mode && modeEnabled === false) {
    rules.push({ code: "MODE_DISABLED", outcome: "TRIGGERED", message: `El modo "${ctx.mode}" de "${ctx.agentRef}" está deshabilitado por una regla específica.` });
    return result("DENY", "MODE_DISABLED", `El modo "${ctx.mode}" de "${ctx.agentRef}" está deshabilitado por la política activa.`);
  }
  rules.push({ code: "MODE_DISABLED", outcome: ctx.mode ? "PASSED" : "SKIPPED", message: ctx.mode ? "El modo está habilitado." : "Este agente no declara modos." });

  // 8b. Unknown-agent policy (Fase 38 spec sections 13-14) — only applies when there is genuinely NO
  // matching AGENT or MODE rule at all (never triggered by an explicit "disabled" rule, which is
  // already handled above). Defaults to ALLOW_DEFAULT, so every project without this configured keeps
  // behaving exactly as it did before Fase 38.
  const hasExplicitRule = ctx.matchedAgentRule !== null || ctx.matchedModeRule !== null;
  if (!hasExplicitRule && limits.unknownAgentBehavior !== "ALLOW_DEFAULT" && !ctx.preApprovedRequestId) {
    rules.push({ code: "UNKNOWN_AGENT_POLICY", outcome: "TRIGGERED", message: `El agente "${ctx.agentRef}" no tiene ninguna regla explícita y la política exige "${limits.unknownAgentBehavior}" para agentes sin cobertura.` });
    if (limits.unknownAgentBehavior === "DENY") {
      return result("DENY", "UNKNOWN_AGENT_POLICY", `El agente "${ctx.agentRef}" no tiene una regla explícita en la política activa, que deniega por defecto los agentes sin cobertura.`);
    }
    return result("REQUIRE_APPROVAL", "UNKNOWN_AGENT_POLICY", `El agente "${ctx.agentRef}" no tiene una regla explícita en la política activa, que exige aprobación para agentes sin cobertura.`, true);
  }
  rules.push({ code: "UNKNOWN_AGENT_POLICY", outcome: hasExplicitRule ? "SKIPPED" : "PASSED", message: hasExplicitRule ? "El agente/modo tiene una regla explícita." : "Los agentes sin regla explícita se permiten por defecto." });

  // 9. Risk exceeds the policy's configured ceiling.
  const effectiveMaxRisk = resolveOverride(ctx.matchedModeRule?.riskOverride, ctx.matchedAgentRule?.riskOverride, limits.maxRiskLevel).value;
  if (RISK_RANK[ctx.riskLevel] > RISK_RANK[effectiveMaxRisk]) {
    rules.push({ code: "RISK_EXCEEDS_POLICY", outcome: "TRIGGERED", message: `Riesgo "${ctx.riskLevel}" excede el máximo permitido "${effectiveMaxRisk}".` });
    return result("DENY", "RISK_EXCEEDS_POLICY", `Esta operación tiene un nivel de riesgo ("${ctx.riskLevel}") superior al máximo permitido por la política ("${effectiveMaxRisk}").`);
  }
  rules.push({ code: "RISK_EXCEEDS_POLICY", outcome: "PASSED", message: `Riesgo "${ctx.riskLevel}" dentro del máximo permitido "${effectiveMaxRisk}".` });

  // 10. Risk-based approval requirement — never denies by itself, only raises the flag.
  let requireApproval = false;
  if (limits.requireApprovalAtOrAboveRisk && RISK_RANK[ctx.riskLevel] >= RISK_RANK[limits.requireApprovalAtOrAboveRisk]) {
    requireApproval = true;
    rules.push({ code: "RISK_REQUIRES_APPROVAL", outcome: "TRIGGERED", message: `El riesgo "${ctx.riskLevel}" requiere aprobación humana según la política.` });
  } else {
    rules.push({ code: "RISK_REQUIRES_APPROVAL", outcome: "SKIPPED", message: "El riesgo de esta operación no exige aprobación por sí solo." });
  }

  // 11. Quota — runs per day/month, using the RUNS budget dimension the caller already fetched.
  const effectiveMaxRunsPerDay = resolveOverride(ctx.matchedModeRule?.maxRunsPerDay, ctx.matchedAgentRule?.maxRunsPerDay, limits.maxRunsPerDay).value;
  const effectiveMaxRunsPerMonth = limits.maxRunsPerMonth;
  if (ctx.operationType === "CREATE_RUN") {
    if (effectiveMaxRunsPerDay !== null && ctx.runsTodayForProject >= effectiveMaxRunsPerDay) {
      rules.push({ code: "QUOTA_EXCEEDED", outcome: "TRIGGERED", message: `Se alcanzó el límite diario de ${effectiveMaxRunsPerDay} ejecuciones.` });
      return result(limits.onBudgetExhausted === "REQUIRE_APPROVAL" ? "REQUIRE_APPROVAL" : "DENY", "QUOTA_EXCEEDED", `Se alcanzó el límite diario de ${effectiveMaxRunsPerDay} ejecuciones para este proyecto/agente.`, limits.onBudgetExhausted === "REQUIRE_APPROVAL");
    }
    if (effectiveMaxRunsPerMonth !== null && ctx.runsThisMonthForProject >= effectiveMaxRunsPerMonth) {
      rules.push({ code: "QUOTA_EXCEEDED", outcome: "TRIGGERED", message: `Se alcanzó el límite mensual de ${effectiveMaxRunsPerMonth} ejecuciones.` });
      return result(limits.onBudgetExhausted === "REQUIRE_APPROVAL" ? "REQUIRE_APPROVAL" : "DENY", "QUOTA_EXCEEDED", `Se alcanzó el límite mensual de ${effectiveMaxRunsPerMonth} ejecuciones para este proyecto.`, limits.onBudgetExhausted === "REQUIRE_APPROVAL");
    }
  }
  rules.push({ code: "QUOTA_EXCEEDED", outcome: "PASSED", message: "Dentro de las cuotas diaria/mensual configuradas." });

  // 12. Budget — every other real dimension (AI_STEPS, RETRIES, EXECUTION_SECONDS, CONTEXT_CHARS, OUTPUT_CHARS).
  for (const b of ctx.budgets) {
    if (b.limit === null) continue;
    const projected = b.reserved + b.consumed;
    if (projected >= b.limit) {
      rules.push({ code: "BUDGET_EXHAUSTED", outcome: "TRIGGERED", message: `El presupuesto de ${b.metric} (${b.window}) está agotado (${projected}/${b.limit}).` });
      return result(limits.onBudgetExhausted === "REQUIRE_APPROVAL" ? "REQUIRE_APPROVAL" : "DENY", "BUDGET_EXHAUSTED", `El presupuesto de "${b.metric}" para la ventana ${b.window} está agotado.`, limits.onBudgetExhausted === "REQUIRE_APPROVAL");
    }
    if (b.available !== null && b.limit > 0 && b.available / b.limit <= 0.1) {
      warnings.push(`El presupuesto de "${b.metric}" (${b.window}) está por debajo del 10% restante.`);
    }
  }
  rules.push({ code: "BUDGET_EXHAUSTED", outcome: "PASSED", message: "Ningún presupuesto configurado está agotado." });

  // 13. Concurrency — project first, then agent-specific.
  if (ctx.concurrentRunsForProject >= limits.maxConcurrentRunsPerProject) {
    rules.push({ code: "CONCURRENCY_LIMIT", outcome: "TRIGGERED", message: `Concurrencia de proyecto (${ctx.concurrentRunsForProject}) alcanzó el máximo (${limits.maxConcurrentRunsPerProject}).` });
    return result("DENY", "CONCURRENCY_LIMIT", `Se alcanzó el máximo de ejecuciones concurrentes del proyecto (${limits.maxConcurrentRunsPerProject}).`);
  }
  const effectiveMaxConcurrentAgent = resolveOverride(ctx.matchedModeRule?.maxConcurrent, ctx.matchedAgentRule?.maxConcurrent, limits.maxConcurrentRunsPerAgent).value;
  if (ctx.concurrentRunsForAgent >= effectiveMaxConcurrentAgent) {
    rules.push({ code: "CONCURRENCY_LIMIT", outcome: "TRIGGERED", message: `Concurrencia del agente "${ctx.agentRef}" (${ctx.concurrentRunsForAgent}) alcanzó el máximo (${effectiveMaxConcurrentAgent}).` });
    return result("DENY", "CONCURRENCY_LIMIT", `Se alcanzó el máximo de ejecuciones concurrentes para "${ctx.agentRef}" (${effectiveMaxConcurrentAgent}).`);
  }
  rules.push({ code: "CONCURRENCY_LIMIT", outcome: "PASSED", message: "Dentro de los límites de concurrencia de proyecto y agente." });

  // 14. Retry limit — only relevant for RETRY operations.
  const effectiveMaxRetries = resolveOverride(ctx.matchedModeRule?.maxRetries, ctx.matchedAgentRule?.maxRetries, limits.maxRetries).value;
  if (ctx.operationType === "RETRY" && ctx.retryCount >= effectiveMaxRetries) {
    rules.push({ code: "RETRY_LIMIT", outcome: "TRIGGERED", message: `Se alcanzó el máximo de ${effectiveMaxRetries} reintentos.` });
    return result("DENY", "RETRY_LIMIT", `Se alcanzó el máximo de reintentos permitidos (${effectiveMaxRetries}).`);
  }
  rules.push({ code: "RETRY_LIMIT", outcome: ctx.operationType === "RETRY" ? "PASSED" : "SKIPPED", message: ctx.operationType === "RETRY" ? "Dentro del máximo de reintentos." : "No aplica a esta operación." });

  // 15. Approval requirement resolution — MODE rule wins over AGENT rule wins over risk-based flag; a valid pre-approval satisfies it.
  const ruleRequiresApproval = resolveOverride(ctx.matchedModeRule?.requireApproval, ctx.matchedAgentRule?.requireApproval, limits.requireApproval).value;
  const finalRequireApproval = (requireApproval || ruleRequiresApproval) && !ctx.preApprovedRequestId;
  if (finalRequireApproval) {
    rules.push({ code: "REQUIRE_APPROVAL", outcome: "TRIGGERED", message: "Esta operación requiere aprobación humana antes de comenzar." });
    return result("REQUIRE_APPROVAL", "REQUIRE_APPROVAL", "Esta operación requiere aprobación humana explícita antes de comenzar.", true);
  }
  rules.push({ code: "REQUIRE_APPROVAL", outcome: ctx.preApprovedRequestId ? "TRIGGERED" : "SKIPPED", message: ctx.preApprovedRequestId ? "Ya cuenta con una aprobación humana válida." : "No se requiere aprobación previa." });

  // 16. Final permit.
  if (!ctx.policy) {
    warnings.push("Este proyecto no tiene una política activa — se aplican límites técnicos seguros por defecto.");
  }
  return result("ALLOW", "ALLOWED", "La operación cumple con la política activa.");
}
