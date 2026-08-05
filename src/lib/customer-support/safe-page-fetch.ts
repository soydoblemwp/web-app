import "server-only";
import { validateSyncablePath } from "@/lib/customer-support/internal-path";

/**
 * Redirect-safe, same-origin-only page fetcher for the internal-page sync
 * feature (Fase 40 correction spec section 6: "numero maximo de
 * redirecciones; destino final dentro del mismo origen; ausencia de
 * autenticacion requerida; content type permitido; tamano maximo"). Kept in
 * `src/lib` (never imports prisma) specifically so it stays directly
 * unit-testable with a mocked `fetch`, the same convention
 * src/lib/integrations/google-api-client.ts already established.
 *
 * NEVER uses `redirect: "follow"` (unbounded hops, no per-hop origin check)
 * - every redirect is resolved and re-validated manually, exactly like the
 * original path (same syntax rules, same reserved-prefix blocklist). A
 * redirect to another domain, or to a blocked/sensitive path (most notably
 * `/login`, which is how this app's own middleware protects private pages -
 * landing there means the requested page actually requires authentication),
 * fails immediately.
 */

const SYNC_FETCH_TIMEOUT_MS = 10_000;
const SYNC_MAX_BYTES = 2_000_000;
const SYNC_MAX_REDIRECTS = 3;

export interface FetchedPage {
  html: string;
  finalPath: string;
}

export type FetchPageResult = { ok: true; page: FetchedPage } | { ok: false; error: string };

export async function fetchPublicPageSameOrigin(startPath: string, baseUrl: string): Promise<FetchPageResult> {
  const trustedOrigin = new URL(baseUrl).origin;
  let currentPath = startPath;

  for (let hop = 0; hop <= SYNC_MAX_REDIRECTS; hop++) {
    const validation = validateSyncablePath(currentPath);
    if (!validation.ok || !validation.normalizedPath) return { ok: false, error: "La redireccion llevo a una ruta no permitida." };

    const url = new URL(validation.normalizedPath, baseUrl);
    if (url.origin !== trustedOrigin) return { ok: false, error: "La redireccion llevo a un dominio externo." };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SYNC_FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(url.toString(), { signal: controller.signal, redirect: "manual", headers: { "User-Agent": "AI-Content-Hub-CustomerSupportSync/1.0" } });
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === "AbortError") return { ok: false, error: "Tiempo de espera agotado al sincronizar." };
      return { ok: false, error: "No se pudo contactar la pagina." };
    }
    clearTimeout(timeout);

    // A redirect landing on /login (or any other reserved prefix) means the page actually requires authentication or is otherwise not real public content.
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { ok: false, error: "Redireccion sin destino valido." };
      const resolved = new URL(location, url);
      if (resolved.origin !== trustedOrigin) return { ok: false, error: "La redireccion llevo a un dominio externo." };
      currentPath = resolved.pathname + resolved.search;
      continue;
    }

    if (!response.ok) return { ok: false, error: `No se pudo obtener la pagina (HTTP ${response.status}).` };

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !contentType.toLowerCase().includes("text/html")) {
      return { ok: false, error: "Esta ruta no devuelve contenido HTML y no puede sincronizarse." };
    }
    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (contentLength > SYNC_MAX_BYTES) return { ok: false, error: "La pagina supera el tamano maximo permitido." };

    const html = (await response.text()).slice(0, SYNC_MAX_BYTES);
    return { ok: true, page: { html, finalPath: validation.normalizedPath } };
  }

  return { ok: false, error: "Se alcanzo el numero maximo de redirecciones permitidas." };
}
