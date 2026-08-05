import "server-only";
import { Resend } from "resend";

/**
 * The single integration seam for outbound transactional email — used for
 * verification today, and reusable as-is for password recovery and other
 * future notifications (callers only ever build an EmailMessage; nothing
 * here is specific to any one email's content).
 *
 * Requires RESEND_API_KEY and EMAIL_FROM. If either is missing this throws
 * immediately — it never simulates a successful send, in development or
 * production alike (see .env.example for how to configure both).
 */
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [500, 1500];

// Resend's own error taxonomy (see RESEND_ERROR_CODE_KEY in the SDK's
// types) — only these, plus a 429/5xx status code, are worth retrying.
// Everything else (bad API key, unverified domain, invalid payload, quota
// exceeded, ...) will fail again identically on retry, so it's surfaced
// immediately instead of wasting attempts.
const TRANSIENT_RESEND_ERROR_NAMES = new Set(["rate_limit_exceeded", "internal_server_error", "application_error"]);

function isTransientResendError(name: string, statusCode: number | null): boolean {
  if (TRANSIENT_RESEND_ERROR_NAMES.has(name)) return true;
  return statusCode !== null && (statusCode === 429 || statusCode >= 500);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      `Falta configurar RESEND_API_KEY (intento de envío a "${message.to}": "${message.subject}"). ` +
        "Añade RESEND_API_KEY a tus variables de entorno — consulta .env.example. El envío nunca se simula como exitoso."
    );
  }

  const from = process.env.EMAIL_FROM;
  if (!from) {
    throw new Error(
      `Falta configurar EMAIL_FROM (intento de envío a "${message.to}": "${message.subject}"). ` +
        "Añade EMAIL_FROM a tus variables de entorno — consulta .env.example."
    );
  }

  const resend = new Resend(apiKey);
  // Never logs `message.html`/`message.text` (they carry the real
  // verification link/token) or the API key — only recipient, subject, and
  // the provider's own error description, purely to help a developer debug
  // a failed send from the server console. This function's caller (see
  // src/server/services/email-verification.ts) only ever gets back
  // `{ sent: false }`, never this error's message.
  let lastFailureReason = "error desconocido";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const isLastAttempt = attempt === MAX_ATTEMPTS;
    let transient = true;

    try {
      const result = await resend.emails.send({
        from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });

      if (!result.error) return;

      lastFailureReason = `${result.error.name} (status ${result.error.statusCode ?? "desconocido"}): ${result.error.message}`;
      transient = isTransientResendError(result.error.name, result.error.statusCode);
    } catch (err) {
      // A thrown/rejected send (network failure, DNS, timeout) never carries
      // a Resend error name/status — treated as transient since it's never
      // the provider rejecting the message itself.
      lastFailureReason = err instanceof Error ? err.message : "fallo de red desconocido";
    }

    console.error(`[sendEmail] intento ${attempt}/${MAX_ATTEMPTS} fallido para "${message.to}": ${lastFailureReason}`);

    if (!transient || isLastAttempt) {
      throw new Error(
        `No se pudo enviar el correo a "${message.to}" ("${message.subject}") tras ${attempt} intento(s): ${lastFailureReason}`
      );
    }

    await sleep(RETRY_DELAYS_MS[attempt - 1] ?? 1500);
  }
}
