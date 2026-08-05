import { appConfig } from "@/lib/config";
import type { EmailMessage } from "@/lib/email/send-email";
import { renderEmailTemplate } from "@/lib/email/template";

/**
 * Builds the verification email's content — pure and testable, deliberately
 * separate from send-email.ts's transport so the two can be tested/changed
 * independently. The link's base URL always comes from appConfig.url
 * (itself sourced from the existing APP_URL env var, see src/lib/config.ts)
 * — never a hardcoded host, so this produces a correct link in development,
 * previews, and production alike.
 */
export function buildVerificationUrl(rawToken: string): string {
  const url = new URL("/verify-email", appConfig.url);
  url.searchParams.set("token", rawToken);
  return url.toString();
}

export function buildVerificationEmail(to: string, rawToken: string): EmailMessage {
  const verifyUrl = buildVerificationUrl(rawToken);
  const { html, text } = renderEmailTemplate({
    greeting: "Hola,",
    paragraphs: [
      `Gracias por registrarte en ${appConfig.name}. Confirma tu dirección de correo para activar tu cuenta.`,
      "Si no creaste esta cuenta, puedes ignorar este mensaje.",
    ],
    ctaLabel: "Verificar mi correo",
    ctaUrl: verifyUrl,
    expirationNote: "Este enlace es válido durante 24 horas y solo puede usarse una vez.",
  });

  return {
    to,
    subject: `Verifica tu correo en ${appConfig.name}`,
    html,
    text,
  };
}
