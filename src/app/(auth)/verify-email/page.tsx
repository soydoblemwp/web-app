import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { getCurrentUser } from "@/lib/permissions";
import { verifyEmailToken } from "@/server/services/email-verification";
import { VerifyEmailPending } from "@/components/auth/verify-email-pending";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Verifica tu correo" };

const RESULT_COPY = {
  verified: {
    icon: CheckCircle2,
    title: "Correo verificado",
    description: "Tu cuenta ya está activa. Ya puedes iniciar sesión con normalidad.",
  },
  expired: {
    icon: XCircle,
    title: "El enlace venció",
    description: "Este enlace de verificación ya no es válido. Inicia sesión para solicitar uno nuevo.",
  },
  already_used: {
    icon: XCircle,
    title: "Enlace ya utilizado",
    description: "Este enlace ya se usó anteriormente. Si tu cuenta no aparece verificada, inicia sesión para solicitar uno nuevo.",
  },
  invalid: {
    icon: XCircle,
    title: "Enlace no válido",
    description: "Este enlace de verificación no es válido. Inicia sesión para solicitar uno nuevo.",
  },
} as const;

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  // A token in the URL always takes priority: this is what the emailed link
  // itself points at, and it must work the same whether or not the browser
  // opening it happens to have an active session (a different device/
  // browser than the one used to register is the common case).
  if (token) {
    const result = await verifyEmailToken(token);
    const copy = RESULT_COPY[result.status];
    const Icon = copy.icon;
    return (
      <div className="space-y-4 text-center">
        <Icon className={result.status === "verified" ? "mx-auto size-10 text-emerald-600" : "mx-auto size-10 text-destructive"} />
        <h2 className="text-lg font-medium">{copy.title}</h2>
        <p className="text-sm text-muted-foreground">{copy.description}</p>
        <Button className="w-full" render={<Link href="/login">Ir a iniciar sesión</Link>} />
      </div>
    );
  }

  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.emailVerified) redirect("/dashboard");

  return (
    <div className="space-y-4">
      <h2 className="text-center text-lg font-medium">Revisa tu correo</h2>
      <VerifyEmailPending email={user.email} />
    </div>
  );
}
