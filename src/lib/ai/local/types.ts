export interface LocalChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface LocalGenerateParams {
  system?: string;
  /** Prior turns of the conversation, oldest first. Omit for single-shot generation. */
  history?: LocalChatTurn[];
  prompt: string;
  maxTokens?: number;
}

export type LocalEngineStatus =
  | "idle"
  | "unsupported"
  | "loading"
  | "ready"
  | "generating"
  | "error";

/** `retryable: false` means the failure won't go away on retry (e.g. no WebGPU) — hide the retry button. */
export class LocalAIError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean = true
  ) {
    super(message);
    this.name = "LocalAIError";
  }
}
