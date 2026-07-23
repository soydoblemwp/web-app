import "server-only";
import { assertSafeExternalUrl, UnsafeUrlError } from "@/lib/security/ssrf-guard";

export class WordPressConnectionError extends Error {}

export interface WordPressCredentials {
  siteUrl: string;
  username: string;
  appPassword: string;
}

/**
 * Verifies WordPress application-password credentials against the site's
 * own REST API (`/wp-json/wp/v2/users/me`). The site URL is user-supplied,
 * so it goes through the same SSRF guard as the monitor/link-checker before
 * any request is made.
 */
export async function verifyWordPressConnection(credentials: WordPressCredentials): Promise<{ name: string }> {
  let base: URL;
  try {
    const { url } = await assertSafeExternalUrl(credentials.siteUrl);
    base = url;
  } catch (error) {
    throw new WordPressConnectionError(error instanceof UnsafeUrlError ? error.message : "URL no válida.");
  }

  const endpoint = new URL("/wp-json/wp/v2/users/me", base);
  const auth = Buffer.from(`${credentials.username}:${credentials.appPassword}`).toString("base64");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(endpoint, {
      headers: { Authorization: `Basic ${auth}` },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new WordPressConnectionError(
        response.status === 401
          ? "Usuario o contraseña de aplicación incorrectos."
          : `WordPress respondió con estado ${response.status}.`
      );
    }
    const data = (await response.json()) as { name?: string };
    return { name: data.name ?? credentials.username };
  } catch (error) {
    if (error instanceof WordPressConnectionError) throw error;
    throw new WordPressConnectionError("No se pudo conectar con el sitio de WordPress.");
  } finally {
    clearTimeout(timeout);
  }
}
