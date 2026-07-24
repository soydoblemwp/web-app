import type { Metadata } from "next";
import { GuestModeBanner } from "@/components/guest/guest-mode-banner";
import { GuestBrandKitForm } from "@/components/guest/guest-brand-kit-form";

export const metadata: Metadata = { title: "Configuración de marca (invitado)" };

export default function GuestBrandKitPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configuración de marca</h1>
        <p className="text-sm text-muted-foreground">
          Define el tono, la personalidad y las palabras preferidas/prohibidas de tu marca. Las herramientas de IA
          local usan esta configuración al generar contenido para el proyecto seleccionado.
        </p>
      </div>
      <GuestModeBanner />
      <GuestBrandKitForm />
    </div>
  );
}
