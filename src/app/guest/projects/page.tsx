import type { Metadata } from "next";
import { GuestModeBanner } from "@/components/guest/guest-mode-banner";
import { GuestProjectsManager } from "@/components/guest/guest-projects-manager";

export const metadata: Metadata = { title: "Proyectos (invitado)" };

export default function GuestProjectsPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Proyectos</h1>
        <p className="text-sm text-muted-foreground">
          Crea, edita, renombra y elimina proyectos locales para organizar tu contenido, campañas y calendario.
        </p>
      </div>
      <GuestModeBanner />
      <GuestProjectsManager />
    </div>
  );
}
