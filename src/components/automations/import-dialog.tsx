"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { importAutomationAction } from "@/server/actions/automation-import-export";

interface ImportDialogProps {
  projectId: string;
  workflows: { id: string; name: string }[];
}

/** Imports a previously exported automation JSON — always lands DRAFT, never auto-executes (spec section 38). */
export function ImportAutomationDialog({ projectId, workflows }: ImportDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [workflowId, setWorkflowId] = useState(workflows[0]?.id ?? "");
  const fileRef = useRef<HTMLInputElement>(null);

  function handleImport() {
    const file = fileRef.current?.files?.[0];
    if (!file || !workflowId) {
      toast.error("Selecciona un archivo y un workflow de destino.");
      return;
    }
    startTransition(async () => {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        toast.error("El archivo no es un JSON válido.");
        return;
      }
      const result = await importAutomationAction(projectId, workflowId, parsed);
      if (result.errorMessage) {
        toast.error(result.errorMessage);
        return;
      }
      toast.success("Automatización importada como borrador.");
      setOpen(false);
      router.push(`/dashboard/${projectId}/automations/${result.id}`);
    });
  }

  if (workflows.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Upload className="size-4" /> Importar
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar automatización</DialogTitle>
          <DialogDescription>Se creará como borrador — nunca se ejecuta automáticamente al importarse.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Archivo (.json)</Label>
            <input ref={fileRef} type="file" accept="application/json" className="block w-full text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Workflow de destino</Label>
            <Select value={workflowId} onValueChange={(v) => v && setWorkflowId(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {workflows.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button disabled={pending} onClick={handleImport}>
            Importar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
