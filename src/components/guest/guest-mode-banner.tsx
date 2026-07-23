import { Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/** Shown on every guest tool page — keeps the "not synced, not permanent" disclosure visible and honest. */
export function GuestModeBanner() {
  return (
    <Card className="border-dashed bg-muted/40">
      <CardContent className="flex items-start gap-3 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>
          Estás en modo invitado. Lo que generes aquí se guarda solo en este navegador (localStorage) mientras uses
          esta app — no se sincroniza con ninguna cuenta ni se guarda de forma permanente en el servidor.{" "}
          <a href="/register" className="underline underline-offset-4 hover:text-foreground">
            Crea una cuenta
          </a>{" "}
          para conservarlo.
        </p>
      </CardContent>
    </Card>
  );
}
