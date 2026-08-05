import "server-only";
import { prisma } from "@/lib/db/prisma";
import { buildAgentModeCatalog } from "@/server/services/agent-governance-matrix";

/**
 * Rule coverage report (Fase 38 spec section 13) — which real agents/modes
 * have an explicit rule, which fall back to base-policy defaults, which are
 * disabled, and which rules reference an agent that no longer exists
 * (archived/deleted custom agent) — never blocks anything on its own, purely
 * informational, so a newly-registered agent is never silently blocked
 * unless the policy's `unknownAgentBehavior` says so.
 */

export interface CoverageEntry {
  agentRef: string;
  agentLabel: string;
  mode: string | null;
  hasExplicitRule: boolean;
  disabledByDenyList: boolean;
}

export interface CoverageReport {
  covered: CoverageEntry[];
  uncovered: CoverageEntry[];
  orphanedRules: { id: string; scope: string; agentRef: string; mode: string }[];
  unknownAgentBehavior: string;
}

export async function getPolicyCoverage(projectId: string, policyId: string): Promise<CoverageReport | { error: string }> {
  const policy = await prisma.aiAgentPolicy.findUnique({ where: { id: policyId }, include: { rules: true } });
  if (!policy || policy.projectId !== projectId) return { error: "Política no encontrada." };

  const catalog = await buildAgentModeCatalog(projectId);
  const knownAgentRefs = new Set(catalog.map((a) => a.agentRef));

  const covered: CoverageEntry[] = [];
  const uncovered: CoverageEntry[] = [];

  for (const agent of catalog) {
    const disabledByDenyList = policy.disabledAgentRefs.includes(agent.agentRef);
    const agentRule = policy.rules.find((r) => r.scope === "AGENT" && r.agentRef === agent.agentRef);
    if (agent.modes.length === 0) {
      const hasExplicitRule = Boolean(agentRule) || disabledByDenyList;
      (hasExplicitRule ? covered : uncovered).push({ agentRef: agent.agentRef, agentLabel: agent.agentLabel, mode: null, hasExplicitRule, disabledByDenyList });
    } else {
      for (const mode of agent.modes) {
        const modeRule = policy.rules.find((r) => r.scope === "MODE" && r.agentRef === agent.agentRef && r.mode === mode);
        const hasExplicitRule = Boolean(agentRule) || Boolean(modeRule) || disabledByDenyList;
        (hasExplicitRule ? covered : uncovered).push({ agentRef: agent.agentRef, agentLabel: agent.agentLabel, mode, hasExplicitRule, disabledByDenyList });
      }
    }
  }

  const orphanedRules = policy.rules.filter((r) => !knownAgentRefs.has(r.agentRef)).map((r) => ({ id: r.id, scope: r.scope, agentRef: r.agentRef, mode: r.mode }));

  return { covered, uncovered, orphanedRules, unknownAgentBehavior: policy.unknownAgentBehavior };
}
