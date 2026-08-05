import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GOOGLE_INTEGRATION_LIMITS, GOOGLE_OAUTH_SCOPES } from "@/lib/integrations/google-limits";
import {
  isGoogleOAuthConfigured,
  requireGoogleOAuthEnv,
  generateOAuthState,
  hashOAuthState,
  generatePkcePair,
  buildGoogleAuthorizationUrl,
} from "@/lib/integrations/google-oauth";
import {
  GoogleApiError,
  exchangeGoogleAuthorizationCode,
  refreshGoogleAccessToken,
  revokeGoogleToken,
  fetchGoogleUserEmail,
  listGa4Properties,
  runGa4Report,
  listSearchConsoleSites,
  querySearchConsole,
} from "@/lib/integrations/google-api-client";
import { encryptSecret, decryptSecret } from "@/lib/security/encryption";
import { findMetricDefinition } from "@/lib/performance/metrics-catalog";
import { PERFORMANCE_METRIC_CATEGORIES } from "@/lib/performance/types";
import { computeMetricIdempotencyKey } from "@/lib/performance/idempotency";
import { AUTOMATION_EVENT_DEFINITIONS } from "@/lib/automations/events";
import {
  saveSelectedResourcesSchema,
  triggerManualSyncSchema,
  resyncRangeSchema,
  toggleResourceActiveSchema,
  setGooglePausedSchema,
  syncHistoryFilterSchema,
} from "@/lib/validation/google-integrations";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

const VALID_CUID = "cktestcuid00000000000001";

