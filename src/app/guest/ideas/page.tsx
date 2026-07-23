import type { Metadata } from "next";
import { GuestModeBanner } from "@/components/guest/guest-mode-banner";
import { GuestIdeasForm } from "@/components/guest/guest-ideas-form";
import { isAIEnabled } from "@/lib/ai/service";

export const metadata: Metadata = { title: "Ideas para redes sociales (invitado)" };

export default function GuestIdeasPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ideas para redes sociales</h1>
        <p className="text-sm text-muted-foreground">
          Genera una lista de ideas de publicaciones para una plataforma y un tema concretos.
        </p>
      </div>
      <GuestModeBanner />
      {!isAIEnabled() ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          El asistente de IA no está configurado (falta ANTHROPIC_API_KEY).
        </p>
      ) : null}
      <GuestIdeasForm />
    </div>
  );
}
