import type { Metadata } from "next";
import { GuestModeBanner } from "@/components/guest/guest-mode-banner";
import { GuestPostAnalyzerForm } from "@/components/guest/guest-post-analyzer-form";

export const metadata: Metadata = { title: "Analizador de publicaciones (invitado)" };

export default function GuestAnalyzerPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analizador de publicaciones</h1>
        <p className="text-sm text-muted-foreground">
          Comprobaciones deterministas (longitud, gancho, hashtags, CTA, repetición) calculadas en tu navegador
          antes de publicar.
        </p>
      </div>
      <GuestModeBanner />
      <GuestPostAnalyzerForm />
    </div>
  );
}
