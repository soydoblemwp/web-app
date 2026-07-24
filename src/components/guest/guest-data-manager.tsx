"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download, Trash2 } from "lucide-react";
import { deleteAllGuestData, downloadGuestDataExport } from "@/lib/guest-storage/export";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function GuestDataManager() {
  const [isExporting, setIsExporting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleExport() {
    setIsExporting(true);
    try {
      await downloadGuestDataExport();
      toast.success("Datos exportados.");
    } finally {
      setIsExporting(false);
    }
  }

  async function handleDeleteAll() {
    setIsDeleting(true);
    await deleteAllGuestData();
    setIsDeleting(false);
    setConfirmOpen(false);
    toast.success("Todos los datos locales se han eliminado.");
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Exportar datos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Descarga un archivo JSON con todos tus proyectos, biblioteca, campañas, calendario, automatizaciones,
            monitores y configuración de marca guardados en este navegador.
          </p>
          <Button type="button" onClick={handleExport} disabled={isExporting}>
            <Download className="mr-1 size-4" /> {isExporting ? "Exportando..." : "Exportar como JSON"}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-base text-destructive">Eliminar todos los datos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Borra permanentemente todo lo guardado en este navegador: proyectos, biblioteca, campañas, calendario,
            automatizaciones, monitores y kits de marca. Esta acción no se puede deshacer.
          </p>
          <Button type="button" variant="destructive" onClick={() => setConfirmOpen(true)}>
            <Trash2 className="mr-1 size-4" /> Eliminar todos los datos locales
          </Button>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar todos los datos locales?</DialogTitle>
            <DialogDescription>
              Esto borra permanentemente todos tus proyectos, biblioteca, campañas, calendario, automatizaciones,
              monitores y kits de marca guardados en este navegador. No se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={handleDeleteAll} disabled={isDeleting}>
              {isDeleting ? "Eliminando..." : "Sí, eliminar todo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
