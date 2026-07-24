import type { Metadata } from "next";
import { GuestModeBanner } from "@/components/guest/guest-mode-banner";
import { GuestCampaignsManager } from "@/components/guest/guest-campaigns-manager";

export const metadata: Metadata = { title: "Campañas (invitado)" };

export default function GuestCampaignsPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Campañas</h1>
        <p className="text-sm text-muted-foreground">Planifica campañas locales por proyecto, sin necesidad de cuenta.</p>
      </div>
      <GuestModeBanner />
      <GuestCampaignsManager />
    </div>
  );
}
