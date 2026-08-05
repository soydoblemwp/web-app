/**
 * Deterministic LIMITED-rollout scope matching (Fase 38 spec section 19) —
 * pure, no randomness. The SAME subject (policyId + userId) always hashes
 * to the SAME percentage bucket, so a user's assignment never flips between
 * requests. A LIMITED rollout with no scope configured at all matches
 * NOTHING by default — at least one real dimension (agents, modes, or a
 * percentage) must be explicitly set, never an accidental "applies to
 * everyone."
 */

export interface LimitedScopeConfig {
  policyId: string;
  scopeAgentRefs: string[];
  scopeModes: string[];
  percentage: number | null;
}

/** djb2 — a small, fast, fully deterministic string hash; no crypto needed for a non-adversarial, stable-bucketing use case. */
export function stableHashPercent(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return Math.abs(hash) % 100;
}

export function isInLimitedRolloutScope(config: LimitedScopeConfig, agentRef: string, mode: string | null, subjectId: string): boolean {
  const hasAnyDimension = config.scopeAgentRefs.length > 0 || config.scopeModes.length > 0 || config.percentage !== null;
  if (!hasAnyDimension) return false;

  if (config.scopeAgentRefs.length > 0 && !config.scopeAgentRefs.includes(agentRef)) return false;
  if (mode && config.scopeModes.length > 0 && !config.scopeModes.includes(mode)) return false;
  if (config.percentage !== null) {
    const bucket = stableHashPercent(`${config.policyId}:${subjectId}`);
    if (bucket >= config.percentage) return false;
  }
  return true;
}
