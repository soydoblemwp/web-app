import type { LucideIcon } from "lucide-react";

/**
 * Shared, framework-free types for AI Agent Studio. Mirrors the Prisma enum
 * value lists in prisma/schema.prisma exactly (kept as plain string unions
 * here so pure lib functions never need to import the generated Prisma
 * client) — see src/lib/agents/registry.ts for the 10 official agent
 * definitions and src/lib/agents/structured-output.ts for the shared
 * output-validation engine every agent reuses.
 */

export const AGENT_INPUT_FIELD_TYPES = [
  "short_text",
  "long_text",
  "number",
  "select",
  "multiselect",
  "boolean",
  "date",
  "url",
  "brand_profile",
  "content_item",
  "campaign",
  "campaign_piece",
  "social_post",
  "file_asset",
  "project_member",
  "marketing_brain_session",
] as const;
export type AgentInputFieldType = (typeof AGENT_INPUT_FIELD_TYPES)[number];

/** Input field types that reference an existing project-scoped resource — every value received for one of these MUST be re-validated server-side against project/membership/state before use (spec section 6: "no confíes en IDs enviados por el cliente"). */
export const AGENT_RESOURCE_INPUT_TYPES: AgentInputFieldType[] = [
  "brand_profile",
  "content_item",
  "campaign",
  "campaign_piece",
  "social_post",
  "file_asset",
  "project_member",
  "marketing_brain_session",
];

export interface AgentInputFieldSpec {
  key: string;
  label: string;
  type: AgentInputFieldType;
  required: boolean;
  helpText?: string;
  /** For select/multiselect only. */
  options?: { value: string; label: string }[];
  maxLength?: number;
}

export const AGENT_OUTPUT_TYPES = [
  "text",
  "document",
  "list",
  "table",
  "analysis",
  "strategy",
  "plan",
  "content",
  "publication",
  "review",
  "variant_set",
] as const;
export type AgentOutputType = (typeof AGENT_OUTPUT_TYPES)[number];

export const AGENT_CATEGORIES = [
  "WRITING",
  "SEO",
  "RESEARCH",
  "SOCIAL_MEDIA",
  "MARKETING",
  "BRAND",
  "CONTENT_REPURPOSING",
  "CAMPAIGN",
  "PUBLISHING",
  "REVIEW",
  "CUSTOM",
] as const;
export type AgentCategory = (typeof AGENT_CATEGORIES)[number];

export const AGENT_CREATIVITY_LEVELS = ["CONSERVATIVE", "BALANCED", "CREATIVE"] as const;
export type AgentCreativity = (typeof AGENT_CREATIVITY_LEVELS)[number];

/** Closed vocabulary of context/capability toggles an agent may use — never arbitrary code execution or an external tool name (spec section 5: "no permitas... ejecute herramientas no autorizadas"). */
export const AGENT_TOOL_IDS = [
  "brand-profile",
  "content-search",
  "file-context",
  "seo-scoring",
  "prompt-library",
  "previous-runs",
  "project-members",
  "campaign-context",
  "publishing-context",
  "knowledge-base",
] as const;
export type AgentToolId = (typeof AGENT_TOOL_IDS)[number];

/** One marker-delimited output field — the same "marker: value" text convention used throughout this codebase's other AI features (campaign-studio's strategy/pillar/plan-ai). See structured-output.ts for the shared builder/parser/validator these compose into. */
export interface OutputFieldSpec {
  marker: string;
  field: string;
  kind: "text" | "list" | "enum" | "number";
  enumValues?: string[];
  maxLength?: number;
  maxItems?: number;
}

export interface AgentDefinition {
  key: string;
  name: string;
  description: string;
  icon: LucideIcon;
  category: AgentCategory;
  capabilities: string[];
  systemInstructions: string;
  requiredInputs: AgentInputFieldSpec[];
  optionalInputs: AgentInputFieldSpec[];
  outputType: AgentOutputType;
  outputFields: OutputFieldSpec[];
  allowedTools: AgentToolId[];
  brandProfileOptional: boolean;
  defaultLanguage: string;
  defaultCreativity: AgentCreativity;
  maxSteps: number;
  active: boolean;
}

export const AI_AGENT_RUN_STATUSES = [
  "DRAFT",
  "READY",
  "RUNNING",
  "WAITING_FOR_APPROVAL",
  "COMPLETED",
  "PARTIALLY_COMPLETED",
  "FAILED",
  "CANCELLED",
  "ARCHIVED",
] as const;
export type AiAgentRunStatusValue = (typeof AI_AGENT_RUN_STATUSES)[number];

export const AI_AGENT_RUN_STEP_STATUSES = ["PENDING", "RUNNING", "WAITING_FOR_APPROVAL", "COMPLETED", "FAILED", "SKIPPED", "CANCELLED"] as const;
export type AiAgentRunStepStatusValue = (typeof AI_AGENT_RUN_STEP_STATUSES)[number];

export type AiAgentErrorCategoryValue =
  | "VALIDATION"
  | "PERMISSION"
  | "DEPENDENCY"
  | "AI"
  | "OUTPUT_SCHEMA"
  | "CONTEXT"
  | "CONFLICT"
  | "CANCELLED"
  | "INTERNAL_SAFE";

/** A team member entry — either an official agent key or a custom AiAgent.id. */
export interface TeamMemberRef {
  agentRef: string;
  order: number;
  enabled: boolean;
  requireApproval: boolean;
}

/** User-selected context for a run — validated/resolved server-side, never trusted as-is (spec section 14). */
export interface AgentContextSelection {
  brandProfileId?: string | null;
  contentItemIds?: string[];
  campaignId?: string | null;
  campaignPieceId?: string | null;
  socialPostId?: string | null;
  promptIds?: string[];
  fileAssetIds?: string[];
  notes?: string;
  previousRunIds?: string[];
  /** Fase 32: explicit Knowledge Base scope — an agent NEVER gets implicit access to every collection, only what's selected here (spec section 23: "debe recibir alcance explícito"). */
  knowledgeCollectionIds?: string[];
  knowledgeSourceIds?: string[];
  /** Optional search text to rank fragments by relevance; when omitted, the first few READY chunks of each selected source/collection are used instead. */
  knowledgeQuery?: string;
}

export interface ResolvedContextItem {
  origin: string;
  label: string;
  content: string;
}
