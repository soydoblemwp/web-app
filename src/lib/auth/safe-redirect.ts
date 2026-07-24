/**
 * Only a same-origin relative path is a safe post-login redirect target —
 * anything else (protocol-relative "//evil.com", an absolute URL, a
 * "javascript:" URI) could send the user off-site after signing in.
 *
 * Split out from src/server/actions/login.ts (a "use server" file, which
 * may only export async functions) so this pure check is directly testable.
 */
export function isSafeRedirectTarget(target: string): boolean {
  return target.startsWith("/") && !target.startsWith("//") && !target.includes("://");
}
