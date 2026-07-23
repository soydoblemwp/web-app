import { Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/** Shown on every guest tool page — keeps the "not synced, not permanent" disclosure visible and honest. */
export function GuestModeBanner() {
  return (
    <Card className="border-dashed bg-muted/40">
      <CardContent className="flex items-start gap-3 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>
          Estás en modo invitado. Lo que generes aquí se conserva solo durante esta sesión del navegador (esta
          pestaña, mientras no la cierres) — no se sincroniza con ninguna cuenta ni se guarda de forma permanente en
          ningún servidor. Al cerrar la pestaña o el navegador se perderá.{" "}
          <a href="/register" className="underline underline-offset-4 hover:text-foreground">
            Crea una cuenta
          </a>{" "}
          para conservarlo de forma permanente.
        </p>
      </CardContent>
    </Card>
  );
}