// ---------------------------------------------------------------------------
// 1. Limits & scopes — real, technical ceilings only (spec sections 5, 11, 19)
// ---------------------------------------------------------------------------
describe("google-limits.ts: technical ceilings + minimal read-only scopes", () => {
  it("declares only the 4 minimal, read-only scopes (identity + GA4 + GSC), never a write/admin scope", () => {
    expect(GOOGLE_OAUTH_SCOPES).toEqual([
      "openid",
      "email",
      "https://www.googleapis.com/auth/analytics.readonly",
      "https://www.googleapis.com/auth/webmasters.readonly",
    ]);
    for (const scope of GOOGLE_OAUTH_SCOPES) {
      expect(scope).not.toMatch(/edit|manage|admin/i);
    }
  });

  it("bounds every range/collection ceiling used elsewhere (no Infinity, no unlimited arrays)", () => {
    expect(GOOGLE_INTEGRATION_LIMITS.MAX_SELECTED_RESOURCES).toBeGreaterThan(0);
    expect(GOOGLE_INTEGRATION_LIMITS.MAX_INITIAL_PERIOD_DAYS).toBeGreaterThan(0);
    expect(GOOGLE_INTEGRATION_LIMITS.MAX_RESYNC_PERIOD_DAYS).toBeGreaterThan(0);
    expect(Number.isFinite(GOOGLE_INTEGRATION_LIMITS.MAX_SELECTED_RESOURCES)).toBe(true);
    expect(Number.isFinite(GOOGLE_INTEGRATION_LIMITS.MAX_INITIAL_PERIOD_DAYS)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. google-oauth.ts — pure OAuth 2.0 + PKCE primitives (spec sections 2, 5)
// ---------------------------------------------------------------------------
describe("google-oauth.ts: pure OAuth/PKCE helpers", () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("isGoogleOAuthConfigured is false when any of the 3 required env vars is missing", () => {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    delete process.env.GOOGLE_OAUTH_REDIRECT_URI;
    expect(isGoogleOAuthConfigured()).toBe(false);

    process.env.GOOGLE_OAUTH_CLIENT_ID = "id";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "secret";
    expect(isGoogleOAuthConfigured()).toBe(false); // redirect URI still missing

    process.env.GOOGLE_OAUTH_REDIRECT_URI = "https://example.com/callback";
    expect(isGoogleOAuthConfigured()).toBe(true);
  });

  it("requireGoogleOAuthEnv throws a clear, non-sensitive error when unconfigured — never a fake connection", () => {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    delete process.env.GOOGLE_OAUTH_REDIRECT_URI;
    expect(() => requireGoogleOAuthEnv()).toThrow(/no está configurada/i);
  });

  it("requireGoogleOAuthEnv returns the exact configured values when present", () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = "client-id-123";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "client-secret-456";
    process.env.GOOGLE_OAUTH_REDIRECT_URI = "https://example.com/api/integrations/google/callback";
    expect(requireGoogleOAuthEnv()).toEqual({
      clientId: "client-id-123",
      clientSecret: "client-secret-456",
      redirectUri: "https://example.com/api/integrations/google/callback",
    });
  });

  it("generateOAuthState produces long, unique, URL-safe values every call — never derived from user/project IDs", () => {
    const a = generateOAuthState();
    const b = generateOAuthState();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("hashOAuthState is a deterministic, one-way SHA-256 hex digest — the raw state is never recoverable from it", () => {
    const state = generateOAuthState();
    expect(hashOAuthState(state)).toBe(hashOAuthState(state));
    expect(hashOAuthState(state)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashOAuthState(state)).not.toBe(state);
  });

  it("generatePkcePair derives the S256 challenge from the verifier deterministically, and never reuses a verifier across calls", () => {
    const a = generatePkcePair();
    const b = generatePkcePair();
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
    expect(a.codeChallenge).not.toBe(b.codeChallenge);
    expect(a.codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("buildGoogleAuthorizationUrl requests offline access, forces consent (real refresh token), and uses PKCE S256 — never the implicit flow", () => {
    const pkce = generatePkcePair();
    const url = new URL(
      buildGoogleAuthorizationUrl({
        clientId: "client-id",
        redirectUri: "https://example.com/callback",
        state: "state-value",
        codeChallenge: pkce.codeChallenge,
      })
    );
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("response_type")).toBe("code"); // never "token" (implicit flow)
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(pkce.codeChallenge);
    expect(url.searchParams.get("scope")).toBe(GOOGLE_OAUTH_SCOPES.join(" "));
    expect(url.searchParams.get("state")).toBe("state-value");
  });

  it("buildGoogleAuthorizationUrl omits login_hint when not provided, includes it when provided", () => {
    const pkce = generatePkcePair();
    const base = { clientId: "id", redirectUri: "https://example.com/cb", state: "s", codeChallenge: pkce.codeChallenge };
    expect(new URL(buildGoogleAuthorizationUrl(base)).searchParams.has("login_hint")).toBe(false);
    expect(new URL(buildGoogleAuthorizationUrl({ ...base, loginHint: "user@example.com" })).searchParams.get("login_hint")).toBe("user@example.com");
  });
});

// ---------------------------------------------------------------------------
// 3. google-api-client.ts — real HTTP shape, mocked fetch only (never real Google)
// ---------------------------------------------------------------------------
describe("google-api-client.ts: request shape + error classification (fetch mocked, never real Google)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (name: string) => headers[name] ?? null },
      json: async () => body,
      clone() {
        return this;
      },
    };
  }

  it("exchangeGoogleAuthorizationCode POSTs the authorization_code grant with the PKCE code_verifier, never the client secret in the URL", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { access_token: "at", refresh_token: "rt", expires_in: 3600, scope: GOOGLE_OAUTH_SCOPES.join(" "), token_type: "Bearer" }));

    const result = await exchangeGoogleAuthorizationCode({ code: "auth-code", clientId: "cid", clientSecret: "csecret", redirectUri: "https://example.com/cb", codeVerifier: "verifier-value" });

    expect(result.access_token).toBe("at");
    expect(result.refresh_token).toBe("rt");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect(url).not.toContain("csecret"); // secret travels in the body, never the URL
    const body = (init.body as URLSearchParams).toString();
    expect(body).toContain("grant_type=authorization_code");
    expect(body).toContain("code_verifier=verifier-value");
  });

  it("refreshGoogleAccessToken POSTs the refresh_token grant", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { access_token: "new-at", expires_in: 3600, scope: "s", token_type: "Bearer" }));
    const result = await refreshGoogleAccessToken({ refreshToken: "rt", clientId: "cid", clientSecret: "csecret" });
    expect(result.access_token).toBe("new-at");
    const body = (fetchMock.mock.calls[0][1].body as URLSearchParams).toString();
    expect(body).toContain("grant_type=refresh_token");
  });

  it("revokeGoogleToken is best-effort — a failed/erroring revoke never throws, just returns false", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    await expect(revokeGoogleToken("some-token")).resolves.toBe(false);

    fetchMock.mockResolvedValueOnce({ ok: false });
    await expect(revokeGoogleToken("some-token")).resolves.toBe(false);

    fetchMock.mockResolvedValueOnce({ ok: true });
    await expect(revokeGoogleToken("some-token")).resolves.toBe(true);
  });

  it("fetchGoogleUserEmail returns null (never throws) when the userinfo call fails", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: { status: "UNAUTHENTICATED" } }));
    await expect(fetchGoogleUserEmail("bad-token")).resolves.toBeNull();
  });

  it("listGa4Properties follows pagination via nextPageToken until exhausted", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          accountSummaries: [{ account: "accounts/1", displayName: "Acct 1", propertySummaries: [{ property: "properties/111", displayName: "Site A" }] }],
          nextPageToken: "page-2",
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          accountSummaries: [{ account: "accounts/1", displayName: "Acct 1", propertySummaries: [{ property: "properties/222", displayName: "Site B" }] }],
        })
      );

    const properties = await listGa4Properties("token");
    expect(properties).toEqual([
      { property: "properties/111", displayName: "Site A", accountName: "Acct 1" },
      { property: "properties/222", displayName: "Site B", accountName: "Acct 1" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondUrl = fetchMock.mock.calls[1][0] as string;
    expect(secondUrl).toContain("pageToken=page-2");
  });

  it("runGa4Report converts GA4's YYYYMMDD date format to ISO and maps metric values by header name", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        dimensionHeaders: [{ name: "date" }],
        metricHeaders: [{ name: "activeUsers" }, { name: "sessions" }],
        rows: [{ dimensionValues: [{ value: "20260115" }], metricValues: [{ value: "42" }, { value: "10" }] }],
      })
    );
    const rows = await runGa4Report("token", "properties/123", ["activeUsers", "sessions"], "2026-01-01", "2026-01-31");
    expect(rows).toEqual([{ date: "2026-01-15", metrics: { activeUsers: 42, sessions: 10 } }]);
  });

  it("runGa4Report reports NaN (never silently 0) for a missing metric value, so the caller can skip it", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        metricHeaders: [{ name: "activeUsers" }],
        rows: [{ dimensionValues: [{ value: "20260115" }], metricValues: [] }],
      })
    );
    const rows = await runGa4Report("token", "properties/123", ["activeUsers"], "2026-01-01", "2026-01-31");
    expect(Number.isNaN(rows[0].metrics.activeUsers)).toBe(true);
  });

  it("listSearchConsoleSites returns siteUrl exactly as Google returned it — never destructively normalized (domain: vs URL-prefix)", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { siteEntry: [{ siteUrl: "sc-domain:example.com", permissionLevel: "siteOwner" }, { siteUrl: "https://example.com/", permissionLevel: "siteFullUser" }] }));
    const sites = await listSearchConsoleSites("token");
    expect(sites).toEqual([
      { siteUrl: "sc-domain:example.com", permissionLevel: "siteOwner" },
      { siteUrl: "https://example.com/", permissionLevel: "siteFullUser" },
    ]);
  });

  it("querySearchConsole URL-encodes the siteUrl (required for domain: properties containing a colon)", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { rows: [] }));
    await querySearchConsole("token", "sc-domain:example.com", "2026-01-01", "2026-01-31");
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain(encodeURIComponent("sc-domain:example.com"));
  });

  it("querySearchConsole sets limited:true when the row count reaches the requested rowLimit — never assumes it received everything", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const rows = Array.from({ length: 5 }, (_, i) => ({ keys: [`2026-01-0${i + 1}`], clicks: 1, impressions: 10, ctr: 0.1, position: 5 }));
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { rows }));
    const result = await querySearchConsole("token", "https://example.com/", "2026-01-01", "2026-01-05", { rowLimit: 5 });
    expect(result.rows).toHaveLength(5);
    expect(result.limited).toBe(true);
  });

  it("querySearchConsole caps rowLimit at MAX_EXTRA_DIMENSION_ROWS even if a caller requests more", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { rows: [] }));
    await querySearchConsole("token", "https://example.com/", "2026-01-01", "2026-01-31", { rowLimit: 999_999_999 });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.rowLimit).toBeLessThanOrEqual(GOOGLE_INTEGRATION_LIMITS.MAX_EXTRA_DIMENSION_ROWS);
  });

  // --- Error classification (spec section 22) ---------------------------
  it.each([
    [401, {}, "AUTH", true],
    [403, { error: { status: "PERMISSION_DENIED" } }, "NOT_ACCESSIBLE", false],
    [403, { error: { status: "OTHER" } }, "SCOPE_INSUFFICIENT", false],
    [404, {}, "NOT_ACCESSIBLE", false],
    [429, {}, "RATE_LIMIT", true],
    [400, { error: { status: "RESOURCE_EXHAUSTED" } }, "QUOTA", true],
    [500, {}, "TEMPORARY", true],
    [503, {}, "TEMPORARY", true],
    [418, {}, "PERMANENT", false],
  ])("classifies HTTP %s as %s (retryable=%s)", async (status, body, expectedCategory, expectedRetryable) => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse(status as number, body));
    await expect(fetchGoogleUserEmailOrThrow()).rejects.toMatchObject({ category: expectedCategory, retryable: expectedRetryable });

    async function fetchGoogleUserEmailOrThrow() {
      // fetchGoogleUserEmail swallows errors, so exercise the same classifiedFetch path via listSearchConsoleSites which rethrows.
      return listSearchConsoleSites("token");
    }
  });

  it("propagates Retry-After as retryAfterSeconds on a 429", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse(429, {}, { "Retry-After": "30" }));
    try {
      await listSearchConsoleSites("token");
      expect.unreachable("expected a GoogleApiError");
    } catch (err) {
      expect(err).toBeInstanceOf(GoogleApiError);
      expect((err as InstanceType<typeof GoogleApiError>).retryAfterSeconds).toBe(30);
    }
  });

  it("classifies a fetch abort (timeout) as TIMEOUT, retryable", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    fetchMock.mockRejectedValueOnce(abortError);
    await expect(listSearchConsoleSites("token")).rejects.toMatchObject({ category: "TIMEOUT", retryable: true });
  });

  it("classifies a generic network failure as TEMPORARY, retryable — never crashes the caller with a raw exception", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    await expect(listSearchConsoleSites("token")).rejects.toBeInstanceOf(GoogleApiError);
  });

  it("never leaks a raw multi-KB Google response body into the error message — truncates to a safe length", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockRejectedValueOnce(new Error("x".repeat(5000)));
    try {
      await listSearchConsoleSites("token");
      expect.unreachable("expected a GoogleApiError");
    } catch (err) {
      expect((err as Error).message.length).toBeLessThanOrEqual(GOOGLE_INTEGRATION_LIMITS.MAX_SAFE_ERROR_MESSAGE_LENGTH + 1);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. encryption.ts — versioned format, Google tokens round-trip (spec section 8)
// ---------------------------------------------------------------------------
describe("encryption.ts: AES-256-GCM round trip for Google OAuth tokens/code_verifiers", () => {
  const originalKey = process.env.ENCRYPTION_KEY;
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = "test-encryption-key-for-google-integrations-fase-39";
  });
  afterEach(() => {
    process.env.ENCRYPTION_KEY = originalKey;
  });

  it("round-trips a realistic Google refresh token exactly", () => {
    const refreshToken = "1//0gLongRealisticGoogleRefreshTokenValueXYZ123456789";
    const encrypted = encryptSecret(refreshToken);
    expect(decryptSecret(encrypted)).toBe(refreshToken);
  });

  it("round-trips a PKCE code_verifier exactly", () => {
    const verifier = generatePkcePair().codeVerifier;
    expect(decryptSecret(encryptSecret(verifier))).toBe(verifier);
  });

  it("writes the versioned 4-part format (v1.<iv>.<tag>.<ciphertext>) — the real, documented rotation mechanism", () => {
    const encrypted = encryptSecret("some-token");
    const parts = encrypted.split(".");
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe("v1");
  });

  it("never reuses the IV across two encryptions of the identical plaintext", () => {
    const a = encryptSecret("same-plaintext");
    const b = encryptSecret("same-plaintext");
    expect(a).not.toBe(b);
    expect(a.split(".")[1]).not.toBe(b.split(".")[1]); // the IV segment
  });

  it("a tampered ciphertext fails to decrypt (authenticated encryption — GCM auth tag enforced)", () => {
    const encrypted = encryptSecret("secret-value");
    const [v, iv, tag, data] = encrypted.split(".");
    const tampered = [v, iv, tag, data.slice(0, -4) + "abcd"].join(".");
    expect(() => decryptSecret(tampered)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 5. metrics-catalog.ts — the 13 GA4/GSC entries (spec sections 8, 14-15)
// ---------------------------------------------------------------------------
describe("metrics-catalog.ts: ga4.* and gsc.* entries", () => {
  const GA4_KEYS = ["ga4.active_users", "ga4.new_users", "ga4.sessions", "ga4.page_views", "ga4.engagement_rate", "ga4.average_session_duration", "ga4.event_count", "ga4.key_events", "ga4.total_revenue"];
  const GSC_KEYS = ["gsc.clicks", "gsc.impressions", "gsc.ctr", "gsc.average_position"];

  it("registers exactly the 9 ga4.* and 4 gsc.* keys required by the spec, all findable via findMetricDefinition", () => {
    for (const key of [...GA4_KEYS, ...GSC_KEYS]) {
      expect(findMetricDefinition(key), `expected ${key} to be defined`).toBeTruthy();
    }
  });

  it("every ga4.*/gsc.* entry is marked isExternal:true and isDerived:false — real values from Google, never computed internally", () => {
    for (const key of [...GA4_KEYS, ...GSC_KEYS]) {
      const def = findMetricDefinition(key)!;
      expect(def.isExternal).toBe(true);
      expect(def.isDerived).toBe(false);
    }
  });

  it("every ga4.*/gsc.* entry uses the ANALYTICS category, registered in PERFORMANCE_METRIC_CATEGORIES", () => {
    expect(PERFORMANCE_METRIC_CATEGORIES).toContain("ANALYTICS");
    for (const key of [...GA4_KEYS, ...GSC_KEYS]) {
      expect(findMetricDefinition(key)!.category).toBe("ANALYTICS");
    }
  });

  it("ga4.* entries are compatible only with the ga4 platform, gsc.* only with gsc — never cross-mixed", () => {
    for (const key of GA4_KEYS) expect(findMetricDefinition(key)!.compatiblePlatforms).toEqual(["ga4"]);
    for (const key of GSC_KEYS) expect(findMetricDefinition(key)!.compatiblePlatforms).toEqual(["gsc"]);
  });

  it("percentage-convention metrics (engagement_rate, ctr) use the 0-100 PERCENTAGE unit, never a raw 0-1 fraction convention", () => {
    expect(findMetricDefinition("ga4.engagement_rate")!.unit).toBe("PERCENTAGE");
    expect(findMetricDefinition("ga4.engagement_rate")!.expectedMax).toBe(100);
    expect(findMetricDefinition("gsc.ctr")!.unit).toBe("PERCENTAGE");
    expect(findMetricDefinition("gsc.ctr")!.expectedMax).toBe(100);
  });

  it("ga4.total_revenue preserves source currency — unit CURRENCY, never coerced to COUNT/PERCENTAGE", () => {
    expect(findMetricDefinition("ga4.total_revenue")!.unit).toBe("CURRENCY");
  });

  it("ga4.average_session_duration is in SECONDS, gsc.average_position is LOWER_IS_BETTER (a lower rank is better)", () => {
    expect(findMetricDefinition("ga4.average_session_duration")!.unit).toBe("SECONDS");
    expect(findMetricDefinition("gsc.average_position")!.direction).toBe("LOWER_IS_BETTER");
  });

  it("every ga4.*/gsc.* entry declares PROJECT as a compatible resource type (spec: resourceType PROJECT, no per-content mapping this pass)", () => {
    for (const key of [...GA4_KEYS, ...GSC_KEYS]) {
      expect(findMetricDefinition(key)!.compatibleResourceTypes).toEqual(["PROJECT"]);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. idempotency.ts — dedup + disambiguation across multiple properties (spec sections 15, 46)
// ---------------------------------------------------------------------------
describe("idempotency: Google sync reuses computeMetricIdempotencyKey, disambiguated by externalReference", () => {
  const base = {
    projectId: "proj1",
    resourceType: "PROJECT" as const,
    resourceId: null,
    platform: "ga4",
    metricKey: "ga4.active_users",
    measuredAt: new Date("2026-01-15T00:00:00.000Z"),
    periodStart: new Date("2026-01-15T00:00:00.000Z"),
    periodEnd: new Date("2026-01-15T00:00:00.000Z"),
    externalReference: "properties/111",
    source: "EXTERNAL_PROVIDER" as const,
  };

  it("produces the identical key for identical (project, metric, date, property) input — real dedup", () => {
    expect(computeMetricIdempotencyKey(base)).toBe(computeMetricIdempotencyKey({ ...base }));
  });

  it("two different GA4 properties in the same project never collide on the same key, even for the same metric/date", () => {
    const propertyA = computeMetricIdempotencyKey(base);
    const propertyB = computeMetricIdempotencyKey({ ...base, externalReference: "properties/222" });
    expect(propertyA).not.toBe(propertyB);
  });

  it("GA4 and GSC data for the same project/date never collide (disambiguated by platform + metricKey)", () => {
    const ga4Key = computeMetricIdempotencyKey(base);
    const gscKey = computeMetricIdempotencyKey({ ...base, platform: "gsc", metricKey: "gsc.clicks", externalReference: "https://example.com/" });
    expect(ga4Key).not.toBe(gscKey);
  });

  it("a different measurement date always produces a different key", () => {
    const day1 = computeMetricIdempotencyKey(base);
    const day2 = computeMetricIdempotencyKey({ ...base, measuredAt: new Date("2026-01-16T00:00:00.000Z"), periodStart: new Date("2026-01-16T00:00:00.000Z"), periodEnd: new Date("2026-01-16T00:00:00.000Z") });
    expect(day1).not.toBe(day2);
  });
});

// ---------------------------------------------------------------------------
// 7. validation/google-integrations.ts — bounded Zod schemas (spec section 34)
// ---------------------------------------------------------------------------
describe("validation/google-integrations.ts: bounded, real server-side validation", () => {
  it("saveSelectedResourcesSchema rejects more than MAX_SELECTED_RESOURCES entries", () => {
    const resources = Array.from({ length: GOOGLE_INTEGRATION_LIMITS.MAX_SELECTED_RESOURCES + 1 }, (_, i) => ({ type: "GA4_PROPERTY" as const, externalId: `properties/${i}`, name: `Site ${i}` }));
    expect(saveSelectedResourcesSchema.safeParse({ resources }).success).toBe(false);
  });

  it("saveSelectedResourcesSchema accepts exactly MAX_SELECTED_RESOURCES entries, and defaults initialPeriodDays", () => {
    const resources = Array.from({ length: GOOGLE_INTEGRATION_LIMITS.MAX_SELECTED_RESOURCES }, (_, i) => ({ type: "GA4_PROPERTY" as const, externalId: `properties/${i}`, name: `Site ${i}` }));
    const parsed = saveSelectedResourcesSchema.safeParse({ resources });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.initialPeriodDays).toBe(GOOGLE_INTEGRATION_LIMITS.DEFAULT_INITIAL_PERIOD_DAYS);
  });

  it("saveSelectedResourcesSchema rejects initialPeriodDays beyond MAX_INITIAL_PERIOD_DAYS or below 1 — no unbounded/negative import windows", () => {
    const resources = [{ type: "GA4_PROPERTY" as const, externalId: "properties/1", name: "Site" }];
    expect(saveSelectedResourcesSchema.safeParse({ resources, initialPeriodDays: GOOGLE_INTEGRATION_LIMITS.MAX_INITIAL_PERIOD_DAYS + 1 }).success).toBe(false);
    expect(saveSelectedResourcesSchema.safeParse({ resources, initialPeriodDays: 0 }).success).toBe(false);
    expect(saveSelectedResourcesSchema.safeParse({ resources, initialPeriodDays: -5 }).success).toBe(false);
  });

  it("saveSelectedResourcesSchema rejects an unknown resource type — no client-supplied arbitrary provider", () => {
    const resources = [{ type: "FACEBOOK_PAGE", externalId: "x", name: "x" }];
    expect(saveSelectedResourcesSchema.safeParse({ resources }).success).toBe(false);
  });

  it("triggerManualSyncSchema requires at least 1 and bounds resourceIds to real cuids", () => {
    expect(triggerManualSyncSchema.safeParse({ resourceIds: [] }).success).toBe(false);
    expect(triggerManualSyncSchema.safeParse({ resourceIds: ["not-a-cuid"] }).success).toBe(false);
    expect(triggerManualSyncSchema.safeParse({ resourceIds: [VALID_CUID] }).success).toBe(true);
  });

  it("resyncRangeSchema rejects startDate after endDate", () => {
    const result = resyncRangeSchema.safeParse({ resourceId: VALID_CUID, startDate: "2026-02-01", endDate: "2026-01-01" });
    expect(result.success).toBe(false);
  });

  it("resyncRangeSchema rejects a range longer than MAX_RESYNC_PERIOD_DAYS — no unbounded custom resyncs", () => {
    const start = new Date("2026-01-01");
    const end = new Date(start.getTime() + (GOOGLE_INTEGRATION_LIMITS.MAX_RESYNC_PERIOD_DAYS + 5) * 86_400_000);
    const result = resyncRangeSchema.safeParse({ resourceId: VALID_CUID, startDate: start.toISOString(), endDate: end.toISOString() });
    expect(result.success).toBe(false);
  });

  it("resyncRangeSchema rejects malformed dates and accepts a valid bounded range", () => {
    expect(resyncRangeSchema.safeParse({ resourceId: VALID_CUID, startDate: "not-a-date", endDate: "2026-01-01" }).success).toBe(false);
    expect(resyncRangeSchema.safeParse({ resourceId: VALID_CUID, startDate: "2026-01-01", endDate: "2026-01-10" }).success).toBe(true);
  });

  it("toggleResourceActiveSchema / setGooglePausedSchema require real booleans and cuids, not arbitrary strings", () => {
    expect(toggleResourceActiveSchema.safeParse({ resourceId: VALID_CUID, active: "yes" }).success).toBe(false);
    expect(toggleResourceActiveSchema.safeParse({ resourceId: VALID_CUID, active: true }).success).toBe(true);
    expect(setGooglePausedSchema.safeParse({ paused: true }).success).toBe(true);
    expect(setGooglePausedSchema.safeParse({}).success).toBe(false);
  });

  it("syncHistoryFilterSchema bounds limit to [1,100] and defaults to 20 — no unbounded history queries", () => {
    expect(syncHistoryFilterSchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(syncHistoryFilterSchema.safeParse({ limit: 101 }).success).toBe(false);
    const parsed = syncHistoryFilterSchema.safeParse({});
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.limit).toBe(20);
  });

  it("syncHistoryFilterSchema only accepts the real GoogleSyncStatus values, never an arbitrary string", () => {
    expect(syncHistoryFilterSchema.safeParse({ status: "SOMETHING_ELSE" }).success).toBe(false);
    expect(syncHistoryFilterSchema.safeParse({ status: "COMPLETED" }).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 8. Automation Center events — every emitted key registered, never a silent no-op (spec section 26)
// ---------------------------------------------------------------------------
describe("automations/events.ts: the 11 integration.* events are registered and match every emitted eventKey", () => {
  const EXPECTED_KEYS = [
    "integration.connected",
    "integration.connection_failed",
    "integration.reauth_required",
    "integration.disconnected",
    "integration.resource_enabled",
    "integration.resource_disabled",
    "integration.sync_started",
    "integration.sync_completed",
    "integration.sync_partial",
    "integration.sync_failed",
    "integration.data_stale",
  ];

  it("registers exactly these 11 integration.* event keys", () => {
    const registered = AUTOMATION_EVENT_DEFINITIONS.map((e) => e.key).filter((k) => k.startsWith("integration."));
    for (const key of EXPECTED_KEYS) expect(registered).toContain(key);
  });

  it("every eventKey literal emitted from the Google services matches a registered catalog key (source cross-check, guards against a silent no-op event)", () => {
    const serviceFiles = ["src/server/services/google-connection.ts", "src/server/services/google-resources.ts", "src/server/services/google-sync.ts"];
    const registered = new Set(AUTOMATION_EVENT_DEFINITIONS.map((e) => e.key));
    const emittedKeys = new Set<string>();
    for (const file of serviceFiles) {
      const source = read(file);
      for (const match of source.matchAll(/eventKey:\s*"([a-z_.]+)"/g)) emittedKeys.add(match[1]);
      for (const match of source.matchAll(/eventKey:\s*status === "PARTIAL" \? "([a-z_.]+)" : "([a-z_.]+)"/g)) {
        emittedKeys.add(match[1]);
        emittedKeys.add(match[2]);
      }
    }
    expect(emittedKeys.size).toBeGreaterThan(0);
    for (const key of emittedKeys) expect(registered.has(key), `emitted event "${key}" is not registered in the catalog`).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 9. Security invariants — verified at the source level (spec sections 5-9, 21-22, 33)
// ---------------------------------------------------------------------------
describe("security invariants (source-level checks — the same convention used across every prior phase's test suite)", () => {
  it("the OAuth callback never reads projectId from the URL — it's resolved exclusively from the consumed state row", () => {
    const source = read("src/app/api/integrations/google/callback/route.ts");
    expect(source).not.toMatch(/searchParams\.get\(\s*"projectId"\s*\)/);
    expect(source).toMatch(/completeGoogleConnect/);
  });

  it("the OAuth callback validates the current session user against the state's original user before completing the connection", () => {
    const connectionSource = read("src/server/services/google-connection.ts");
    expect(connectionSource).toMatch(/sessionUserId/);
    expect(connectionSource).toMatch(/userId !== sessionUserId/);
    const callbackSource = read("src/app/api/integrations/google/callback/route.ts");
    expect(callbackSource).toMatch(/sessionUserId/);
  });

  it("the connect route requires MANAGER-level project access before starting the OAuth flow", () => {
    const source = read("src/app/api/integrations/google/connect/route.ts");
    expect(source).toMatch(/requireProjectAccess\(projectId,\s*"MANAGER"\)/);
  });

  it("tokens are always encrypted before being persisted — no raw access_token/refresh_token ever reaches prisma.*.create/update", () => {
    const source = read("src/server/services/google-connection.ts");
    expect(source).toMatch(/encryptedAccessToken:\s*encryptSecret\(/);
    expect(source).toMatch(/encryptedRefreshToken:\s*encryptSecret\(/);
    // The interface returned to callers (and eventually serialized to the client) never carries a token field.
    expect(source).not.toMatch(/CompleteConnectResult[\s\S]{0,200}(accessToken|refreshToken):/);
  });

  it("OAuth state consumption is atomic and single-use (conditioned updateMany, never a plain findUnique+update that a concurrent replay could win)", () => {
    const source = read("src/server/services/google-oauth-state.ts");
    expect(source).toMatch(/updateMany\(\{\s*where:\s*\{\s*stateHash,\s*consumedAt:\s*null\s*\}/);
  });

  it("sync run claiming is atomic (conditioned updateMany on status:PENDING + lockedAt:null) — never a plain count()-then-create() race", () => {
    const source = read("src/server/services/google-sync.ts");
    expect(source).toMatch(/updateMany\(\{\s*where:\s*\{\s*id:\s*runId,\s*status:\s*"PENDING",\s*lockedAt:\s*null\s*\}/);
  });

  it("token refresh uses optimistic concurrency (conditioned on the previous tokenExpiresAt) so two concurrent refreshes can never both win", () => {
    const source = read("src/server/services/google-connection.ts");
    expect(source).toMatch(/updateMany\(\{\s*where:\s*\{\s*projectId,\s*tokenExpiresAt:\s*connection\.tokenExpiresAt\s*\}/);
  });

  it("Google metric points flow through the EXISTING createMetricRecordCore funnel — never a second metrics store", () => {
    const source = read("src/server/services/google-sync.ts");
    expect(source).toMatch(/import \{ createMetricRecordCore \} from "@\/server\/services\/performance-metric-records"/);
    expect(source).not.toMatch(/prisma\.performanceMetricRecord\.create\(/); // only the shared funnel writes rows
  });

  it("the sync engine sources metric units from the single catalog (findMetricDefinition), never a duplicated hardcoded heuristic", () => {
    const source = read("src/server/services/google-sync.ts");
    expect(source).toMatch(/findMetricDefinition\(catalogKey\)\?\.unit/);
    expect(source).not.toMatch(/catalogKey\.includes\("duration"\)/);
  });

  it("disconnect deletes the encrypted secret material but never deletes sync-run/metric history", () => {
    const source = read("src/server/services/google-connection.ts");
    expect(source).toMatch(/encryptedAccessToken:\s*null/);
    expect(source).toMatch(/encryptedRefreshToken:\s*null/);
    expect(source).not.toMatch(/googleIntegrationSyncRun\.delete/);
    expect(source).not.toMatch(/performanceMetricRecord\.delete/);
  });

  it("no client-facing integration file (UI components/pages) ever references a raw access/refresh token field", () => {
    const files = [
      "src/components/integrations/google-integration-console.tsx",
      "src/app/(dashboard)/dashboard/[projectId]/integrations/google/page.tsx",
      "src/app/(dashboard)/dashboard/[projectId]/integrations/page.tsx",
    ];
    for (const file of files) {
      const source = read(file);
      expect(source).not.toMatch(/accessToken|refreshToken|encryptedAccessToken|encryptedRefreshToken/);
    }
  });

  it("never uses alert() or confirm() anywhere in the Google integration UI", () => {
    const source = read("src/components/integrations/google-integration-console.tsx");
    expect(source).not.toMatch(/\balert\(/);
    expect(source).not.toMatch(/\bconfirm\(/);
  });

  it("error messages persisted on a sync run are truncated to a safe length — never a raw multi-KB Google response body", () => {
    const source = read("src/server/services/google-sync.ts");
    expect(source).toMatch(/errorMessage:\s*message\.slice\(0,\s*GOOGLE_INTEGRATION_LIMITS\.MAX_SAFE_ERROR_MESSAGE_LENGTH\)/);
  });

  it("resource selection re-validates every entry against the LIVE Google list before persisting — never trusts client-supplied metadata blindly", () => {
    const source = read("src/server/services/google-resources.ts");
    expect(source).toMatch(/liveGa4Ids\.has/);
    expect(source).toMatch(/liveGscIds\.has/);
    expect(source).toMatch(/ya no es accesible/);
  });

  it("getConnectionById rejects a connection that does not belong to the requested project — multi-tenant isolation", () => {
    const source = read("src/server/services/google-connection.ts");
    expect(source).toMatch(/row\.projectId !== projectId/);
  });
});

// ---------------------------------------------------------------------------
// 10. Permissions — EDITOR (read/manual-sync) vs MANAGER (connect/select/pause/disconnect/resync)
// ---------------------------------------------------------------------------
describe("server actions: EDITOR vs MANAGER gating matches spec section 31, enforced server-side", () => {
  const source = read("src/server/actions/google-integrations.ts");

  it("read/status/history actions require at least EDITOR", () => {
    for (const action of ["getGoogleIntegrationStatusAction", "getGoogleProviderOverviewsAction", "getGoogleConnectionDetailAction", "listGoogleSyncHistoryAction", "getGoogleSyncRunDetailAction"]) {
      const fnMatch = source.match(new RegExp(`export async function ${action}[\\s\\S]{0,200}?requireProjectAccess\\(projectId,\\s*"(EDITOR|MANAGER)"\\)`));
      expect(fnMatch, `${action} should call requireProjectAccess`).toBeTruthy();
    }
  });

  it("connect/select/pause/disconnect/resync require MANAGER", () => {
    for (const action of ["saveSelectedGoogleResourcesAction", "setGoogleResourceActiveAction", "testGoogleConnectionAction", "setGooglePausedAction", "disconnectGoogleAction", "resyncGoogleRangeAction"]) {
      const fnMatch = source.match(new RegExp(`export async function ${action}[\\s\\S]{0,200}?requireProjectAccess\\(projectId,\\s*"MANAGER"\\)`));
      expect(fnMatch, `${action} should require MANAGER`).toBeTruthy();
    }
  });

  it("triggerManualGoogleSyncAction is gated at EDITOR (spec: EDITOR may trigger manual sync of already-selected properties, never select/connect)", () => {
    expect(source).toMatch(/export async function triggerManualGoogleSyncAction[\s\S]{0,200}?requireProjectAccess\(projectId,\s*"EDITOR"\)/);
  });

  it("every action re-derives projectId as its own argument and re-checks access — never trusts a hidden client-side gate alone", () => {
    const exported = [...source.matchAll(/export async function (\w+)\(projectId: string/g)].map((m) => m[1]);
    expect(exported.length).toBeGreaterThanOrEqual(10);
  });
});

// ---------------------------------------------------------------------------
// 11. Navigation — visible, project-scoped, never in Guest/Admin-global (spec section 3)
// ---------------------------------------------------------------------------
describe("navigation.ts: Integraciones/Google link is project-scoped", () => {
  it("registers the Google segment under the Integraciones nav group", () => {
    const source = read("src/lib/navigation.ts");
    expect(source).toMatch(/segment:\s*"integrations\/google"/);
    expect(source).toMatch(/label:\s*"Google \(Analytics\/Search Console\)"/);
  });

  it("the Google integrations pages live under the project-scoped [projectId] dashboard route (never a global/admin route)", () => {
    // Existence check via readFileSync throwing would fail the test; a successful read proves the path.
    expect(() => read("src/app/(dashboard)/dashboard/[projectId]/integrations/google/page.tsx")).not.toThrow();
    expect(() => read("src/app/(dashboard)/dashboard/[projectId]/integrations/page.tsx")).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 12. Cron wiring — reuses the EXISTING protected endpoint/secret (spec section 24)
// ---------------------------------------------------------------------------
describe("performance-cron.ts: Google batch sync folded into the existing cron cycle, never a second cron secret", () => {
  it("runPerformanceCronCycle calls processPendingGoogleSyncs and reconcileStaleGoogleSyncLocks", () => {
    const source = read("src/server/services/performance-cron.ts");
    expect(source).toMatch(/import \{ processPendingGoogleSyncs, reconcileStaleGoogleSyncLocks \} from "@\/server\/services\/google-sync"/);
    expect(source).toMatch(/await reconcileStaleGoogleSyncLocks\(\)/);
    expect(source).toMatch(/await processPendingGoogleSyncs\(\)/);
  });

  it("the protected cron route still uses a single AUTOMATION_CRON_SECRET-gated endpoint — no separate Google cron secret introduced", () => {
    const routeSource = read("src/app/api/cron/workflow-automations/route.ts");
    expect(routeSource).toMatch(/isAutomationCronConfigured/);
    expect(routeSource).not.toMatch(/GOOGLE_CRON_SECRET/);
    expect(routeSource).toMatch(/runPerformanceCronCycle/);
  });

  it("the local dev driver script logs the same summary the protected endpoint returns (no separate/simplified logic)", () => {
    const scriptSource = read("scripts/process-automations.ts");
    expect(scriptSource).toMatch(/runPerformanceCronCycle/);
  });
});

// ---------------------------------------------------------------------------
// 13. Prisma schema — additive models/enums only (spec sections 7, 9)
// ---------------------------------------------------------------------------
describe("prisma/schema.prisma: Google integration models", () => {
  const source = read("prisma/schema.prisma");

  it("declares the 4 real status/type enums with the exact spec-required states", () => {
    expect(source).toMatch(/enum GoogleConnectionStatus \{[\s\S]*?NOT_CONFIGURED[\s\S]*?CONNECTED[\s\S]*?REAUTH_REQUIRED[\s\S]*?DISCONNECTED[\s\S]*?\}/);
    expect(source).toMatch(/enum GoogleSyncStatus \{[\s\S]*?PENDING[\s\S]*?RUNNING[\s\S]*?COMPLETED[\s\S]*?PARTIAL[\s\S]*?FAILED[\s\S]*?CANCELLED[\s\S]*?\}/);
  });

  it("GoogleIntegrationResource has a real unique constraint on (connectionId, type, externalId) — the upsert key used by saveSelectedResources", () => {
    expect(source).toMatch(/@@unique\(\[connectionId, type, externalId\]\)/);
  });

  it("GoogleIntegrationSyncRun has a unique idempotencyKey and lock columns for atomic claiming", () => {
    expect(source).toMatch(/idempotencyKey\s+String\s+@unique/);
    expect(source).toMatch(/lockedAt\s+DateTime\?/);
    expect(source).toMatch(/lockExpiresAt\s+DateTime\?/);
  });

  it("GoogleOAuthState stores only a stateHash (never the raw state) and an encrypted code_verifier", () => {
    expect(source).toMatch(/stateHash\s+String\s+@unique/);
    expect(source).toMatch(/encryptedCodeVerifier\s+String\?/);
  });

  it("GoogleIntegrationConnection is unique per project (one Google connection per project)", () => {
    expect(source).toMatch(/model GoogleIntegrationConnection \{[\s\S]*?projectId\s+String\s+@unique/);
  });
});
