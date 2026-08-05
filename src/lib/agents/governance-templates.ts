import type { CreatePolicyVersionInput } from "@/lib/validation/agent-governance";

/**
 * Safe policy templates (Fase 38 spec section 30) — each one produces a
 * plain, editable draft in the EXACT shape `createPolicyVersionSchema`
 * validates and `createPolicyDraft()` persists. A template is never
 * activated automatically and never hides which values it applies — the
 * editor pre-fills the form with these values so the user sees (and can
 * change) every field before saving.
 */

export type GovernanceTemplateKey = "CONSERVATIVE" | "BALANCED" | "EXPERIMENTAL";

export interface GovernanceTemplate {
  key: GovernanceTemplateKey;
  label: string;
  description: string;
  draft: Omit<CreatePolicyVersionInput, "rules"> & { rules: CreatePolicyVersionInput["rules"] };
}

export const GOVERNANCE_TEMPLATES: GovernanceTemplate[] = [
  {
    key: "CONSERVATIVE",
    label: "Conservadora",
    description: "Agentes desconocidos denegados por defecto; toda escritura en borrador requiere aprobación; concurrencia y presupuestos bajos.",
    draft: {
      comment: "Plantilla conservadora — agentes desconocidos denegados, escrituras requieren aprobación.",
      maxRiskLevel: "DRAFT_WRITE",
      requireApprovalAtOrAboveRisk: "DRAFT_WRITE",
      maxRunsPerDay: 20,
      maxRunsPerMonth: 300,
      maxConcurrentRunsPerProject: 2,
      maxConcurrentRunsPerAgent: 1,
      maxRetries: 2,
      maxDurationSeconds: 600,
      maxSteps: 10,
      maxContextChars: 20000,
      maxOutputChars: 20000,
      onBudgetExhausted: "DENY",
      disabledAgentRefs: [],
      unknownAgentBehavior: "DENY",
      rules: [],
    },
  },
  {
    key: "BALANCED",
    label: "Equilibrada",
    description: "Lectura permitida libremente; borradores controlados con riesgo medio; límites moderados.",
    draft: {
      comment: "Plantilla equilibrada — lectura libre, escritura en borrador controlada.",
      maxRiskLevel: "DRAFT_WRITE",
      requireApprovalAtOrAboveRisk: null,
      maxRunsPerDay: 100,
      maxRunsPerMonth: 2000,
      maxConcurrentRunsPerProject: 5,
      maxConcurrentRunsPerAgent: 2,
      maxRetries: 3,
      maxDurationSeconds: null,
      maxSteps: null,
      maxContextChars: null,
      maxOutputChars: null,
      onBudgetExhausted: "DENY",
      disabledAgentRefs: [],
      unknownAgentBehavior: "ALLOW_DEFAULT",
      rules: [],
    },
  },
  {
    key: "EXPERIMENTAL",
    label: "Experimental controlada",
    description: "Lectura permitida; escrituras requieren aprobación mientras se observa el comportamiento real (pensada para combinarse con un rollout SHADOW/LIMITED).",
    draft: {
      comment: "Plantilla experimental controlada — pensada para probarse primero en SHADOW/LIMITED.",
      maxRiskLevel: "DRAFT_WRITE",
      requireApprovalAtOrAboveRisk: "DRAFT_WRITE",
      maxRunsPerDay: 50,
      maxRunsPerMonth: 800,
      maxConcurrentRunsPerProject: 3,
      maxConcurrentRunsPerAgent: 1,
      maxRetries: 2,
      maxDurationSeconds: null,
      maxSteps: null,
      maxContextChars: null,
      maxOutputChars: null,
      onBudgetExhausted: "REQUIRE_APPROVAL",
      disabledAgentRefs: [],
      unknownAgentBehavior: "REQUIRE_APPROVAL",
      rules: [],
    },
  },
];

export function findGovernanceTemplate(key: string): GovernanceTemplate | undefined {
  return GOVERNANCE_TEMPLATES.find((t) => t.key === key);
}
