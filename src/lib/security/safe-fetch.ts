import "server-only";
import { assertSafeExternalUrl, UnsafeUrlError } from "@/lib/security/ssrf-guard";

const USER_AGENT = "AIContentHub-Monitor/1.0 (+https://github.com)";
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 2_000_000;

export interface SafeFetchResult {
  httpStatus: number;
  finalUrl: string;
  body: string;
  durationMs: number;
}

export class SafeFetchError extends Error {}

/**
 * Fetches an external, user-supplied URL for the monitor and link-checker
 * features. Every call goes through the SSRF guard first (blocks private
 * IPs, non-http(s) schemes, credentials-in-URL) and enforces a timeout, a
 * response-size cap, and an identifiable User-Agent.
 */
export async function safeFetch(rawUrl: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<SafeFetchResult> {
  const { url } = await assertSafeExternalUrl(rawUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT },
    });

    const reader = response.body?.getReader();
    let body = "";
    if (reader) {
      const decoder = new TextDecoder();
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          break;
        }
        body += decoder.decode(value, { stream: true });
      }
    }

    return {
      httpStatus: response.status,
      finalUrl: response.url,
      body,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    if (error instanceof UnsafeUrlError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new SafeFetchError("La solicitud superó el tiempo límite.");
    }
    throw new SafeFetchError("No se pudo conectar con la URL indicada.");
  } finally {
    clearTimeout(timeout);
  }
}

export function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match ? match[1].trim() : null;
}

export function extractMetaDescription(html: string): string | null {
  const match = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i);
  return match ? match[1].trim() : null;
}
