import "server-only";
import { GOOGLE_INTEGRATION_LIMITS } from "@/lib/integrations/google-limits";

/**
 * Thin, dependency-free fetch wrappers over the real Google REST APIs —
 * deliberately no `googleapis` npm dependency (this codebase's convention,
 * matching src/lib/integrations/github.ts's plain-fetch approach). Every
 * function here classifies errors (spec section 22) and NEVER logs/returns
 * a raw token or a full response body that could carry sensitive data.
 *
 * Endpoints/metric names verified against the CURRENT (implementation-time)
 * API surfaces:
 *   - OAuth token endpoint: https://oauth2.googleapis.com/token (unchanged since OAuth2 RFC 6749)
 *   - GA4 Admin API v1beta: accountSummaries (property discovery)
 *   - GA4 Data API v1beta: runReport (metric reporting)
 *   - Search Console API v3 (the only stable version; there is no v4): sites, searchanalytics.query
 */

export type GoogleApiErrorCategory =
  | "AUTH"
  | "SCOPE_INSUFFICIENT"
  | "NOT_ACCESSIBLE"
  | "TOKEN_REVOKED"
  | "QUOTA"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "INVALID_RESPONSE"
  | "TEMPORARY"
  | "PERMANENT";

export class GoogleApiError extends Error {
  category: GoogleApiErrorCategory;
  retryable: boolean;
  retryAfterSeconds: number | null;

  constructor(message: string, category: GoogleApiErrorCategory, retryable: boolean, retryAfterSeconds: number | null = null) {
    super(message);
    this.name = "GoogleApiError";
    this.category = category;
    this.retryable = retryable;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function truncateSafe(text: string): string {
  return text.length > GOOGLE_INTEGRATION_LIMITS.MAX_SAFE_ERROR_MESSAGE_LENGTH ? text.slice(0, GOOGLE_INTEGRATION_LIMITS.MAX_SAFE_ERROR_MESSAGE_LENGTH) + "…" : text;
}

async function classifiedFetch(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GOOGLE_INTEGRATION_LIMITS.HTTP_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (response.ok) return response;

    const retryAfterHeader = response.headers.get("Retry-After");
    const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) || null : null;

    let reason = "";
    try {
      const body = (await response.clone().json()) as { error?: { status?: string; message?: string } };
      reason = body?.error?.status ?? body?.error?.message ?? "";
    } catch {
      // Non-JSON error body — fall through with the status code alone.
    }

    if (response.status === 401) throw new GoogleApiError("Autenticación con Google rechazada (token inválido o vencido).", "AUTH", true);
    if (response.status === 403 && /PERMISSION_DENIED/i.test(reason)) throw new GoogleApiError("Este recurso ya no es accesible con la cuenta de Google conectada.", "NOT_ACCESSIBLE", false);
    if (response.status === 403) throw new GoogleApiError("La cuenta de Google no concedió los permisos necesarios.", "SCOPE_INSUFFICIENT", false);
    if (response.status === 404) throw new GoogleApiError("El recurso solicitado ya no existe o no es accesible.", "NOT_ACCESSIBLE", false);
    if (response.status === 429) throw new GoogleApiError("Se alcanzó un límite de solicitudes de Google (rate limit).", "RATE_LIMIT", true, retryAfterSeconds);
    if (response.status === 400 && /RESOURCE_EXHAUSTED|QUOTA/i.test(reason)) throw new GoogleApiError("Se alcanzó la cuota de la API de Google.", "QUOTA", true, retryAfterSeconds);
    if (response.status >= 500) throw new GoogleApiError(`Google respondió con un error temporal (${response.status}).`, "TEMPORARY", true);
    throw new GoogleApiError(`Google respondió con estado ${response.status}.`, "PERMANENT", false);
  } catch (err) {
    if (err instanceof GoogleApiError) throw err;
    if (err instanceof Error && err.name === "AbortError") throw new GoogleApiError("Tiempo de espera agotado al contactar a Google.", "TIMEOUT", true);
    throw new GoogleApiError(truncateSafe(err instanceof Error ? err.message : "Error desconocido al contactar a Google."), "TEMPORARY", true);
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// OAuth token endpoints
// ---------------------------------------------------------------------------

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
}

export async function exchangeGoogleAuthorizationCode(params: { code: string; clientId: string; clientSecret: string; redirectUri: string; codeVerifier: string }): Promise<GoogleTokenResponse> {
  const response = await classifiedFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: params.code,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: "authorization_code",
      code_verifier: params.codeVerifier,
    }),
  });
  return (await response.json()) as GoogleTokenResponse;
}

export async function refreshGoogleAccessToken(params: { refreshToken: string; clientId: string; clientSecret: string }): Promise<GoogleTokenResponse> {
  const response = await classifiedFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: params.refreshToken,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      grant_type: "refresh_token",
    }),
  });
  return (await response.json()) as GoogleTokenResponse;
}

