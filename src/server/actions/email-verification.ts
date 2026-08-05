"use server";

import { getCurrentUser } from "@/lib/permissions";
import { getLatestVerificationTokenIssuedAt, sendVerificationEmailToUser } from "@/server/services/email-verification";
import { canResendVerificationEmail, secondsUntilResendAllowed } from "@/lib/auth/verification-token";

export interface ResendVerificationState {
  message: string;
}

/**
 * Deliberately session-scoped — always resends for the CURRENTLY logged-in
 * account, never accepts an email address as input. This is what makes
 * "no indica si una dirección específica existe o no" trivially true rather
 * than merely mitigated: there is nothing here for an unauthenticated
 * caller to enumerate in the first place. Uses getCurrentUser() (never
 * requireUser()) since the whole point is to keep working for a real,
 * authenticated-but-unverified account — requireUser() would reject that
 * exact case.
 */
export async function resendVerificationEmailAction(): Promise<ResendVerificationState> {
  const user = await getCurrentUser();
  if (!user) return { message: "Debes iniciar sesión para solicitar un nuevo enlace." };
  if (user.emailVerified) return { message: "Tu cuenta ya está verificada." };

  const lastIssuedAt = await getLatestVerificationTokenIssuedAt(user.id);
  if (!canResendVerificationEmail(lastIssuedAt)) {
    const seconds = secondsUntilResendAllowed(lastIssuedAt!);
    return { message: `Espera ${seconds} segundos antes de solicitar otro enlace.` };
  }

  const result = await sendVerificationEmailToUser(user.id, user.email);
  return {
    message: result.sent
      ? "Te hemos enviado un nuevo enlace de verificación."
      : "No pudimos enviar el correo en este momento. Inténtalo de nuevo más tarde.",
  };
}
