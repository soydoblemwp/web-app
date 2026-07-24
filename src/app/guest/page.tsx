import Link from "next/link";
import type { Metadata } from "next";
import { guestNavGroups } from "@/lib/navigation";
import { GuestModeBanner } from "@/components/guest/guest-mode-banner";
import { GuestRestrictedGrid } from "@/components/guest/guest-restricted-grid";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Modo invitado" };

function NavCardGrid({ items }: { items: (typeof guestNavGroups)[number]["items"] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <Link key={item.label} href={item.href!}>
          <Card className="h-full transition-colors hover:border-primary/50">
            <CardHeader className="flex-row items-center gap-3 space-y-0">
              <item.icon className="size-5 text-primary" />
              <CardTitle className="text-base">{item.label}</CardTitle>
            </CardHeader>
          </Card>
        </Link>
      ))}
    </div>
  );
}

export default function GuestHomePage() {
  const [tools, local] = guestNavGroups;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Panel de invitado</h1>
        <p className="text-sm text-muted-foreground">
          Usa todas las herramientas y la organización de tu trabajo sin crear una cuenta. Tus datos están
          guardados únicamente en este dispositivo.
        </p>
      </div>

      <GuestModeBanner />

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {tools.label}
        </h2>
        <NavCardGrid items={tools.items} />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {local.label}
        </h2>
        <NavCardGrid items={local.items} />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Cuenta e integraciones
        </h2>
        <GuestRestrictedGrid />
      </div>
    </div>
  );
}
