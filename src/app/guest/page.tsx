import Link from "next/link";
import type { Metadata } from "next";
import { guestNavGroups } from "@/lib/navigation";
import { GuestModeBanner } from "@/components/guest/guest-mode-banner";
import { GuestRestrictedGrid } from "@/components/guest/guest-restricted-grid";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Modo invitado" };

export default function GuestHomePage() {
  const available = guestNavGroups[0].items;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Panel de invitado</h1>
        <p className="text-sm text-muted-foreground">
          Prueba las herramientas básicas sin crear una cuenta. Cuando quieras guardar tu trabajo de forma
          permanente, crea una cuenta gratuita.
        </p>
      </div>

      <GuestModeBanner />

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Disponibles ahora
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {available.map((item) => (
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
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Requieren una cuenta
        </h2>
        <GuestRestrictedGrid />
      </div>
    </div>
  );
}
