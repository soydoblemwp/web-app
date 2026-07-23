import type { Metadata } from "next";
import { GuestModeBanner } from "@/components/guest/guest-mode-banner";
import { GuestAdapterForm } from "@/components/guest/guest-adapter-form";
import { isAIEnabled } from "@/lib/ai/service";

export const metadata: Metadata = { title: "Adaptador de contenido (invitado)" };

export default function GuestAdapterPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Adaptador de contenido</h1>
        <p className="text-sm text-muted-foreground">
          Pega una pieza de contenido existente y adáptala al formato y estilo de otra plataforma.
        </p>
      </div>
      <GuestModeBanner />
      {!isAIEnabled() ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          El asistente de IA no está configurado (falta ANTHROPIC_API_KEY).
        </p>
      ) : null}
      <GuestAdapterForm />
    </div>
  );
}
