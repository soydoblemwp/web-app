/**
 * Pure loop-detection decision logic (spec section 31). The actual data
 * gathering (walking causationId ancestry, counting recent same-activation
 * runs within the sliding window) happens server-side in
 * src/server/services/automation-loop-guard.ts, which has DB access; this
 * function is the deterministic, independently-testable decision itself —
 * never blocks a legitimate event without a comprobable cause.
 */

export interface LoopCheckInput {
  chainDepth: number;
  maxChainDepth: number;
  /** automationIds already present in this run's causation ancestry (walking causationId back to the root) — a candidate re-appearing here means "this automation already fired earlier in the exact same chain". */
  visitedAutomationIds: string[];
  candidateAutomationId: string;
  /** How many times this exact (automation, resource, event type) combination already fired within the sliding detection window. */
  recentSameActivationCount: number;
  maxRepeatsInWindow: number;
}

export interface LoopCheckResult {
  blocked: boolean;
  reason?: string;
}

export function checkForAutomationLoop(input: LoopCheckInput): LoopCheckResult {
  if (input.chainDepth > input.maxChainDepth) {
    return { blocked: true, reason: `Se alcanzó la profundidad máxima de cadena de automatizaciones (${input.maxChainDepth}).` };
  }
  if (input.visitedAutomationIds.includes(input.candidateAutomationId)) {
    return { blocked: true, reason: "Esta automatización ya participó antes en la misma cadena de causa-efecto — posible bucle." };
  }
  if (input.recentSameActivationCount >= input.maxRepeatsInWindow) {
    return { blocked: true, reason: "Se detectaron repeticiones de la misma activación en poco tiempo — posible bucle." };
  }
  return { blocked: false };
}
