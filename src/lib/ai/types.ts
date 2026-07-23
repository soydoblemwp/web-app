export interface AIConversationTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AIGenerateParams {
  system?: string;
  /** Prior turns of the conversation, oldest first. Omit for single-shot generation. */
  history?: AIConversationTurn[];
  prompt: string;
  maxTokens?: number;
}

export interface AIGenerateResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

/**
 * Provider-agnostic interface. The rest of the app talks to this, never to
 * an SDK directly — swapping or adding a provider means writing one adapter
 * here, not touching every feature that generates text.
 */
export interface AIProvider {
  readonly name: string;
  generateText(params: AIGenerateParams): Promise<AIGenerateResult>;
}

export class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean
  ) {
    super(message);
  }
}
