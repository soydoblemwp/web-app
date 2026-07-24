import type { Metadata } from "next";
import { GuestModeBanner } from "@/components/guest/guest-mode-banner";
import { GuestAutomationsManager } from "@/components/guest/guest-automations-manager";

export const metadata: Metadata = { title: "Automatizaciones (invitado)" };

export default function GuestAutomationsPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Automatizaciones</h1>
        <p className="text-sm text-muted-foreground">
          Automatizaciones locales y deterministas — sin IA, sin cron, sin funciones de servidor. Se ejecutan
          únicamente cuando abres la aplicación.
        </p>
      </div>
      <GuestModeBanner />
      <GuestAutomationsManager />
    </div>
  );
}
