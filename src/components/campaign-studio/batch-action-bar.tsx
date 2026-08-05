"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles, Trash2, Copy, X } from "lucide-react";
import { useLocalAI } from "@/hooks/use-local-ai";
import {
  batchUpdateCampaignPiecesAction,
  batchDeleteCampaignPiecesAction,
  batchDuplicateCampaignPiecesAction,
  createContentFromPieceAction,
} from "@/server/actions/campaign-pieces";
import { CAMPAIGN_PIECE_STATUS_VALUES, CAMPAIGN_PIECE_STATUS_LABELS, CAMPAIGN_PIECE_PRIORITY_VALUES, CAMPAIGN_PIECE_PRIORITY_LABELS } from "@/lib/campaign-studio/piece-status";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import type { CampaignPieceData, ProjectMemberData } from "@/components/campaign-studio/types";

interface BatchProgress {
  total: number;
  done: number;
  errors: { title: string; message: string }[];
}

export function BatchActionBar({
  projectId,
  campaignId,
  pieces,
  selectedIds,
  members,
  onClearSelection,
}: {
  projectId: string;
  campaignId: string;
  pieces: CampaignPieceData[];
  selectedIds: string[];
  members: ProjectMemberData[];
  onClearSelection: () => void;
}) {
  const router = useRouter();
  const ai = useLocalAI();
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const cancelledRef = useRef(false);

  if (selectedIds.length === 0) return null;

  async function runBatch<T>(action: () => Promise<{ error?: string } & T>, successMessage: string) {
    const result = await action();
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(successMessage);
    onClearSelection();
    router.refresh();
  }

  async function generateDrafts() {
    cancelledRef.current = false;
    const targets = pieces.filter((p) => selectedIds.includes(p.id) && !p.contentItemId);
    if (targets.length === 0) {
      toast.error("Las piezas seleccionadas ya tienen contenido creado.");
      return;
    }
    setProgress({ total: targets.length, done: 0, errors: [] });

    for (const piece of targets) {
      if (cancelledRef.current) break;
      try {
        const system = "Eres un redactor. Escribe un primer borrador breve para la pieza de contenido descrita.";
        const prompt = [`Título: ${piece.title}`, piece.idea ? `Idea: ${piece.idea}` : "", piece.objective ? `Objetivo: ${piece.objective}` : ""]
          .filter(Boolean)
          .join("\n");
        const draftBody = (await ai.generate({ system, prompt })) ?? "";
        const result = await createContentFromPieceAction(projectId, campaignId, piece.id, { draftBody });
        if (result.error && !result.contentItemId) throw new Error(result.error);
      } catch (err) {
        setProgress((prev) => (prev ? { ...prev, errors: [...prev.errors, { title: piece.title, message: err instanceof Error ? err.message : "Error desconocido" }] } : prev));
      }
      setProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
    }

    setProgress((prev) => {
      if (prev) {
        const failed = prev.errors.length;
        const okCount = prev.done - failed;
        toast[failed > 0 ? "warning" : "success"](
          `Generación completada: ${okCount} correctas, ${failed} con error${cancelledRef.current ? " (cancelado)" : ""}.`
        );
      }
      return null;
    });
    onClearSelection();
    router.refresh();
  }

  const generating = progress !== null;

  return (
    <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-popover p-2 shadow-md">
      <span className="px-1 text-xs font-medium">{selectedIds.length} seleccionadas</span>

      {generating ? (
        <div className="flex flex-1 items-center gap-2">
          <Progress value={Math.round((progress!.done / progress!.total) * 100)} className="flex-1" />
          <span className="text-xs text-muted-foreground">
            {progress!.done}/{progress!.total}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={() => (cancelledRef.current = true)}>
            Cancelar
          </Button>
        </div>
      ) : (
        <>
          <Button type="button" size="sm" variant="outline" onClick={generateDrafts}>
            <Sparkles className="size-3.5" /> Generar borradores
          </Button>

          <Select onValueChange={(v) => v && runBatch(() => batchUpdateCampaignPiecesAction(projectId, campaignId, selectedIds, { status: v as never }), "Estado actualizado.")}>
            <SelectTrigger size="sm" className="w-40">
              <SelectValue placeholder="Cambiar estado" />
            </SelectTrigger>
            <SelectContent>
              {CAMPAIGN_PIECE_STATUS_VALUES.map((s) => (
                <SelectItem key={s} value={s}>
                  {CAMPAIGN_PIECE_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select onValueChange={(v) => v && runBatch(() => batchUpdateCampaignPiecesAction(projectId, campaignId, selectedIds, { priority: v as never }), "Prioridad actualizada.")}>
            <SelectTrigger size="sm" className="w-36">
              <SelectValue placeholder="Prioridad" />
            </SelectTrigger>
            <SelectContent>
              {CAMPAIGN_PIECE_PRIORITY_VALUES.map((p) => (
                <SelectItem key={p} value={p}>
                  {CAMPAIGN_PIECE_PRIORITY_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            onValueChange={(v) => {
              if (typeof v !== "string") return;
              const assigneeId: string | null = v === "__none__" ? null : v;
              runBatch(() => batchUpdateCampaignPiecesAction(projectId, campaignId, selectedIds, { assigneeId }), "Responsable asignado.");
            }}
          >
            <SelectTrigger size="sm" className="w-40">
              <SelectValue placeholder="Asignar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Sin asignar</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name || m.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => runBatch(() => batchDuplicateCampaignPiecesAction(projectId, campaignId, selectedIds), "Piezas duplicadas.")}
          >
            <Copy className="size-3.5" /> Duplicar
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="text-destructive"
            onClick={() => runBatch(() => batchDeleteCampaignPiecesAction(projectId, campaignId, selectedIds), "Piezas eliminadas.")}
          >
            <Trash2 className="size-3.5" /> Eliminar
          </Button>
          <Button type="button" size="icon-sm" variant="ghost" onClick={onClearSelection} aria-label="Cerrar selección">
            <X className="size-4" />
          </Button>
        </>
      )}
    </div>
  );
}
