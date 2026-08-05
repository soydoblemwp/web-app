import "server-only";
import { prisma } from "@/lib/db/prisma";

/**
 * Version comparison (Fase 38 spec section 15) — a structured diff (added/
 * removed/modified rules, raised/lowered limits, risk/approval/budget/
 * concurrency changes), not a raw JSON diff as the only interface. Read
 * only; never mutates either version.
 */

export interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

export interface RuleChange {
  scope: string;
  agentRef: string;
  mode: string;
  kind: "ADDED" | "REMOVED" | "MODIFIED";
  changes?: FieldChange[];
}

export interface PolicyComparisonResult {
  versionA: number;
  versionB: number;
  fieldChanges: FieldChange[];
  ruleChanges: RuleChange[];
}

const COMPARABLE_FIELDS = [
  "maxRiskLevel",
  "requireApprovalAtOrAboveRisk",
  "maxRunsPerDay",
  "maxRunsPerMonth",
  "maxConcurrentRunsPerProject",
  "maxConcurrentRunsPerAgent",
  "maxRetries",
  "maxDurationSeconds",
  "maxSteps",
  "maxContextChars",
  "maxOutputChars",
  "onBudgetExhausted",
  "unknownAgentBehavior",
] as const;

const RULE_FIELDS = ["enabled", "riskOverride", "requireApproval", "maxRunsPerDay", "maxConcurrent", "maxRetries", "startsAt", "expiresAt"] as const;

function ruleKey(r: { scope: string; agentRef: string; mode: string }): string {
  return `${r.scope}:${r.agentRef}:${r.mode}`;
}

export async function comparePolicyVersions(projectId: string, policyIdA: string, policyIdB: string): Promise<PolicyComparisonResult | { error: string }> {
  const [a, b] = await Promise.all([
    prisma.aiAgentPolicy.findUnique({ where: { id: policyIdA }, include: { rules: true } }),
    prisma.aiAgentPolicy.findUnique({ where: { id: policyIdB }, include: { rules: true } }),
  ]);
  if (!a || a.projectId !== projectId) return { error: "Versión A no encontrada." };
  if (!b || b.projectId !== projectId) return { error: "Versión B no encontrada." };

  const fieldChanges: FieldChange[] = [];
  for (const field of COMPARABLE_FIELDS) {
    const from = (a as unknown as Record<string, unknown>)[field];
    const to = (b as unknown as Record<string, unknown>)[field];
    if (JSON.stringify(from) !== JSON.stringify(to)) fieldChanges.push({ field, from, to });
  }
  if (JSON.stringify(a.disabledAgentRefs.slice().sort()) !== JSON.stringify(b.disabledAgentRefs.slice().sort())) {
    fieldChanges.push({ field: "disabledAgentRefs", from: a.disabledAgentRefs, to: b.disabledAgentRefs });
  }

  const rulesA = new Map(a.rules.map((r) => [ruleKey(r), r]));
  const rulesB = new Map(b.rules.map((r) => [ruleKey(r), r]));
  const ruleChanges: RuleChange[] = [];

  for (const [key, ruleA] of rulesA) {
    const ruleB = rulesB.get(key);
    if (!ruleB) {
      ruleChanges.push({ scope: ruleA.scope, agentRef: ruleA.agentRef, mode: ruleA.mode, kind: "REMOVED" });
      continue;
    }
    const changes: FieldChange[] = [];
    for (const field of RULE_FIELDS) {
      const from = (ruleA as unknown as Record<string, unknown>)[field];
      const to = (ruleB as unknown as Record<string, unknown>)[field];
      if (JSON.stringify(from) !== JSON.stringify(to)) changes.push({ field, from, to });
    }
    if (changes.length > 0) ruleChanges.push({ scope: ruleA.scope, agentRef: ruleA.agentRef, mode: ruleA.mode, kind: "MODIFIED", changes });
  }
  for (const [key, ruleB] of rulesB) {
    if (!rulesA.has(key)) ruleChanges.push({ scope: ruleB.scope, agentRef: ruleB.agentRef, mode: ruleB.mode, kind: "ADDED" });
  }

  return { versionA: a.version, versionB: b.version, fieldChanges, ruleChanges };
}
