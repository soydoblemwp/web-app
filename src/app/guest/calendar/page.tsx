import type { Metadata } from "next";
import { GuestModeBanner } from "@/components/guest/guest-mode-banner";
import { GuestCalendarManager } from "@/components/guest/guest-calendar-manager";

export const metadata: Metadata = { title: "Calendario (invitado)" };

export default function GuestCalendarPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Calendario</h1>
        <p className="text-sm text-muted-foreground">
          Programa publicaciones localmente. La plataforma nunca publica automáticamente en redes sociales.
        </p>
      </div>
      <GuestModeBanner />
      <GuestCalendarManager />
    </div>
  );
}
