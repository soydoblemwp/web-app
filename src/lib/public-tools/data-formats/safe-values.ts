/**
 * Prototype-pollution-safe object construction, shared by every Fase 49
 * format-to-JSON converter (YAML/XML/TOML). Mirrors the exact pattern
 * already used by `utilities/json-tool.ts`'s `sortJsonKeysDeep`: building
 * objects via `Object.fromEntries` (which defines properties directly,
 * CreateDataPropertyOrThrow) rather than bracket assignment means a key
 * literally named `__proto__` becomes an own property instead of silently
 * reassigning the object's prototype.
 */
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function isForbiddenKey(key: string): boolean {
  return FORBIDDEN_KEYS.has(key);
}

/** Builds a plain object from entries, skipping (never silently renaming) any dangerous key — callers should surface `skipped` to the visitor rather than hide it. */
export function safeObjectFromEntries(entries: Iterable<readonly [string, unknown]>): { value: Record<string, unknown>; skippedKeys: string[] } {
  const skippedKeys: string[] = [];
  const safeEntries: [string, unknown][] = [];
  for (const [key, value] of entries) {
    if (isForbiddenKey(key)) {
      skippedKeys.push(key);
      continue;
    }
    safeEntries.push([key, value]);
  }
  return { value: Object.fromEntries(safeEntries), skippedKeys };
}

/** Iterative (never recursive) node counter/depth checker shared by YAML/XML/TOML converters, mirroring `computeJsonStats`'s explicit-stack traversal so pathologically nested input can't overflow the call stack. */
export function countNodesAndDepth(value: unknown, maxDepth: number): { nodes: number; maxDepthSeen: number; depthExceeded: boolean } {
  let nodes = 0;
  let maxDepthSeen = 0;
  let depthExceeded = false;
  const stack: { node: unknown; depth: number }[] = [{ node: value, depth: 1 }];

  while (stack.length > 0) {
    const { node, depth } = stack.pop()!;
    nodes++;
    if (depth > maxDepthSeen) maxDepthSeen = depth;
    if (depth > maxDepth) {
      depthExceeded = true;
      continue;
    }
    if (Array.isArray(node)) {
      for (const item of node) stack.push({ node: item, depth: depth + 1 });
    } else if (node !== null && typeof node === "object") {
      for (const v of Object.values(node)) stack.push({ node: v, depth: depth + 1 });
    }
  }

  return { nodes, maxDepthSeen, depthExceeded };
}

/** Rejects numbers outside JSON/JS's safe integer range without silently losing precision — callers decide whether to stringify or reject. */
export function isUnsafeInteger(value: number): boolean {
  return Number.isInteger(value) && !Number.isSafeInteger(value);
}
