import type { Metadata } from "next";
import { GuestModeBanner } from "@/components/guest/guest-mode-banner";
import { GuestContentForm } from "@/components/guest/guest-content-form";
import { isAIEnabled } from "@/lib/ai/service";

export const metadata: Metadata = { title: "Generador de contenido (invitado)" };

export default function GuestContentPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Generador de contenido</h1>
        <p className="text-sm text-muted-foreground">
          Genera un primer borrador con IA. Puedes copiarlo o crear una cuenta para guardarlo en un proyecto.
        </p>
      </div>
      <GuestModeBanner />
      {!isAIEnabled() ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          El asistente de IA no está configurado (falta ANTHROPIC_API_KEY). Puedes rellenar el formulario, pero la
          generación fallará hasta que se configure una clave de API.
        </p>
      ) : null}
      <GuestContentForm />
    </div>
  );
}
