"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { resendVerificationEmailAction } from "@/server/actions/email-verification";
import { logoutAction } from "@/server/actions/logout";
import { Button } from "@/components/ui/button";

const RESEND_BUTTON_COOLDOWN_MS = 60 * 1000;

/**
 * "Revisa tu correo" — shown to a real, authenticated session whose account
 * hasn't completed verification yet (reached via proxy.ts's redirect, or
 * directly after registering). The resend button disables itself
 * optimistically for the same cooldown window the server enforces
 * (src/lib/auth/verification-token.ts's EMAIL_VERIFICATION_RESEND_COOLDOWN_MS)
 * the moment it's clicked — independent of whatever the server's response
 * message says, so "reenvío limitado temporalmente" is always shown the
 * same way regardless of *why* nothing new was sent.
 */
export function VerifyEmailPending({ email }: { email: string }) {
  const [isPending, startTransition] = useTransition();
  const [cooldownActive, setCooldownActive] = useState(false);

  function handleResend() {
    setCooldownActive(true);
    setTimeout(() => setCooldownActive(false), RESEND_BUTTON_COOLDOWN_MS);
    startTransition(async () => {
      const result = await resendVerificationEmailAction();
      toast.success(result.message);
    });
  }

  function handleLogout() {
    startTransition(async () => {
      await logoutAction();
    });
  }

  return (
    <div className="space-y-4 text-center">
      <p className="text-sm text-muted-foreground">
        Te hemos enviado un enlace de verificación a <strong>{email}</strong>. Ábrelo para activar tu cuenta — puede
        tardar unos minutos en llegar, y conviene revisar la carpeta de spam.
      </p>
      <div className="flex flex-col gap-2">
        <Button type="button" onClick={handleResend} disabled={isPending || cooldownActive}>
          {cooldownActive ? "Espera antes de reenviar..." : "Reenviar enlace de verificación"}
        </Button>
        <Button type="button" variant="outline" onClick={handleLogout} disabled={isPending}>
          Cerrar sesión
        </Button>
      </div>
    </div>
  );
}
