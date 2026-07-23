import type { Metadata } from "next";
import { GuestModeBanner } from "@/components/guest/guest-mode-banner";
import { GuestSeoForm } from "@/components/guest/guest-seo-form";

export const metadata: Metadata = { title: "Herramientas SEO (invitado)" };

export default function GuestSeoPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Herramientas SEO</h1>
        <p className="text-sm text-muted-foreground">
          Análisis basado en reglas deterministas y documentadas, calculado directamente en tu navegador. No
          garantizamos posiciones en buscadores ni inventamos datos de volumen de búsqueda o dificultad.
        </p>
      </div>
      <GuestModeBanner />
      <GuestSeoForm />
    </div>
  );
}
