import {
  buildStructuredSystemPrompt,
  parseStructuredText,
  buildStructuredZodSchema,
  repairStructuredOutput,
  isStructuredOutputEmpty,
  buildBlockSystemPrompt,
  parseBlockText,
  type StructuredRecord,
} from "@/lib/agents/structured-output";
import type { AgentDefinition, AgentInputFieldSpec, ResolvedContextItem, AiAgentErrorCategoryValue } from "@/lib/agents/types";

/**
 * Pure agent prompt-building + output-validation engine — deliberately has
 * no "server-only" dependency (unlike src/server/services/agent-stages.ts,
 * which additionally computes the SEO Agent's deterministic score from a
 * real ContentItem) so it can be imported from src/lib/ai-workflows/
 * execution-resolver.ts, which is itself shared/test-importable and must
 * stay free of server-only transitive imports.
 */

/** outputTypes that are naturally a LIST of records (each with the same field shape) rather than one flat record — reuses the block-repeating parser instead of the flat one. Every agent (official or custom) is driven by this ONE rule; no per-agent bespoke prepare/complete function exists (spec section 7: "no dupliques"). */
const BLOCK_OUTPUT_TYPES = new Set(["variant_set", "plan"]);
const BLOCK_MARKER = "ELEMENTO";

export function isBlockOutputType(outputType: string): boolean {
  return BLOCK_OUTPUT_TYPES.has(outputType);
}

export interface AgentStageOutcome {
  status: "completed" | "failed";
  output?: StructuredRecord | StructuredRecord[];
  errorMessage?: string;
  errorCategory?: AiAgentErrorCategoryValue;
}

function renderInputValues(fields: AgentInputFieldSpec[], values: Record<string, unknown>): string[] {
  const lines: string[] = [];
  for (const f of fields) {
    const v = values[f.key];
    if (v === undefined || v === null || v === "") continue;
    lines.push(`${f.label}: ${Array.isArray(v) ? v.join(", ") : String(v)}`);
  }
  return lines;
}

function renderContextItems(items: ResolvedContextItem[]): string[] {
  return items.map((item) => `[${item.origin}] ${item.label}:\n${item.content}`);
}

export interface AgentPromptInputs {
  agentDefinition: AgentDefinition;
  inputValues: Record<string, unknown>;
  context: ResolvedContextItem[];
  brandContext: string;
  memoryInstructions: string[];
  extraInstructions?: string[];
}

/** Builds the system+user prompt for ANY agent (official or custom) from its declared fields — the one shared prompt-building path. */
export function buildAgentPrompt(params: AgentPromptInputs): { systemPrompt: string; userPrompt: string } {
  const { agentDefinition, inputValues, context, brandContext, memoryInstructions, extraInstructions = [] } = params;
  const allExtra = [...memoryInstructions, ...extraInstructions];

  const systemPrompt = isBlockOutputType(agentDefinition.outputType)
    ? buildBlockSystemPrompt(agentDefinition.systemInstructions, BLOCK_MARKER, agentDefinition.outputFields, brandContext, allExtra)
    : buildStructuredSystemPrompt(agentDefinition.systemInstructions, agentDefinition.outputFields, brandContext, allExtra);

  const requiredAndOptional = [...agentDefinition.requiredInputs, ...agentDefinition.optionalInputs];
  const userPromptLines = [...renderInputValues(requiredAndOptional, inputValues)];
  if (context.length > 0) {
    userPromptLines.push("", "Contexto proporcionado:", ...renderContextItems(context));
  } else {
    userPromptLines.push("", "No se proporcionó contexto adicional del proyecto.");
  }

  return { systemPrompt, userPrompt: userPromptLines.join("\n") };
}

/** Validates + controlled-repairs the raw AI text against the agent's declared output fields — never persists an empty/invalid result as success (spec section 7). */
export function parseAndValidateAgentOutput(agentDefinition: AgentDefinition, rawOutput: string): AgentStageOutcome {
  if (isBlockOutputType(agentDefinition.outputType)) {
    const items = parseBlockText(rawOutput, BLOCK_MARKER, agentDefinition.outputFields);
    if (items.length === 0) {
      return { status: "failed", errorMessage: "La IA no devolvió ningún elemento con el formato esperado. Puedes reintentar.", errorCategory: "OUTPUT_SCHEMA" };
    }
    const itemSchema = buildStructuredZodSchema(agentDefinition.outputFields);
    const repairedItems = items.map((item) => {
      const validated = itemSchema.safeParse(item);
      return validated.success ? validated.data : repairStructuredOutput(item, agentDefinition.outputFields).repaired;
    });
    return { status: "completed", output: repairedItems };
  }

  const parsed = parseStructuredText(rawOutput, agentDefinition.outputFields);
  if (isStructuredOutputEmpty(parsed)) {
    return { status: "failed", errorMessage: "La IA no devolvió contenido utilizable. Puedes reintentar.", errorCategory: "OUTPUT_SCHEMA" };
  }
  const schema = buildStructuredZodSchema(agentDefinition.outputFields);
  const validated = schema.safeParse(parsed);
  if (validated.success) return { status: "completed", output: validated.data };

  const { repaired, enumFailed } = repairStructuredOutput(parsed, agentDefinition.outputFields);
  if (enumFailed) {
    return { status: "failed", errorMessage: "La IA no devolvió una decisión válida. Puedes reintentar.", errorCategory: "OUTPUT_SCHEMA" };
  }
  return { status: "completed", output: repaired };
}
