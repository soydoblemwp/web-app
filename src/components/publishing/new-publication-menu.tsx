"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, ChevronDown, FileText, Layers, Megaphone, LayoutTemplate, Copy } from "lucide-react";
import { createPublicationAction } from "@/server/actions/publishing";
import {
  listContentItemsForSelectAction,
  listCampaignPiecesForSelectAction,
  listPublicationTemplatesForSelectAction,
  listPublicationsForSelectAction,
} from "@/server/actions/publishing-select";
import { listCampaignsForSelectAction } from "@/server/actions/campaign";
import { COMPOSER_PLATFORM_VALUES, platformLabel } from "@/lib/publishing/platform-specs";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Origin = "blank" | "content" | "piece" | "campaign" | "template" | "duplicate";

export function NewPublicationMenu({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [platform, setPlatform] = useState("INSTAGRAM");
  const [title, setTitle] = useState("");
  const [options, setOptions] = useState<{ id: string; label: string }[]>([]);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function openDialog(next: Origin) {
    setOrigin(next);
    setTitle("");
    setSelectedOptionId(null);
    if (next === "content") {
      const items = await listContentItemsForSelectAction(projectId);
      setOptions(items.map((i) => ({ id: i.id, label: i.title })));
    } else if (next === "piece") {
      const items = await listCampaignPiecesForSelectAction(projectId);
      setOptions(items.map((i) => ({ id: i.id, label: `${i.title} (${i.campaign.name})` })));
    } else if (next === "campaign") {
      const items = await listCampaignsForSelectAction(projectId);
      setOptions(items.map((i) => ({ id: i.id, label: i.name })));
    } else if (next === "template") {
      const items = await listPublicationTemplatesForSelectAction(projectId);
      setOptions(items.map((i) => ({ id: i.id, label: i.name })));
    } else if (next === "duplicate") {
      const items = await listPublicationsForSelectAction(projectId);
      setOptions(items.map((i) => ({ id: i.id, label: i.internalTitle || platformLabel(i.platform) })));
    }
  }

  async function handleCreate() {
    if (!title.trim() && origin !== "template" && origin !== "duplicate") {
      toast.error("Escribe un título interno.");
      return;
    }
    setCreating(true);
    const result = await createPublicationAction(projectId, {
      platform,
      internalTitle: title.trim() || "Nueva publicación",
      text: "",
      sourceContentId: origin === "content" ? selectedOptionId ?? undefined : undefined,
      sourcePieceId: origin === "piece" ? selectedOptionId ?? undefined : undefined,
      campaignId: origin === "campaign" ? selectedOptionId ?? undefined : undefined,
      templateId: origin === "template" ? selectedOptionId ?? undefined : undefined,
      duplicateFromId: origin === "duplicate" ? selectedOptionId ?? undefined : undefined,
    });
    setCreating(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    router.push(`/dashboard/${projectId}/publishing/${result.id}`);
  }

  const needsOption = origin === "content" || origin === "piece" || origin === "campaign" || origin === "template" || origin === "duplicate";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button />}>
          <Plus className="size-4" /> Nueva publicación <ChevronDown className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => openDialog("blank")}>
            <Plus className="size-4" /> Contenido en blanco
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openDialog("content")}>
            <FileText className="size-4" /> Desde un ContentItem
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openDialog("piece")}>
            <Layers className="size-4" /> Desde una pieza de Campaign Studio
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openDialog("campaign")}>
            <Megaphone className="size-4" /> Desde una campaña
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openDialog("template")}>
            <LayoutTemplate className="size-4" /> Desde una plantilla
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openDialog("duplicate")}>
            <Copy className="size-4" /> Duplicar publicación existente
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={origin !== null} onOpenChange={(open) => !open && setOrigin(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nueva publicación</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Plataforma</Label>
              <Select value={platform} onValueChange={(v) => v && setPlatform(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPOSER_PLATFORM_VALUES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {platformLabel(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {origin !== "template" ? (
              <div className="space-y-1.5">
                <Label htmlFor="new-pub-title">Título interno</Label>
                <Input id="new-pub-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} />
              </div>
            ) : null}
            {needsOption ? (
              <div className="space-y-1.5">
                <Label>Origen</Label>
                {options.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No hay opciones disponibles.</p>
                ) : (
                  <Select value={selectedOptionId ?? undefined} onValueChange={setSelectedOptionId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecciona..." />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((opt) => (
                        <SelectItem key={opt.id} value={opt.id}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOrigin(null)}>
              Cancelar
            </Button>
            <Button type="button" disabled={creating || (needsOption && options.length === 0)} onClick={handleCreate}>
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
