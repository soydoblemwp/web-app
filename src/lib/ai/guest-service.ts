import "server-only";
import { aiConfig } from "@/lib/config";
import { getAnthropicApiKey, isAnthropicConfigured } from "@/lib/env/server";
import { checkGuestAIRateLimit, GuestRateLimitConfigError } from "@/lib/security/guest-rate-limit";
import { AnthropicProvider } from "@/lib/ai/providers/anthropic";
import type { AIConversationTurn, AIProvider } from "@/lib/ai/types";
import { AIProviderError } from "@/lib/ai/types";

function getProvider(): AIProvider | null {
  if (!isAnthropicConfigured()) return null;
  if (aiConfig.provider === "anthropic") return new AnthropicProvider(getAnthropicApiKey());
  return null;
}

export interface GenerateGuestAIContentInput {
  /** Rate-limit key only (e.g. request IP) — hashed before storage, never persisted in the clear. */
  clientKey: string;
  system?: string;
  history?: AIConversationTurn[];
  prompt: string;
  maxTokens?: number;
}

/**
 * Guest-mode entry point to the AI provider. Unlike `generateAIContent`
 * (src/lib/ai/service.ts), this never stores prompts, responses, usage
 * rows, or a result cache — because guest sessions have neither a project
 * nor an account to attach that data to. The only Prisma write here is the
 * atomic, IP-hash-only rate-limit counter in guest-rate-limit.ts.
 */
export async function generateGuestAIContent(
  input: GenerateGuestAIContentInput
): Promise<{ text: string }> {
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

  let rateLimit;
  try {
    rateLimit = await checkGuestAIRateLimit(input.clientKey);
  } catch (error) {
    if (error instanceof GuestRateLimitConfigError) {
      throw new AIProviderError(error.message, false);
    }
    throw error;
  }

  if (!rateLimit.allowed) {
    const seconds = Math.max(1, Math.ceil(rateLimit.retryAfterMs / 1000));
    throw new AIProviderError(
      `Has alcanzado el límite de solicitudes en modo invitado. Inténtalo de nuevo en ${seconds} segundos o crea una cuenta gratuita para un límite mayor.`,
      true
    );
  }

  const result = await provider.generateText({
    system: input.system,
    history: input.history,
    prompt: input.prompt,
    maxTokens: input.maxTokens,
  });

  return { text: result.text };
}
