import "server-only";
import { createHash } from "node:crypto";
import { aiConfig } from "@/lib/config";
import { prisma } from "@/lib/db/prisma";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { AnthropicProvider } from "@/lib/ai/providers/anthropic";
import type { AIProvider } from "@/lib/ai/types";
import { AIProviderError } from "@/lib/ai/types";
import type { AIResultKind } from "@/generated/prisma/enums";
import type { AIConversationTurn } from "@/lib/ai/types";

const RATE_LIMIT_PER_MINUTE = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

function getProvider(): AIProvider | null {
  if (!aiConfig.enabled) return null;
  if (aiConfig.provider === "anthropic") return new AnthropicProvider();
  return null;
}

function hashInput(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export interface GenerateAIContentInput {
  projectId: string;
  userId: string;
  kind: AIResultKind;
  system?: string;
  history?: AIConversationTurn[];
  prompt: string;
  maxTokens?: number;
  /** Skip the cache and force a fresh generation (e.g. explicit "regenerate"). */
  skipCache?: boolean;
}

export interface GenerateAIContentResult {
  text: string;
  wasCached: boolean;
}

/**
 * Single entry point every feature must use to call the LLM. Centralizes the
 * cost/safety controls the product spec requires: enablement check, input
 * length cap, per-user rate limit, result caching, and usage logging — so no
 * individual feature can bypass them.
 */
export async function generateAIContent(
  input: GenerateAIContentInput
): Promise<GenerateAIContentResult> {
  const provider = getProvider();
  if (!provider) {
    throw new AIProviderError(
      "El asistente de IA no está configurado. Añade ANTHROPIC_API_KEY para activarlo.",
      false
    );
  }

  if (input.prompt.length > aiConfig.maxInputCharacters) {
    throw new AIProviderError(
      `El texto de entrada supera el límite de ${aiConfig.maxInputCharacters} caracteres.`,
      false
    );
  }

  const rateLimitKey = `ai:${input.userId}`;
  const rateLimit = checkRateLimit(rateLimitKey, RATE_LIMIT_PER_MINUTE, RATE_LIMIT_WINDOW_MS);
  if (!rateLimit.allowed) {
    throw new AIProviderError(
      "Has alcanzado el límite de solicitudes de IA. Espera un momento antes de volver a intentarlo.",
      true
    );
  }

  const inputHash = hashInput(`${input.system ?? ""}::${input.prompt}`);

  if (!input.skipCache) {
    const cached = await prisma.aIResult.findUnique({
      where: {
        projectId_kind_inputHash: {
          projectId: input.projectId,
          kind: input.kind,
          inputHash,
        },
      },
    });
    if (cached) {
      await prisma.aIUsage.create({
        data: {
          projectId: input.projectId,
          userId: input.userId,
          kind: input.kind,
          provider: provider.name,
          model: aiConfig.model,
          wasCached: true,
        },
      });
      return { text: cached.output, wasCached: true };
    }
  }

  const startedAt = Date.now();
  try {
    const result = await provider.generateText({
      system: input.system,
      history: input.history,
      prompt: input.prompt,
      maxTokens: input.maxTokens,
    });

    const writes: Promise<unknown>[] = [
      prisma.aIUsage.create({
        data: {
          projectId: input.projectId,
          userId: input.userId,
          kind: input.kind,
          provider: provider.name,
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          latencyMs: Date.now() - startedAt,
        },
      }),
    ];

    if (!input.skipCache) {
      writes.push(
        prisma.aIResult.upsert({
          where: {
            projectId_kind_inputHash: {
              projectId: input.projectId,
              kind: input.kind,
              inputHash,
            },
          },
          create: {
            projectId: input.projectId,
            kind: input.kind,
            inputHash,
            prompt: input.prompt,
            output: result.text,
          },
          update: { output: result.text },
        })
      );
    }

    await Promise.all(writes);

    return { text: result.text, wasCached: false };
  } catch (error) {
    const message = error instanceof AIProviderError ? error.message : "Error al generar contenido con IA.";
    await prisma.aIUsage.create({
      data: {
        projectId: input.projectId,
        userId: input.userId,
        kind: input.kind,
        provider: provider.name,
        model: aiConfig.model,
        latencyMs: Date.now() - startedAt,
        wasError: true,
        errorMessage: message,
      },
    });
    throw error;
  }
}

export function isAIEnabled(): boolean {
  return aiConfig.enabled;
}
