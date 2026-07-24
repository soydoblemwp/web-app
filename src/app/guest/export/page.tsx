import type { Metadata } from "next";
import { GuestModeBanner } from "@/components/guest/guest-mode-banner";
import { GuestDataManager } from "@/components/guest/guest-data-manager";

export const metadata: Metadata = { title: "Exportar o eliminar datos (invitado)" };

export default function GuestExportPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Exportar o eliminar datos</h1>
        <p className="text-sm text-muted-foreground">
          Tus datos están guardados únicamente en este dispositivo. Descárgalos en cualquier momento o elimínalos
          por completo.
        </p>
      </div>
      <GuestModeBanner />
      <GuestDataManager />
    </div>
  );
}
