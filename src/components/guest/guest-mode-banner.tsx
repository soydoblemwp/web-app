import { Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/** Shown on every guest tool page — keeps the local-storage disclosure visible and honest. */
export function GuestModeBanner() {
  return (
    <Card className="border-dashed bg-muted/40">
      <CardContent className="flex items-start gap-3 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>
          <strong className="text-foreground">Tus datos están guardados únicamente en este dispositivo.</strong>{" "}
          Proyectos, biblioteca, campañas, calendario, automatizaciones y configuración de marca se guardan en el
          almacenamiento local de este navegador (IndexedDB) — nunca se envían a ningún servidor. Se conservan al
          cerrar y volver a abrir el navegador, pero solo en este dispositivo: borrar los datos del sitio o usar
          otro navegador/equipo no los conservará.{" "}
          <a href="/register" className="underline underline-offset-4 hover:text-foreground">
            Crea una cuenta
          </a>{" "}
          cuando quieras sincronizarlos entre dispositivos — nunca es obligatorio.
        </p>
      </CardContent>
    </Card>
  );
}
