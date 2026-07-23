import type { Metadata } from "next";
import { GuestModeBanner } from "@/components/guest/guest-mode-banner";
import { GuestReplyForm } from "@/components/guest/guest-reply-form";

export const metadata: Metadata = { title: "Generador de respuestas (invitado)" };

export default function GuestRepliesPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Generador de respuestas</h1>
        <p className="text-sm text-muted-foreground">
          Pega un comentario o mensaje y genera un borrador de respuesta. Nunca se envía automáticamente.
        </p>
      </div>
      <GuestModeBanner />
      <GuestReplyForm />
    </div>
  );
}
