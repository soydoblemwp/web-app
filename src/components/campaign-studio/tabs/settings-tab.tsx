"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LayoutTemplate, Trash2 } from "lucide-react";
import { updateCampaignBriefingAction, saveCampaignAsTemplateAction, deleteCampaignDraftAction } from "@/server/actions/campaign-studio";
import { useEditorAutosave, type AutosaveStatus } from "@/components/editor/use-editor-autosave";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import type { CampaignDetailData } from "@/components/campaign-studio/types";

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Borrador" },
  { value: "PLANNED", label: "Planificada" },
  { value: "ACTIVE", label: "Activa" },
  { value: "PAUSED", label: "Pausada" },
  { value: "COMPLETED", label: "Completada" },
  { value: "ARCHIVED", label: "Archivada" },
];

const AUTOSAVE_LABEL: Record<AutosaveStatus, string> = {
  idle: "",
  pending: "Cambios pendientes",
  saving: "Guardando...",
  saved: "Guardado",
  error: "Error al guardar",
};

export function SettingsTab({ projectId, campaign }: { projectId: string; campaign: CampaignDetailData }) {
  const router = useRouter();
  const [name, setName] = useState(campaign.name);
  const [description, setDescription] = useState(campaign.description ?? "");
  const [status, setStatus] = useState(campaign.status);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState(`${campaign.name} (plantilla)`);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const stateRef = useRef({ name, description, status });

  const autosave = useEditorAutosave(async () => {
    const result = await updateCampaignBriefingAction(projectId, campaign.id, {
      name: stateRef.current.name,
      description: stateRef.current.description,
      status: stateRef.current.status as never,
    });
    if (result.error) throw new Error(result.error);
  });

  function patch(next: Partial<typeof stateRef.current>) {
    stateRef.current = { ...stateRef.current, ...next };
    if (next.name !== undefined) setName(next.name);
    if (next.description !== undefined) setDescription(next.description);
    if (next.status !== undefined) setStatus(next.status);
    autosave.notifyChange(JSON.stringify(stateRef.current));
  }

  async function handleSaveTemplate() {
    const result = await saveCampaignAsTemplateAction(projectId, { campaignId: campaign.id, name: templateName });
    setTemplateDialogOpen(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Plantilla guardada.");
  }

  async function handleDelete() {
    const result = await deleteCampaignDraftAction(projectId, campaign.id);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    router.push(`/dashboard/${projectId}/campaign-studio`);
  }

  return (
    <div className="max-w-lg space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="settings-name">Nombre</Label>
        <Input id="settings-name" value={name} onChange={(e) => patch({ name: e.target.value })} maxLength={200} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="settings-description">Descripción</Label>
        <Textarea id="settings-description" value={description} onChange={(e) => patch({ description: e.target.value })} rows={3} />
      </div>
      <div className="space-y-1.5">
        <Label>Estado</Label>
        <Select value={status} onValueChange={(v) => v && patch({ status: v })}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">{AUTOSAVE_LABEL[autosave.status]}</p>

      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={() => setTemplateDialogOpen(true)}>
          <LayoutTemplate className="size-4" /> Guardar como plantilla
        </Button>
        <Button type="button" variant="outline" className="text-destructive" onClick={() => setDeleteDialogOpen(true)}>
          <Trash2 className="size-4" /> Eliminar campaña
        </Button>
      </div>

      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Guardar como plantilla</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="template-name">Nombre de la plantilla</Label>
            <Input id="template-name" value={templateName} onChange={(e) => setTemplateName(e.target.value)} maxLength={200} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTemplateDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleSaveTemplate}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar campaña</DialogTitle>
            <DialogDescription>
              Esta acción elimina la campaña, sus pilares, piezas planificadas, estrategia y comentarios. El contenido ya creado en AI
              Editor Pro no se elimina.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete}>
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
