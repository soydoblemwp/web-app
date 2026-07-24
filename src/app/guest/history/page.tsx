import type { Metadata } from "next";
import { GuestModeBanner } from "@/components/guest/guest-mode-banner";
import { GuestHistoryView } from "@/components/guest/guest-history-view";

export const metadata: Metadata = { title: "Historial (invitado)" };

export default function GuestHistoryPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Historial</h1>
        <p className="text-sm text-muted-foreground">
          Todo lo generado y guardado en cualquiera de tus proyectos locales, del más reciente al más antiguo.
        </p>
      </div>
      <GuestModeBanner />
      <GuestHistoryView />
    </div>
  );
}
