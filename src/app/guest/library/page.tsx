import type { Metadata } from "next";
import { GuestModeBanner } from "@/components/guest/guest-mode-banner";
import { GuestLibraryManager } from "@/components/guest/guest-library-manager";

export const metadata: Metadata = { title: "Biblioteca (invitado)" };

export default function GuestLibraryPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Biblioteca</h1>
        <p className="text-sm text-muted-foreground">
          Todo lo que guardes desde las herramientas de IA aparece aquí. Edita, duplica, marca como favorito,
          elimina o restaura contenido organizado por proyecto.
        </p>
      </div>
      <GuestModeBanner />
      <GuestLibraryManager />
    </div>
  );
}
