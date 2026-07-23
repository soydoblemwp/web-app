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

export const aiConfig = {
  provider: process.env.AI_PROVIDER ?? "anthropic",
  model: process.env.AI_MODEL ?? "claude-sonnet-4-5",
  maxOutputTokens: Number(process.env.AI_MAX_TOKENS ?? 2048),
  requestTimeoutMs: Number(process.env.AI_REQUEST_TIMEOUT ?? 30_000),
  maxInputCharacters: 20_000,
} as const;

/**
 * Whether the Anthropic API key is configured. Deliberately a function, not
 * a value computed once at module load — Next.js can keep a module instance
 * warm across requests (and across a whole build in the case of static
 * generation), so a constant here can go stale relative to the actual
 * environment for the request currently being served. Call this at the
 * point of use instead of caching the result.
 */
export function isAIEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}
