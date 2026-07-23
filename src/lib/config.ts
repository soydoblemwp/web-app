/**
 * Central product configuration. Change the product name/branding here only —
 * nothing else in the codebase should hardcode it.
 */
export const appConfig = {
  name: process.env.NEXT_PUBLIC_APP_NAME ?? "AI Content Hub",
  shortName: "ACH",
  description:
    "Plataforma SaaS de asistente IA, contenido, SEO, redes sociales y automatización.",
  url: process.env.APP_URL ?? "http://localhost:3000",
  supportEmail: "soporte@example.com",
  defaultLocale: "es",
  defaultTimezone: "UTC",
} as const;

// Non-secret AI configuration only. Whether the Anthropic API key is
// configured lives in src/lib/env/server.ts (isAnthropicConfigured) — that
// module is the only place allowed to read or check ANTHROPIC_API_KEY.
export const aiConfig = {
  provider: process.env.AI_PROVIDER ?? "anthropic",
  model: process.env.AI_MODEL ?? "claude-sonnet-4-5",
  maxOutputTokens: Number(process.env.AI_MAX_TOKENS ?? 2048),
  requestTimeoutMs: Number(process.env.AI_REQUEST_TIMEOUT ?? 30_000),
  maxInputCharacters: 20_000,
} as const;
