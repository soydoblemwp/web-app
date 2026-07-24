"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, X } from "lucide-react";
import { buildGuestDataExport } from "@/lib/guest-storage/export";
import { importGuestDataAction } from "@/server/actions/import-guest-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const DISMISSED_KEY = "ai-content-hub:guest-import-dismissed";

/**
 * Offers to import guest-mode IndexedDB data (see src/lib/guest-storage/)
 * into the now-registered account. Never runs automatically — only on
 * explicit click — and never deletes the local IndexedDB data itself; the
 * guest keeps it and can still export/delete it from Modo invitado.
 */
export function ImportLocalDataBanner() {
  const [hasLocalData, setHasLocalData] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    (async () => {
      if (typeof window === "undefined" || typeof indexedDB === "undefined") return;
      if (window.localStorage.getItem(DISMISSED_KEY) === "true") return;
      try {
        const data = await buildGuestDataExport();
        const hasAnything =
          data.projects.length > 0 || data.library.length > 0 || data.campaigns.length > 0 || data.brandKits.length > 0;
        setHasLocalData(hasAnything);
        setDismissed(!hasAnything);
      } catch {
        // No IndexedDB data yet (or unavailable) — nothing to offer.
        setDismissed(true);
      }
    })();
  }, []);

  function dismiss() {
    setDismissed(true);
    window.localStorage.setItem(DISMISSED_KEY, "true");
  }

  async function handleImport() {
    setIsImporting(true);
    try {
      const data = await buildGuestDataExport();
      const result = await importGuestDataAction(data);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(
          `Importado: ${result.projectsImported} proyecto(s), ${result.contentItemsImported} elemento(s) de biblioteca, ${result.campaignsImported} campaña(s).` +
            (result.projectsSkipped > 0 ? ` ${result.projectsSkipped} proyecto(s) no se importaron por el límite de tu plan.` : "")
        );
        dismiss();
      }
    } finally {
      setIsImporting(false);
    }
  }

  if (dismissed || !hasLocalData) return null;

  return (
    <Card className="border-dashed bg-muted/40">
      <CardContent className="flex flex-wrap items-center gap-3 py-3">
        <Download className="size-4 shrink-0 text-primary" />
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">
          Tienes datos guardados en este navegador desde el modo invitado (proyectos, biblioteca, campañas). Puedes
          importarlos a tu cuenta — tus datos locales no se eliminan al hacerlo.
        </p>
        <Button type="button" size="sm" onClick={handleImport} disabled={isImporting}>
          {isImporting ? "Importando..." : "Importar mis datos locales"}
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Descartar" onClick={dismiss}>
          <X className="size-3.5" />
        </Button>
      </CardContent>
    </Card>
  );
}
