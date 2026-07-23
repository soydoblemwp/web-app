import "server-only";

/**
 * Reads secrets directly from process.env at call time — never cache the
 * result in a module-level constant. Next.js can keep a module instance
 * warm across requests, and a page with no dynamic API usage gets
 * prerendered once at build time; either way, a value computed at import
 * time can go stale relative to the environment actually serving the
 * current request. Call these functions at the point of use instead
 * (ideally inside a server action, not during page render — see the guest
 * and dashboard AI pages, which no longer check this before rendering).
 */

export function getAnthropicApiKey(): string {
  return process.env["ANTHROPIC_API_KEY"]?.trim() ?? "";
}

export function isAnthropicConfigured(): boolean {
  return getAnthropicApiKey().length > 0;
}
