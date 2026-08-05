import type { WorkflowAutomationConditionGroupOperator, WorkflowAutomationConditionOperator } from "@/lib/automations/types";
import { WORKFLOW_AUTOMATION_LIMITS } from "@/lib/automations/limits";

/**
 * The deterministic, server-side condition evaluator (spec section 15) —
 * NEVER eval(), never a dynamically-constructed regex from user text, never
 * arbitrary JS. Every operator below is a pure, fixed comparison function.
 */

export interface ConditionNode {
  field: string;
  operator: WorkflowAutomationConditionOperator;
  value?: unknown;
}

export interface ConditionGroupNode {
  operator: WorkflowAutomationConditionGroupOperator;
  conditions: ConditionNode[];
  groups: ConditionGroupNode[];
}

/** Dot-path lookup into a plain JSON-like object — "current.status", "previous.title", "title". Never touches prototypes/functions (spec section 18/50: "impide... prototype pollution"). */
export function resolveFieldValue(payload: unknown, field: string): unknown {
  if (!field) return undefined;
  const parts = field.split(".").filter(Boolean);
  let cursor: unknown = payload;
  for (const part of parts) {
    if (part === "__proto__" || part === "constructor" || part === "prototype") return undefined;
    if (cursor === null || cursor === undefined || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
}

function toComparable(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.getTime();
  return String(value);
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export function evaluateCondition(node: ConditionNode, payload: Record<string, unknown>): boolean {
  const raw = resolveFieldValue(payload, node.field);
  const a = toComparable(raw);
  const b = toComparable(node.value);

  switch (node.operator) {
    case "EXISTS":
      return raw !== undefined;
    case "NOT_EXISTS":
      return raw === undefined;
    case "IS_EMPTY":
      return isEmpty(raw);
    case "IS_NOT_EMPTY":
      return !isEmpty(raw);
    case "EQUALS":
      return a === b;
    case "NOT_EQUALS":
      return a !== b;
    case "CONTAINS":
      return typeof a === "string" && typeof b === "string" ? a.includes(b) : Array.isArray(raw) ? raw.includes(node.value) : false;
    case "NOT_CONTAINS":
      return !(typeof a === "string" && typeof b === "string" ? a.includes(b) : Array.isArray(raw) ? raw.includes(node.value) : false);
    case "STARTS_WITH":
      return typeof a === "string" && typeof b === "string" && a.startsWith(b);
    case "ENDS_WITH":
      return typeof a === "string" && typeof b === "string" && a.endsWith(b);
    case "GREATER_THAN":
      return typeof a === "number" && typeof b === "number" && a > b;
    case "GREATER_THAN_OR_EQUAL":
      return typeof a === "number" && typeof b === "number" && a >= b;
    case "LESS_THAN":
      return typeof a === "number" && typeof b === "number" && a < b;
    case "LESS_THAN_OR_EQUAL":
      return typeof a === "number" && typeof b === "number" && a <= b;
    case "IN":
      return Array.isArray(node.value) && node.value.map(toComparable).includes(a);
    case "NOT_IN":
      return Array.isArray(node.value) && !node.value.map(toComparable).includes(a);
    case "CHANGED_FROM": {
      const previous = toComparable(resolveFieldValue(payload, "previous." + node.field.replace(/^current\./, "")));
      return previous === b;
    }
    case "CHANGED_TO": {
      const current = toComparable(resolveFieldValue(payload, "current." + node.field.replace(/^current\./, "")));
      return current === b;
    }
    default:
      return false;
  }
}

export function evaluateConditionGroup(group: ConditionGroupNode, payload: Record<string, unknown>, depth = 0): boolean {
  if (depth > WORKFLOW_AUTOMATION_LIMITS.MAX_CONDITION_DEPTH) return false;
  const conditionResults = group.conditions.map((c) => evaluateCondition(c, payload));
  const groupResults = group.groups.map((g) => evaluateConditionGroup(g, payload, depth + 1));
  const all = [...conditionResults, ...groupResults];
  if (all.length === 0) return true; // an empty root group matches everything — "sin condiciones" is a valid, unrestricted automation
  return group.operator === "AND" ? all.every(Boolean) : all.some(Boolean);
}

export interface ConditionValidationIssue {
  message: string;
}

/** Structural validation (size/depth limits) — never lets a group tree grow unbounded (spec section 15). */
export function validateConditionTree(group: ConditionGroupNode, depth = 0): ConditionValidationIssue[] {
  const issues: ConditionValidationIssue[] = [];
  if (depth > WORKFLOW_AUTOMATION_LIMITS.MAX_CONDITION_DEPTH) {
    issues.push({ message: `La profundidad de condiciones supera el máximo permitido (${WORKFLOW_AUTOMATION_LIMITS.MAX_CONDITION_DEPTH}).` });
    return issues;
  }
  if (group.conditions.length > WORKFLOW_AUTOMATION_LIMITS.MAX_CONDITIONS_PER_GROUP) {
    issues.push({ message: `Un grupo no puede tener más de ${WORKFLOW_AUTOMATION_LIMITS.MAX_CONDITIONS_PER_GROUP} condiciones.` });
  }
  for (const c of group.conditions) {
    if (typeof c.value === "string" && c.value.length > WORKFLOW_AUTOMATION_LIMITS.MAX_CONDITION_VALUE_CHARS) {
      issues.push({ message: `El valor de la condición sobre "${c.field}" es demasiado largo.` });
    }
    if (!c.field.trim()) issues.push({ message: "Toda condición necesita un campo." });
  }
  for (const g of group.groups) issues.push(...validateConditionTree(g, depth + 1));
  return issues;
}
