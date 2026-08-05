/**
 * The single interface every future real network adapter (Meta, TikTok,
 * LinkedIn, YouTube, X, Pinterest, WordPress, email) will implement. Fase 29
 * ships only "not configured" adapters — see not-configured-adapter.ts —
 * that never simulate a successful publish, per spec. Nothing here talks to
 * a network; no SDK is installed.
 */
export type PublishingProviderId = "meta" | "tiktok" | "linkedin" | "youtube" | "x" | "pinterest" | "wordpress" | "email";

export interface ProviderPublishInput {
  socialPostId: string;
  platform: string;
  text: string;
  mediaUrls: string[];
}

export interface ProviderPublishResult {
  /** True only for a genuinely successful publish against the real network — a "not configured" adapter must never return true. */
  success: boolean;
  externalId?: string;
  errorCode?: string;
  /** Always a safe, user-facing message — never a raw provider response, header, or token. */
  errorMessage?: string;
  isRetryable?: boolean;
}

export interface ProviderStatusResult {
  configured: boolean;
  /** Human-readable, safe-to-display reason (e.g. "Sin credenciales conectadas") — never a token or internal error. */
  reason: string;
}

export interface PublishingProvider {
  readonly id: PublishingProviderId;
  readonly label: string;
  validate(input: ProviderPublishInput): Promise<{ valid: boolean; errors: string[] }>;
  publish(input: ProviderPublishInput): Promise<ProviderPublishResult>;
  cancel(externalId: string): Promise<{ success: boolean; errorMessage?: string }>;
  getStatus(): Promise<ProviderStatusResult>;
  refreshCredentials(): Promise<{ success: boolean; errorMessage?: string }>;
}
