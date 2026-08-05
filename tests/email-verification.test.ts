import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  generateVerificationToken,
  hashVerificationToken,
  verificationTokenExpiry,
  isVerificationTokenExpired,
  canResendVerificationEmail,
  secondsUntilResendAllowed,
  EMAIL_VERIFICATION_TOKEN_TTL_MS,
  EMAIL_VERIFICATION_RESEND_COOLDOWN_MS,
} from "@/lib/auth/verification-token";
import { buildVerificationUrl, buildVerificationEmail } from "@/lib/email/verification-email";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

// ---------------------------------------------------------------------------
// 1. Pure token logic — real, unmocked unit tests
// ---------------------------------------------------------------------------
describe("verification-token.ts: token generation, hashing, expiry, cooldown (pure, real unit tests)", () => {
  it("generateVerificationToken produces a long, URL-safe, non-deterministic value", () => {
    const a = generateVerificationToken();
    const b = generateVerificationToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40); // 32 bytes base64url-encoded
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/); // base64url alphabet only — safe to drop straight into a query string
  });

  it("hashVerificationToken is deterministic and one-way in shape (fixed-length hex, never resembles the input)", () => {
    const raw = generateVerificationToken();
    const hashed = hashVerificationToken(raw);
    expect(hashVerificationToken(raw)).toBe(hashed); // same input -> same hash, every time
    expect(hashed).toMatch(/^[a-f0-9]{64}$/); // sha256 hex digest
    expect(hashed).not.toBe(raw);
    expect(hashed).not.toContain(raw);
  });

  it("two different raw tokens never hash to the same value (no observed collisions across many samples)", () => {
    const hashes = new Set(Array.from({ length: 200 }, () => hashVerificationToken(generateVerificationToken())));
    expect(hashes.size).toBe(200);
  });

  it("verificationTokenExpiry is exactly TTL ms in the future from `now`", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(verificationTokenExpiry(now).getTime()).toBe(now.getTime() + EMAIL_VERIFICATION_TOKEN_TTL_MS);
  });

  it("isVerificationTokenExpired: false before expiry, true at and after expiry (never verifies once past the boundary)", () => {
    const expiresAt = new Date("2026-01-02T00:00:00.000Z");
    expect(isVerificationTokenExpired(expiresAt, new Date("2026-01-01T23:59:59.999Z"))).toBe(false);
    expect(isVerificationTokenExpired(expiresAt, new Date("2026-01-02T00:00:00.000Z"))).toBe(true);
    expect(isVerificationTokenExpired(expiresAt, new Date("2026-01-02T00:00:00.001Z"))).toBe(true);
  });

  it("the TTL is a real, positive, bounded window — 24 hours, never unbounded", () => {
    expect(EMAIL_VERIFICATION_TOKEN_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("canResendVerificationEmail: true when no token was ever issued", () => {
    expect(canResendVerificationEmail(null)).toBe(true);
  });

  it("canResendVerificationEmail: false inside the cooldown window, true once it has fully elapsed", () => {
    const lastIssuedAt = new Date("2026-01-01T00:00:00.000Z");
    expect(canResendVerificationEmail(lastIssuedAt, new Date("2026-01-01T00:00:30.000Z"))).toBe(false);
    expect(canResendVerificationEmail(lastIssuedAt, new Date(lastIssuedAt.getTime() + EMAIL_VERIFICATION_RESEND_COOLDOWN_MS))).toBe(true);
  });

  it("secondsUntilResendAllowed counts down to exactly 0, never negative", () => {
    const lastIssuedAt = new Date("2026-01-01T00:00:00.000Z");
    expect(secondsUntilResendAllowed(lastIssuedAt, new Date("2026-01-01T00:00:00.000Z"))).toBe(60);
    expect(secondsUntilResendAllowed(lastIssuedAt, new Date("2026-01-01T00:00:30.000Z"))).toBe(30);
    expect(secondsUntilResendAllowed(lastIssuedAt, new Date(lastIssuedAt.getTime() + EMAIL_VERIFICATION_RESEND_COOLDOWN_MS))).toBe(0);
    expect(secondsUntilResendAllowed(lastIssuedAt, new Date("2026-01-01T01:00:00.000Z"))).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Email content — real, unmocked unit tests
// ---------------------------------------------------------------------------
describe("verification-email.ts: link/content building (pure, real unit tests)", () => {
  it("buildVerificationUrl embeds the raw token as a query param under /verify-email", () => {
    const url = buildVerificationUrl("abc123");
    expect(url).toContain("/verify-email");
    expect(new URL(url).searchParams.get("token")).toBe("abc123");
  });

  it("the base URL comes from the app's own config (APP_URL env var), never a hardcoded host", () => {
    const source = read("src/lib/email/verification-email.ts");
    expect(source).toMatch(/import \{ appConfig \} from "@\/lib\/config"/);
    expect(source).toMatch(/new URL\("\/verify-email", appConfig\.url\)/);
    expect(source).not.toMatch(/https?:\/\/[a-z0-9.-]+\.(com|app|dev)/i); // no hardcoded production-looking host anywhere
  });

  it("buildVerificationEmail's html and text both contain the real verification link, and neither exposes the raw token outside that link", () => {
    const email = buildVerificationEmail("user@example.com", "the-raw-token");
    expect(email.to).toBe("user@example.com");
    expect(email.html).toContain("the-raw-token");
    expect(email.text).toContain("the-raw-token");
    // The token appears only as part of a /verify-email?token= URL, never bare.
    const bareTokenOutsideUrl = /(?<!token=)the-raw-token/;
    expect(email.html.replace(/\/verify-email\?token=the-raw-token/g, "")).not.toMatch(bareTokenOutsideUrl);
  });

  it("delegates markup to the shared reusable template — never improvised inline HTML of its own", () => {
    const source = read("src/lib/email/verification-email.ts");
    expect(source).toMatch(/import \{ renderEmailTemplate \} from "@\/lib\/email\/template"/);
    expect(source).toMatch(/renderEmailTemplate\(\{/);
    expect(source).not.toMatch(/<p>/); // no hand-written HTML tags left in this file
  });

  it("the rendered email contains every required element: project name, greeting, button, url, alt link text, expiration notice, and footer", async () => {
    const email = buildVerificationEmail("user@example.com", "the-raw-token");
    const { appConfig } = await import("@/lib/config");
    expect(email.html).toContain(appConfig.name); // project name
    expect(email.html).toContain("Hola,"); // professional greeting
    expect(email.html).toContain("Verificar mi correo"); // main button label
    expect(email.html).toContain(buildVerificationUrl("the-raw-token")); // verification URL
    expect(email.html).toMatch(/Si el bot[oó]n no funciona/); // alt/fallback text
    expect(email.html).toMatch(/v[aá]lido durante 24 horas/); // expiration note
    expect(email.html).toMatch(/mensaje autom[aá]tico/); // footer
  });
});

// ---------------------------------------------------------------------------
// 2b. Shared email template — pure, real unit tests
// ---------------------------------------------------------------------------
describe("template.ts: reusable HTML/text email layout (pure, real unit tests)", () => {
  it("is a single reusable renderer that any email builder can call — not duplicated per email type", () => {
    const source = read("src/lib/email/template.ts");
    expect(source).toMatch(/export function renderEmailTemplate/);
  });

  it("HTML-escapes dynamic content so user-influenced text (e.g. project name) can never break out of the markup", async () => {
    const { renderEmailTemplate } = await import("@/lib/email/template");
    const { html } = renderEmailTemplate({
      greeting: "Hola <script>alert(1)</script>,",
      paragraphs: ["<b>bold</b> & \"quoted\""],
      ctaLabel: "Ir",
      ctaUrl: "https://example.com/?a=1&b=2",
      expirationNote: "expira pronto",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;"); // both the "&" in the copy and the URL's query string
  });

  it("produces both an html and a plain-text version containing the same call-to-action URL", async () => {
    const { renderEmailTemplate } = await import("@/lib/email/template");
    const { html, text } = renderEmailTemplate({
      greeting: "Hola,",
      paragraphs: ["Cuerpo del mensaje."],
      ctaLabel: "Continuar",
      ctaUrl: "https://example.com/action?token=xyz",
      expirationNote: "Válido 24 horas.",
    });
    expect(html).toContain("https://example.com/action?token=xyz");
    expect(text).toContain("https://example.com/action?token=xyz");
    expect(text).toContain("Continuar");
    expect(text).toContain("Válido 24 horas.");
  });
});

// ---------------------------------------------------------------------------
// 3. Registration — creates an unverified user, issues a token, attempts to send
// ---------------------------------------------------------------------------
describe("Registration: creates an unverified account, issues a token, attempts delivery, never blocks on delivery failure", () => {
  const actions = read("src/server/actions/auth.ts");
  const fn = actions.match(/export async function registerUser[\s\S]*?\n\}/)![0];

  it("creates the user WITHOUT setting emailVerified — relies on the schema's own null default, never marks it verified at signup", () => {
    expect(fn).toMatch(/prisma\.user\.create\(\{\s*data: \{ name, email: normalizedEmail, passwordHash \},?\s*\}\)/);
    expect(fn).not.toMatch(/emailVerified:\s*new Date\(\)/);
  });

  it("issues a real, expiring token and attempts to send it — via the shared service, never a second/duplicated implementation", () => {
    expect(fn).toMatch(/await sendVerificationEmailToUser\(user\.id, user\.email\)/);
    expect(actions).toMatch(/import \{ sendVerificationEmailToUser \} from "@\/server\/services\/email-verification"/);
  });

  it("registration never fails just because delivery fails — the account and token still exist either way", () => {
    // No try/catch swallowing an error into a failed registration; the send call's own result is ignored on purpose (never awaited into a conditional that could return an error state).
    expect(fn).not.toMatch(/if \(!.*sendVerificationEmailToUser/);
    expect(fn).toMatch(/return \{ success: true \};/);
  });
});

// ---------------------------------------------------------------------------
// 4. Login — rejects unverified accounts with a distinct, safe message
// ---------------------------------------------------------------------------
describe("Login: unverified accounts are rejected with a specific, non-generic, non-leaking message", () => {
  const config = read("src/lib/auth/config.ts");
  const authorizeFn = config.match(/async authorize\(rawCredentials\) \{[\s\S]*?\n      \},/)![0];

  it("the email-verified check happens strictly AFTER the password has already been proven correct — never before, so a wrong password against an unverified account looks identical to a wrong password against any other account", () => {
    const passwordCheckIndex = authorizeFn.indexOf("if (!isValid) return null;");
    const verifiedCheckIndex = authorizeFn.indexOf("EmailNotVerifiedSignInError");
    expect(passwordCheckIndex).toBeGreaterThan(-1);
    expect(verifiedCheckIndex).toBeGreaterThan(-1);
    expect(passwordCheckIndex).toBeLessThan(verifiedCheckIndex);
  });

  it("throws a dedicated CredentialsSignin subclass with a non-sensitive `code`, never returns null (which would show the generic 'wrong credentials' message instead)", () => {
    expect(config).toMatch(/class EmailNotVerifiedSignInError extends CredentialsSignin \{/);
    expect(config).toMatch(/code = "email_not_verified";/);
    expect(authorizeFn).toMatch(/if \(!user\.emailVerified\) throw new EmailNotVerifiedSignInError\(\);/);
  });

  it("the login action catches this specific code and shows a distinct, actionable message — checked BEFORE the generic AuthError fallback", () => {
    const loginSource = read("src/server/actions/login.ts");
    const catchBlock = loginSource.match(/\} catch \(error\) \{[\s\S]*?\n  \}/)![0];
    const specificIndex = catchBlock.indexOf('error.code === "email_not_verified"');
    const genericIndex = catchBlock.indexOf("error instanceof AuthError");
    expect(specificIndex).toBeGreaterThan(-1);
    expect(genericIndex).toBeGreaterThan(-1);
    expect(specificIndex).toBeLessThan(genericIndex);
    expect(catchBlock).toMatch(/Debes verificar tu correo antes de iniciar sesión/);
  });

  it("never reveals a password, hash, or other internal detail in the verified-status message", () => {
    const loginSource = read("src/server/actions/login.ts");
    expect(loginSource).not.toMatch(/passwordHash/);
  });
});

// ---------------------------------------------------------------------------
// 5. Dashboard/session protection — central enforcement, not per-page
// ---------------------------------------------------------------------------
describe("Dashboard/session protection: unverified sessions are blocked centrally (middleware + requireUser), not by trusting the login form alone", () => {
  it("requireUser() throws EmailNotVerifiedError for a real, logged-in, unverified session — distinct from UnauthorizedError (no session at all)", () => {
    const permissions = read("src/lib/permissions/index.ts");
    const fn = permissions.match(/export async function requireUser\(\)[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/if \(!user\) throw new UnauthorizedError\(\);/);
    expect(fn).toMatch(/if \(!user\.emailVerified\) throw new EmailNotVerifiedError\(\);/);
  });

  it("getCurrentUser() itself never rejects an unverified session — it populates emailVerified on the returned object but never throws/redirects on it; the pending screen, resend, and logout all still need to work for that exact user", () => {
    const permissions = read("src/lib/permissions/index.ts");
    const fn = permissions.match(/export async function getCurrentUser\(\)[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/emailVerified: Boolean\(session\.user\.emailVerified\)/); // populates it...
    expect(fn).not.toMatch(/throw|redirect/); // ...but never acts on it
  });

  it("proxy.ts redirects an authenticated-but-unverified request away from /dashboard/* and /admin/* to /verify-email — the single central point covering every project-scoped and admin page without repeating the check per page", () => {
    const proxy = read("src/proxy.ts");
    expect(proxy).toMatch(/isLoggedIn && \(isDashboardRoute \|\| isAdminRoute\) && !req\.auth\?\.user\?\.emailVerified/);
    expect(proxy).toMatch(/NextResponse\.redirect\(new URL\("\/verify-email", req\.nextUrl\.origin\)\)/);
  });

  it("/verify-email itself is never inside the middleware's matcher — no redirect loop is possible", () => {
    const proxy = read("src/proxy.ts");
    const matcherBlock = proxy.match(/matcher: \[[\s\S]*?\]/)![0];
    expect(matcherBlock).not.toMatch(/verify-email/);
    expect(matcherBlock).toMatch(/"\/dashboard\/:path\*"/);
    expect(matcherBlock).toMatch(/"\/admin\/:path\*"/);
  });

  it("the two authenticated pages outside the /dashboard/* URL space (route-group pages /account and /notifications) each carry their own explicit check, since middleware's matcher can't reach them", () => {
    for (const relativePath of ["src/app/(dashboard)/account/page.tsx", "src/app/(dashboard)/notifications/page.tsx"]) {
      const source = read(relativePath);
      expect(source).toMatch(/if \(!(currentUser|user)\.emailVerified\) redirect\("\/verify-email"\);/);
    }
  });

  it("every server action ultimately reaches requireUser() (directly, or via requireAdmin/requireSuperAdmin/requireProjectAccess) — no separate/duplicated verification check was added elsewhere", () => {
    const permissions = read("src/lib/permissions/index.ts");
    expect((permissions.match(/if \(!user\.emailVerified\)/g) ?? []).length).toBe(1); // exactly one enforcement point
  });
});

// ---------------------------------------------------------------------------
// 6. Verification — a valid token verifies, consumes itself, and can't be reused
// ---------------------------------------------------------------------------
describe("verifyEmailToken: valid token verifies the account, is consumed atomically, and can never be reused", () => {
  const service = read("src/server/services/email-verification.ts");
  const fn = service.match(/export async function verifyEmailToken[\s\S]*?\n\}/)![0];

  it("looks up by the HASH of the raw token — never stores or searches by the raw value", () => {
    expect(fn).toMatch(/const tokenHash = hashVerificationToken\(rawToken\);/);
    expect(fn).toMatch(/prisma\.emailVerificationToken\.findUnique\(\{ where: \{ tokenHash \} \}\)/);
  });

  it("a nonexistent token (unknown hash) resolves to 'invalid'", () => {
    expect(fn).toMatch(/if \(!row\) return \{ status: "invalid" \};/);
  });

  it("an expired-but-unused token resolves to 'expired' — checked before any write happens", () => {
    expect(fn).toMatch(/if \(isVerificationTokenExpired\(row\.expiresAt\)\) return \{ status: "expired" \};/);
  });

  it("success marks the token used AND the user verified inside the SAME transaction — never two separate, independently-failable writes", () => {
    expect(fn).toMatch(/prisma\.\$transaction\(async \(tx\) => \{/);
    expect(fn).toMatch(/tx\.emailVerificationToken\.updateMany\(\{\s*where: \{ id: row\.id, usedAt: null \},\s*data: \{ usedAt: new Date\(\) \},\s*\}\)/);
    expect(fn).toMatch(/tx\.user\.update\(\{ where: \{ id: row\.userId \}, data: \{ emailVerified: new Date\(\) \} \}\)/);
  });

  it("the update is conditioned on usedAt still being null — a concurrent reuse of the exact same token can only ever succeed once (updateMany's count guards it)", () => {
    expect(fn).toMatch(/where: \{ id: row\.id, usedAt: null \}/);
    expect(fn).toMatch(/if \(consumed\.count === 0\) return null;/);
  });

  it("re-submitting the SAME already-used token resolves to 'already_used', distinct from both 'invalid' and 'expired'", () => {
    expect(fn).toMatch(/if \(row\.usedAt\) return \{ status: "already_used" \};/);
    expect(fn).toMatch(/if \(!verifiedUserId\) return \{ status: "already_used" \};/);
  });

  it("the result type only ever has these four shapes — every state the UX section requires a distinct screen for is representable", () => {
    const typeDecl = service.match(/export type VerifyEmailTokenResult =[\s\S]*?\n\n/)![0];
    for (const status of ["verified", "invalid", "expired", "already_used"]) {
      expect(typeDecl).toContain(`"${status}"`);
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Resend — invalidates prior tokens, rate-limits, and cannot enumerate accounts
// ---------------------------------------------------------------------------
describe("Resend: invalidates prior tokens, rate-limited, architecturally immune to account enumeration", () => {
  const createFn = read("src/server/services/email-verification.ts").match(
    /export async function createEmailVerificationToken[\s\S]*?\n\}/
  )![0];
  const resendAction = read("src/server/actions/email-verification.ts");
  const resendFn = resendAction.match(/export async function resendVerificationEmailAction\(\)[\s\S]*?\n\}/)![0];

  it("every new token issuance (registration AND resend both call this) deletes any prior token(s) for the same user first, in the same transaction — at most one active token per user, ever", () => {
    expect(createFn).toMatch(/prisma\.\$transaction\(\[\s*prisma\.emailVerificationToken\.deleteMany\(\{ where: \{ userId \} \}\),\s*prisma\.emailVerificationToken\.create\(/);
  });

  it("resendVerificationEmailAction takes NO parameters — it can only ever act on the CALLER's own session-derived identity, which is what makes account enumeration structurally impossible here (there is no email address input to probe)", () => {
    expect(resendAction).toMatch(/export async function resendVerificationEmailAction\(\): Promise<ResendVerificationState> \{/);
    // No form field, no email argument anywhere in the file.
    expect(resendAction).not.toMatch(/formData\.get\("email"\)/);
    expect(resendAction).not.toMatch(/resendVerificationEmailAction\([^)]+\)/); // never called anywhere with an argument
  });

  it("enforces the resend cooldown server-side before issuing a new token — reusing the same pure cooldown function real-unit-tested above, never a second rate-limit implementation", () => {
    expect(resendFn).toMatch(/const lastIssuedAt = await getLatestVerificationTokenIssuedAt\(user\.id\);/);
    expect(resendFn).toMatch(/if \(!canResendVerificationEmail\(lastIssuedAt\)\) \{/);
    expect(resendFn).toMatch(/secondsUntilResendAllowed\(lastIssuedAt!\)/);
  });

  it("an already-verified account gets a safe, generic no-op response — never re-issues a token or re-sends an email", () => {
    expect(resendFn).toMatch(/if \(user\.emailVerified\) return \{ message: "Tu cuenta ya está verificada\." \};/);
    // The "already verified" branch returns before any token/email call.
    const alreadyVerifiedIndex = resendFn.indexOf("Tu cuenta ya está verificada");
    const sendCallIndex = resendFn.indexOf("sendVerificationEmailToUser");
    expect(alreadyVerifiedIndex).toBeLessThan(sendCallIndex);
  });

  it("uses getCurrentUser() (never actually CALLS requireUser(), which would itself reject the very unverified user this action exists to serve — it's only named in the file's own explanatory comment)", () => {
    expect(resendAction).toMatch(/import \{ getCurrentUser \} from "@\/lib\/permissions";/);
    expect(resendAction).not.toMatch(/await requireUser\(/);
    expect(resendAction).not.toMatch(/\{ requireUser[,\s]/); // never imported either
  });
});

// ---------------------------------------------------------------------------
// 8. Token security hygiene — never logged, never echoed insecurely
// ---------------------------------------------------------------------------
describe("Security: the raw token is never logged, never echoed in an unauthorized response, generated with real crypto", () => {
  it("generateVerificationToken uses node:crypto's randomBytes — never Math.random or a predictable source", () => {
    const source = read("src/lib/auth/verification-token.ts");
    expect(source).toMatch(/import \{ randomBytes, createHash \} from "node:crypto";/);
    expect(source).toMatch(/randomBytes\(TOKEN_BYTES\)\.toString\("base64url"\)/);
    expect(source).not.toMatch(/Math\.random/);
  });

  it("32 bytes (256 bits) of entropy per token — not a short, guessable value", () => {
    const source = read("src/lib/auth/verification-token.ts");
    expect(source).toMatch(/const TOKEN_BYTES = 32;/);
  });

  it("sendEmail sends real mail through the official Resend SDK, never a hand-rolled fetch to a hardcoded endpoint", () => {
    const source = read("src/lib/email/send-email.ts");
    const fn = source.match(/export async function sendEmail[\s\S]*?\n\}/)![0];
    expect(source).toMatch(/import \{ Resend \} from "resend";/);
    expect(fn).toMatch(/new Resend\(apiKey\)/);
    expect(fn).toMatch(/resend\.emails\.send\(\{/);
  });

  it("throws a clear, actionable error when RESEND_API_KEY or EMAIL_FROM is missing — never silently no-ops or fakes a successful send", () => {
    const source = read("src/lib/email/send-email.ts");
    const fn = source.match(/export async function sendEmail[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/const apiKey = process\.env\.RESEND_API_KEY;/);
    expect(fn).toMatch(/if \(!apiKey\) \{/);
    expect(fn).toMatch(/RESEND_API_KEY/);
    expect(fn).toMatch(/const from = process\.env\.EMAIL_FROM;/);
    expect(fn).toMatch(/if \(!from\) \{/);
    expect(fn).toMatch(/EMAIL_FROM/);
  });

  it("the sender address always comes from EMAIL_FROM — never hardcoded and never caller-supplied", () => {
    const fn = read("src/lib/email/send-email.ts").match(/export async function sendEmail[\s\S]*?\n\}/)![0];
    expect(fn).not.toMatch(/from:\s*message\.from/);
    expect(fn).not.toMatch(/from:\s*"[^"]*@/); // no hardcoded literal address
  });

  it("retries ONLY transient failures (Resend rate limit / 5xx / a thrown network error) — a permanent rejection (bad API key, invalid address, validation) is never retried", () => {
    const source = read("src/lib/email/send-email.ts");
    expect(source).toMatch(/rate_limit_exceeded/);
    expect(source).toMatch(/internal_server_error/);
    const fn = source.match(/export async function sendEmail[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/if \(!transient \|\| isLastAttempt\) \{/);
  });

  it("never logs the API key or the email body (html/text, which carry the real verification link/token) — only recipient, subject, and the provider's own error description reach the console or a thrown error, and only ever server-side", () => {
    const fn = read("src/lib/email/send-email.ts").match(/export async function sendEmail[\s\S]*?\n\}/)![0];
    const loggedCalls = [
      ...fn.matchAll(/console\.error\([\s\S]*?\);/g),
      ...fn.matchAll(/throw new Error\([\s\S]*?\);/g),
    ].map((m) => m[0]);
    expect(loggedCalls.length).toBeGreaterThan(0);
    for (const call of loggedCalls) {
      expect(call).not.toMatch(/\bapiKey\b/);
      expect(call).not.toMatch(/message\.html/);
      expect(call).not.toMatch(/message\.text/);
    }
    expect(loggedCalls.some((call) => /message\.to/.test(call))).toBe(true);
    expect(loggedCalls.some((call) => /message\.subject/.test(call))).toBe(true);
  });

  it("sendVerificationEmailToUser logs failures server-side only, via console.error, never returns the raw token or the thrown error's message to its own caller", () => {
    const service = read("src/server/services/email-verification.ts");
    const fn = service.match(/export async function sendVerificationEmailToUser[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/console\.error\(/);
    expect(fn).toMatch(/return \{ sent: false \};/);
    expect(fn).not.toMatch(/return \{ sent: false, .*error/);
  });

  it("the /verify-email page never renders the raw token back into the page — it's read from searchParams and passed straight into verifyEmailToken, never interpolated into JSX", () => {
    const page = read("src/app/(auth)/verify-email/page.tsx");
    expect(page).toMatch(/const \{ token \} = await searchParams;/);
    expect(page).toMatch(/verifyEmailToken\(token\)/);
    expect(page).not.toMatch(/\{token\}/); // never interpolated directly into JSX
    expect(page).not.toMatch(/dangerouslySetInnerHTML/);
  });

  it("resend/verify actions never accept or forward a client-supplied userId — always derived from the server-side session", () => {
    const resendAction = read("src/server/actions/email-verification.ts");
    expect(resendAction).not.toMatch(/userId:\s*(input|params)\./);
  });
});

// ---------------------------------------------------------------------------
// 9. Existing users — grandfathered explicitly and honestly, not silently
// ---------------------------------------------------------------------------
describe("Existing users: grandfathered via an explicit, documented, one-time data migration — never an arbitrary/silent mark", () => {
  it("a dedicated migration for email verification exists, additive only (no DROP, no destructive ALTER)", () => {
    const migrationDirs = readdirSync(path.join(ROOT, "prisma/migrations")).filter((name) => name !== "migration_lock.toml");
    const schemaMigration = migrationDirs.find((name) => name.endsWith("add_email_verification"));
    expect(schemaMigration).toBeDefined();
    const sql = read(`prisma/migrations/${schemaMigration}/migration.sql`);
    expect(sql).toMatch(/CREATE TABLE "EmailVerificationToken"/);
    expect(sql).not.toMatch(/DROP TABLE/);
    expect(sql).not.toMatch(/DROP COLUMN/);
  });

  it("existing (pre-feature) accounts are backfilled to their OWN createdAt — never a fabricated 'verified right now' timestamp, and never touches accounts created after this migration", () => {
    const migrationDirs = readdirSync(path.join(ROOT, "prisma/migrations")).filter((name) => name !== "migration_lock.toml");
    const schemaMigration = migrationDirs.find((name) => name.endsWith("add_email_verification"))!;
    const sql = read(`prisma/migrations/${schemaMigration}/migration.sql`);
    expect(sql).toMatch(/UPDATE "User" SET "emailVerified" = "createdAt" WHERE "emailVerified" IS NULL;/);
  });

  it("a second, additive migration adds usedAt (nullable) for the distinct 'already used' UX state — never edits the first migration's already-applied file", () => {
    const migrationDirs = readdirSync(path.join(ROOT, "prisma/migrations")).filter((name) => name !== "migration_lock.toml");
    const usedAtMigration = migrationDirs.find((name) => name.endsWith("add_email_verification_token_used_at"));
    expect(usedAtMigration).toBeDefined();
    const sql = read(`prisma/migrations/${usedAtMigration}/migration.sql`);
    expect(sql).toMatch(/ALTER TABLE "EmailVerificationToken" ADD COLUMN "usedAt" TIMESTAMP\(3\);/);
  });

  it("every prior migration is still present — nothing was removed or renamed", () => {
    const migrationDirs = readdirSync(path.join(ROOT, "prisma/migrations")).filter((name) => name !== "migration_lock.toml");
    for (const prior of ["20260724220000_add_workflow_composability", "20260723193054_initial_schema"]) {
      expect(migrationDirs).toContain(prior);
    }
  });
});

// ---------------------------------------------------------------------------
// 10. Schema — additive, coherent
// ---------------------------------------------------------------------------
describe("Schema: EmailVerificationToken is additive and correctly constrained", () => {
  const schema = read("prisma/schema.prisma");

  it("tokenHash is unique (direct O(1) lookup, and prevents ever storing two rows for the same raw token)", () => {
    const model = schema.match(/model EmailVerificationToken \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/tokenHash\s+String\s+@unique/);
  });

  it("has a real FK to User with cascade delete — no orphaned tokens if a user is ever removed", () => {
    const model = schema.match(/model EmailVerificationToken \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/user User @relation\(fields: \[userId\], references: \[id\], onDelete: Cascade\)/);
  });

  it("expiresAt, createdAt, and usedAt are all present with correct nullability", () => {
    const model = schema.match(/model EmailVerificationToken \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/expiresAt\s+DateTime\s*$/m);
    expect(model).toMatch(/createdAt\s+DateTime\s+@default\(now\(\)\)/);
    expect(model).toMatch(/usedAt\s+DateTime\?/);
  });

  it("User.emailVerified (the existing, reused field) is untouched — still DateTime?, no destructive schema change", () => {
    const model = schema.match(/model User \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/emailVerified DateTime\?/);
  });

  it("the pre-existing, unrelated VerificationToken model (Auth.js's own unused adapter scaffolding) is untouched", () => {
    const model = schema.match(/model VerificationToken \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/identifier String/);
    expect(model).toMatch(/token\s+String\s+@unique/);
  });
});

// ---------------------------------------------------------------------------
// 11. Regressions — cookies, session strategy, adapter, other systems untouched
// ---------------------------------------------------------------------------
describe("Regressions: session strategy, cookie names, Prisma Adapter, and unrelated systems are all untouched", () => {
  it("session strategy is still 'jwt' — never switched to 'database'", () => {
    const edgeConfig = read("src/lib/auth/edge-config.ts");
    expect(edgeConfig).toMatch(/session: \{ strategy: "jwt" \}/);
  });

  it("no cookie name/option was ever set or changed — NextAuth's own defaults are untouched in both config files", () => {
    const combined = read("src/lib/auth/config.ts") + read("src/lib/auth/edge-config.ts");
    expect(combined).not.toMatch(/cookies:\s*\{/);
  });

  it("the PrismaAdapter and Credentials provider are both still wired exactly as before", () => {
    const config = read("src/lib/auth/config.ts");
    expect(config).toMatch(/adapter: PrismaAdapter\(prisma\)/);
    expect(config).toMatch(/Credentials\(\{/);
  });

  it("no AUTH_SECRET/NEXTAUTH_SECRET handling was touched by this change — the prior phase's fix stands untouched", () => {
    const envExample = read(".env.example");
    expect(envExample).toMatch(/AUTH_SECRET="replace-with-a-secure-random-secret"/);
  });

  it("requireProjectAccess still calls requireUser as its first step — the new verification gate applies to it automatically, without any change to requireProjectAccess's own code", () => {
    const permissions = read("src/lib/permissions/index.ts");
    const fn = permissions.match(/export async function requireProjectAccess\([\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/const user = await requireUser\(\);/);
  });

  it("logoutAction is reused as-is by the pending screen — no second sign-out implementation was created", () => {
    const pending = read("src/components/auth/verify-email-pending.tsx");
    expect(pending).toMatch(/import \{ logoutAction \} from "@\/server\/actions\/logout"/);
    const logout = read("src/server/actions/logout.ts");
    expect(logout).toMatch(/await signOut\(\{ redirectTo: "\/login" \}\);/);
  });

  it("Resend is the only email provider SDK installed — no redundant/competing provider, and no unrelated AI engine SDK was added by this change", () => {
    const packageJson = read("package.json");
    expect(packageJson).toMatch(/"resend":/);
    expect(packageJson).not.toMatch(/nodemailer|sendgrid|postmark|aws-sdk|mailgun/i);
  });

  it("admin panel, Chat IA, AI Workflows, and every other previously-audited module are never referenced from the new auth files — this stays scoped to authentication only", () => {
    const combined =
      read("src/lib/auth/verification-token.ts") +
      read("src/server/services/email-verification.ts") +
      read("src/server/actions/email-verification.ts");
    expect(combined).not.toMatch(/workflow|ai-center|prompt-library|ai-templates|brand-profile/i);
  });
});
