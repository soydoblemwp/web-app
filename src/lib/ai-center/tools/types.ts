import type { ContentType, AIResultKind } from "@/generated/prisma/enums";

export type AiToolFieldType = "text" | "textarea" | "number";

export interface AiToolFieldConfig {
  name: string;
  label: string;
  type: AiToolFieldType;
  required?: boolean;
  defaultValue?: string | number;
  maxLength?: number;
  min?: number;
  max?: number;
  placeholder?: string;
}

export type AiToolFieldValues = Record<string, string>;

/**
 * Declarative definition consumed by the generic AiGenerationForm engine.
 * Platform-agnostic on purpose: a YouTube tool and a future Instagram/TikTok
 * tool are both just one of these — only `youtube.ts` (or a future
 * `instagram.ts`) knows the field lists and prompt text.
 */
export interface AiToolDefinition {
  /** Must match the tool's slug in src/lib/ai-center/registry.ts. */
  slug: string;
  /** Path segment under /ai-center/<platform>/<routeSegment>. */
  routeSegment: string;
  label: string;
  description: string;
  fields: AiToolFieldConfig[];
  buildSystemPrompt: (brandContext: string) => string;
  buildUserPrompt: (values: AiToolFieldValues) => string;
  /** "list" splits the model output into discrete items (titles, hashtags...); "text" renders it as one block. */
  outputMode: "text" | "list";
  buildItemTitle: (values: AiToolFieldValues) => string;
  contentType: ContentType;
  resultKind: AIResultKind;
}
