import type { Metadata } from "next";
import { GuestModeBanner } from "@/components/guest/guest-mode-banner";
import { GuestMonitoringManager } from "@/components/guest/guest-monitoring-manager";

export const metadata: Metadata = { title: "Monitoreo (invitado)" };

export default function GuestMonitoringPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Monitoreo</h1>
        <p className="text-sm text-muted-foreground">
          Comprueba si el contenido de una URL ha cambiado, directamente desde tu navegador.
        </p>
      </div>
      <GuestModeBanner />
      <GuestMonitoringManager />
    </div>
  );
}
