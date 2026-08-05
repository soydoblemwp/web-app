"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, ChevronDown, LayoutTemplate, Copy } from "lucide-react";
import { createCampaignDraftAction, createCampaignFromTemplateAction, duplicateCampaignStudioCampaignAction } from "@/server/actions/campaign-studio";
import { listCampaignTemplatesForSelectAction } from "@/server/actions/campaign-team";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface CampaignOption {
  id: string;
  name: string;
}

export function NewCampaignMenu({ projectId, existingCampaigns }: { projectId: string; existingCampaigns: CampaignOption[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newStartDate, setNewStartDate] = useState("");

  async function handleBlank() {
    setCreating(true);
    const result = await createCampaignDraftAction(projectId);
    setCreating(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    router.push(`/dashboard/${projectId}/campaign-studio/${result.id}`);
  }

  async function openTemplateDialog() {
    setTemplateDialogOpen(true);
    const list = await listCampaignTemplatesForSelectAction(projectId);
    setTemplates(list);
  }

  async function handleFromTemplate() {
    if (!selectedTemplateId || !newName.trim()) {
      toast.error("Elige una plantilla y un nombre.");
      return;
    }
    setCreating(true);
    const result = await createCampaignFromTemplateAction(projectId, {
      templateId: selectedTemplateId,
      name: newName.trim(),
      startDate: newStartDate || undefined,
    });
    setCreating(false);
    if (result?.error) toast.error(result.error);
  }

  async function handleDuplicate() {
    if (!selectedCampaignId || !newName.trim()) {
      toast.error("Elige una campaña y un nombre.");
      return;
    }
    setCreating(true);
    const result = await duplicateCampaignStudioCampaignAction(projectId, {
      campaignId: selectedCampaignId,
      name: newName.trim(),
      startDate: newStartDate || undefined,
    });
    setCreating(false);
    if (result?.error) toast.error(result.error);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button disabled={creating} />}>
          <Plus className="size-4" /> Nueva campaña <ChevronDown className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleBlank}>
            <Plus className="size-4" /> Campaña en blanco
          </DropdownMenuItem>
          <DropdownMenuItem onClick={openTemplateDialog}>
            <LayoutTemplate className="size-4" /> Desde plantilla
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              setDuplicateDialogOpen(true);
              setNewName("");
            }}
          >
            <Copy className="size-4" /> Duplicar campaña existente
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nueva campaña desde plantilla</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {templates.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no hay plantillas guardadas en este proyecto.</p>
            ) : (
              <div className="space-y-1.5">
                <Label>Plantilla</Label>
                <Select value={selectedTemplateId ?? undefined} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecciona una plantilla" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="template-campaign-name">Nombre de la nueva campaña</Label>
              <Input id="template-campaign-name" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={200} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="template-campaign-start">Fecha de inicio</Label>
              <Input id="template-campaign-start" type="date" value={newStartDate} onChange={(e) => setNewStartDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTemplateDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={creating || templates.length === 0} onClick={handleFromTemplate}>
              Crear campaña
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Duplicar campaña</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {existingCampaigns.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay campañas para duplicar todavía.</p>
            ) : (
              <div className="space-y-1.5">
                <Label>Campaña de origen</Label>
                <Select value={selectedCampaignId ?? undefined} onValueChange={setSelectedCampaignId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecciona una campaña" />
                  </SelectTrigger>
                  <SelectContent>
                    {existingCampaigns.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="dup-campaign-name">Nombre de la nueva campaña</Label>
              <Input id="dup-campaign-name" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={200} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dup-campaign-start">Nueva fecha de inicio (recalcula el resto de fechas)</Label>
              <Input id="dup-campaign-start" type="date" value={newStartDate} onChange={(e) => setNewStartDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDuplicateDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={creating || existingCampaigns.length === 0} onClick={handleDuplicate}>
              Duplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
