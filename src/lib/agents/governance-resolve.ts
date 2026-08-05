import type { GovernanceFieldOrigin } from "@/lib/agents/governance-types";

/**
 * The SINGLE override-resolution primitive (Fase 38 spec section 7:
 * "La resolución usada por la interfaz debe reutilizar la misma lógica...
 * no implementes una versión visual independiente de la precedencia").
 * `governance-engine.ts` and Policy Studio's effective-policy resolver both
 * call this SAME function for every overridable field — MODE-scope wins
 * over AGENT-scope wins over the base policy value, matching spec section 9
 * exactly. Never duplicated as a second, parallel `??` chain anywhere else.
 */
export interface ResolvedField<T> {
  value: T;
  origin: Extract<GovernanceFieldOrigin, "MODE_RULE" | "AGENT_RULE" | "BASE_POLICY">;
}

export function resolveOverride<T>(modeValue: T | null | undefined, agentValue: T | null | undefined, base: T): ResolvedField<T> {
  if (modeValue !== null && modeValue !== undefined) return { value: modeValue, origin: "MODE_RULE" };
  if (agentValue !== null && agentValue !== undefined) return { value: agentValue, origin: "AGENT_RULE" };
  return { value: base, origin: "BASE_POLICY" };
}