/** Best-effort — a revoke failure never blocks disconnection (spec section 6: "revocar el token... mediante una operación best-effort"). */
export async function revokeGoogleToken(token: string): Promise<boolean> {
  try {
    const response = await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function fetchGoogleUserEmail(accessToken: string): Promise<string | null> {
  try {
    const response = await classifiedFetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = (await response.json()) as { email?: string };
    return data.email ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Google Analytics 4 — Admin API (property discovery) + Data API (reporting)
// ---------------------------------------------------------------------------

export interface Ga4PropertySummary {
  property: string; // "properties/123456789"
  displayName: string;
  accountName: string;
}

/** GA4 Admin API v1beta accountSummaries — the real, current endpoint for "which properties can this account read". */
export async function listGa4Properties(accessToken: string): Promise<Ga4PropertySummary[]> {
  const results: Ga4PropertySummary[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL("https://analyticsadmin.googleapis.com/v1beta/accountSummaries");
    url.searchParams.set("pageSize", String(GOOGLE_INTEGRATION_LIMITS.API_PAGE_SIZE));
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await classifiedFetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = (await response.json()) as { accountSummaries?: { account: string; displayName: string; propertySummaries?: { property: string; displayName: string }[] }[]; nextPageToken?: string };
    for (const account of data.accountSummaries ?? []) {
      for (const property of account.propertySummaries ?? []) {
        results.push({ property: property.property, displayName: property.displayName, accountName: account.displayName });
      }
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return results;
}

export interface Ga4ReportRow {
  date: string;
  metrics: Record<string, number>;
}

/** GA4 Data API v1beta runReport — one call per day-range, dimension = date only (spec section 14). */
export async function runGa4Report(accessToken: string, propertyId: string, metricApiNames: string[], startDate: string, endDate: string): Promise<Ga4ReportRow[]> {
  const response = await classifiedFetch(`https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "date" }],
      metrics: metricApiNames.map((name) => ({ name })),
      limit: 100000,
    }),
  });
  const data = (await response.json()) as {
    dimensionHeaders?: { name: string }[];
    metricHeaders?: { name: string }[];
    rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[];
  };
  const metricNames = (data.metricHeaders ?? []).map((h) => h.name);
  return (data.rows ?? []).map((row) => {
    const rawDate = row.dimensionValues[0]?.value ?? "";
    const isoDate = /^\d{8}$/.test(rawDate) ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}` : rawDate;
    const metrics: Record<string, number> = {};
    metricNames.forEach((name, i) => {
      const raw = row.metricValues[i]?.value;
      metrics[name] = raw !== undefined ? Number(raw) : NaN;
    });
    return { date: isoDate, metrics };
  });
}

// ---------------------------------------------------------------------------
// Google Search Console
// ---------------------------------------------------------------------------

export interface SearchConsoleSite {
  siteUrl: string;
  permissionLevel: string;
}

export async function listSearchConsoleSites(accessToken: string): Promise<SearchConsoleSite[]> {
  const response = await classifiedFetch("https://searchconsole.googleapis.com/webmasters/v3/sites", { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = (await response.json()) as { siteEntry?: { siteUrl: string; permissionLevel: string }[] };
  return (data.siteEntry ?? []).map((s) => ({ siteUrl: s.siteUrl, permissionLevel: s.permissionLevel }));
}

export interface SearchConsoleRow {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  keys?: string[];
}

export interface SearchConsoleQueryOptions {
  extraDimensions?: ("query" | "page" | "device" | "country")[];
  rowLimit?: number;
}

/** Search Console API v3 searchanalytics.query — `siteUrl` is URL-encoded exactly as Google returned it (domain: and URL-prefix properties both work, spec section 12: never destructively normalized). Returns whatever Google actually provides — never assumed complete (spec section 15: "no asumas que devuelve todas las filas posibles"). */
export async function querySearchConsole(accessToken: string, siteUrl: string, startDate: string, endDate: string, options: SearchConsoleQueryOptions = {}): Promise<{ rows: SearchConsoleRow[]; limited: boolean }> {
  const dimensions = ["date", ...(options.extraDimensions ?? [])];
  const rowLimit = Math.min(options.rowLimit ?? GOOGLE_INTEGRATION_LIMITS.API_PAGE_SIZE, GOOGLE_INTEGRATION_LIMITS.MAX_EXTRA_DIMENSION_ROWS);
  const response = await classifiedFetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ startDate, endDate, dimensions, rowLimit, dataState: "all" }),
  });
  const data = (await response.json()) as { rows?: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[] };
  const rows = (data.rows ?? []).map((row) => ({
    date: row.keys[0] ?? "",
    keys: row.keys.length > 1 ? row.keys.slice(1) : undefined,
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
  }));
  return { rows, limited: rows.length >= rowLimit };
}
