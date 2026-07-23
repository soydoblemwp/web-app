import Anthropic from "@anthropic-ai/sdk";
import { aiConfig } from "@/lib/config";
import type { AIGenerateParams, AIGenerateResult, AIProvider } from "@/lib/ai/types";
import { AIProviderError } from "@/lib/ai/types";

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  private client: Anthropic;

  /** Takes the key explicitly — never reads process.env itself. Callers get it from src/lib/env/server.ts. */
  constructor(apiKey: string) {
    this.client = new Anthropic({
      apiKey,
      timeout: aiConfig.requestTimeoutMs,
    });
  }

  async generateText(params: AIGenerateParams): Promise<AIGenerateResult> {
    try {
      const history = (params.history ?? []).map((turn) => ({
        role: turn.role,
        content: turn.content,
      }));

      const response = await this.client.messages.create({
        model: aiConfig.model,
        max_tokens: params.maxTokens ?? aiConfig.maxOutputTokens,
        system: params.system,
        messages: [...history, { role: "user" as const, content: params.prompt }],
        output_config: { effort: "low" },
      });

      if (response.stop_reason === "refusal") {
        throw new AIProviderError(
          "El proveedor de IA rechazó esta solicitud por motivos de seguridad.",
          false
        );
      }

      const textBlock = response.content.find((b) => b.type === "text");

      return {
        text: textBlock?.type === "text" ? textBlock.text : "",
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        model: response.model,
      };
    } catch (error) {
      if (error instanceof AIProviderError) throw error;
      if (error instanceof Anthropic.RateLimitError) {
        throw new AIProviderError("Límite de solicitudes alcanzado. Inténtalo de nuevo en unos minutos.", true);
      }
      if (error instanceof Anthropic.AuthenticationError) {
        throw new AIProviderError("La clave de API de Anthropic no es válida.", false);
      }
      if (error instanceof Anthropic.APIConnectionError) {
        throw new AIProviderError("No se pudo conectar con el proveedor de IA.", true);
      }
      if (error instanceof Anthropic.APIError) {
        throw new AIProviderError(`Error del proveedor de IA: ${error.message}`, error.status ? error.status >= 500 : true);
      }
      throw new AIProviderError("Error inesperado al generar contenido con IA.", false);
    }
  }
}
