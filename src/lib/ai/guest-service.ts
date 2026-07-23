import "server-only";
import { aiConfig } from "@/lib/config";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { AnthropicProvider } from "@/lib/ai/providers/anthropic";
import type { AIConversationTurn, AIProvider } from "@/lib/ai/types";
import { AIProviderError } from "@/lib/ai/types";

const GUEST_RATE_LIMIT_PER_MINUTE = 6;
const GUEST_RATE_LIMIT_WINDOW_MS = 60_000;

function getProvider(): AIProvider | null {
  if (!aiConfig.enabled) return null;
  if (aiConfig.provider === "anthropic") return new AnthropicProvider();
  return null;
}

export interface GenerateGuestAIContentInput {
  /** Rate-limit key only (e.g. request IP) — never persisted anywhere. */
  clientKey: string;
  system?: string;
  history?: AIConversationTurn[];
  prompt: string;
  maxTokens?: number;
}

/**
 * Guest-mode entry point to the AI provider. Unlike `generateAIContent`
 * (src/lib/ai/service.ts), this never touches Prisma — no usage row, no
 * result cache, no project/user association — because guest sessions have
 * neither a project nor an account to attach that data to. Rate limiting is
 * keyed by request IP instead of user id.
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

  const rateLimit = checkRateLimit(
    `guest-ai:${input.clientKey}`,
    GUEST_RATE_LIMIT_PER_MINUTE,
    GUEST_RATE_LIMIT_WINDOW_MS
  );
  if (!rateLimit.allowed) {
    throw new AIProviderError(
      "Has alcanzado el límite de solicitudes en modo invitado. Espera un minuto o crea una cuenta gratuita para un límite mayor.",
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
