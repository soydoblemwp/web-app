"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Sparkles, Trash2, Copy, ExternalLink, CheckCircle2, Circle } from "lucide-react";
import { useLocalAI } from "@/hooks/use-local-ai";
import {
  updateCampaignPieceAction,
  deleteCampaignPieceAction,
  duplicateCampaignPieceAction,
  createContentFromPieceAction,
  createCampaignPieceCommentAction,
  resolveCampaignPieceCommentAction,
  listCampaignPieceCommentsAction,
} from "@/server/actions/campaign-pieces";
import { CAMPAIGN_PIECE_STATUS_VALUES, CAMPAIGN_PIECE_STATUS_LABELS, CAMPAIGN_PIECE_PRIORITY_VALUES, CAMPAIGN_PIECE_PRIORITY_LABELS } from "@/lib/campaign-studio/piece-status";
import { CAMPAIGN_CHANNELS } from "@/lib/campaign-studio/channels";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import type { CampaignDetailData, CampaignPieceData, CampaignPillarData, ProjectMemberData } from "@/components/campaign-studio/types";

export function PieceDetailSheet({
  projectId,
  campaign,
  piece,
  pillars,
  members,
  open,
  onOpenChange,
  onSaved,
}: {
  projectId: string;
  campaign: CampaignDetailData;
  piece: CampaignPieceData | null;
  pillars: CampaignPillarData[];
  members: ProjectMemberData[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (piece: CampaignPieceData) => void;
}) {
  const router = useRouter();
  const ai = useLocalAI();
  const [draft, setDraft] = useState<CampaignPieceData | null>(piece);
  const [saving, setSaving] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [comments, setComments] = useState<
    { id: string; body: string; resolved: boolean; createdAt: Date; author: { name: string | null; email: string } }[]
  >([]);
  const [generateDraftOnCreate, setGenerateDraftOnCreate] = useState(true);
  const [creatingContent, setCreatingContent] = useState(false);
  const busy = ai.status === "loading" || ai.status === "generating";

  if (piece && draft?.id !== piece.id) setDraft(piece);
  const current = draft ?? piece;

  useEffect(() => {
    if (!open || !current) return;
    let cancelled = false;
    listCampaignPieceCommentsAction(projectId, campaign.id, current.id).then((list) => {
      if (!cancelled) setComments(list);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, current?.id]);

  if (!current) return null;

  const save = async (patch: Partial<CampaignPieceData>) => {
    if (!current) return;
    const next = { ...current, ...patch };
    setDraft(next);
    setSaving(true);
    const result = await updateCampaignPieceAction(projectId, campaign.id, {
      id: current.id,
      title: next.title,
      idea: next.idea ?? "",
      platform: next.platform,
      format: next.format ?? "",
      pillarId: next.pillarId,
      objective: next.objective ?? "",
      cta: next.cta ?? "",
      scheduledDate: next.scheduledDate ? next.scheduledDate.slice(0, 10) : "",
      scheduledTime: next.scheduledTime ?? "",
      status: next.status as never,
      priority: next.priority as never,
      assigneeId: next.assigneeId,
      keywords: next.keywords,
      notes: next.notes ?? "",
    });
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    onSaved(next);
  };

  const handleDelete = async () => {
    const result = await deleteCampaignPieceAction(projectId, campaign.id, current.id);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    onOpenChange(false);
    router.refresh();
  };

  const handleDuplicate = async () => {
    const result = await duplicateCampaignPieceAction(projectId, campaign.id, current.id);
    if (result.error) toast.error(result.error);
    else {
      toast.success("Pieza duplicada.");
      router.refresh();
    }
  };

  const handleCreateContent = async () => {
    setCreatingContent(true);
    let draftBody = "";
    if (generateDraftOnCreate) {
      const system = "Eres un redactor. Escribe un primer borrador breve para la pieza de contenido descrita, en el idioma del briefing.";
      const prompt = [
        `Título: ${current.title}`,
        current.idea ? `Idea: ${current.idea}` : "",
        current.objective ? `Objetivo: ${current.objective}` : "",
        current.cta ? `CTA: ${current.cta}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      draftBody = (await ai.generate({ system, prompt })) ?? "";
    }
    const result = await createContentFromPieceAction(projectId, campaign.id, current.id, { draftBody });
    setCreatingContent(false);
    if (result.error && !result.contentItemId) {
      toast.error(result.error);
      return;
    }
    router.push(`/dashboard/${projectId}/content/${result.contentItemId}`);
  };

  const handleAddComment = async () => {
    if (!commentBody.trim()) return;
    const result = await createCampaignPieceCommentAction(projectId, campaign.id, { pieceId: current.id, body: commentBody, mentionedUserIds: [] });
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setCommentBody("");
    const list = await listCampaignPieceCommentsAction(projectId, campaign.id, current.id);
    setComments(list);
  };

  const handleResolveComment = async (commentId: string, resolved: boolean) => {
    setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, resolved } : c)));
    await resolveCampaignPieceCommentAction(projectId, campaign.id, commentId, resolved);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto p-4 sm:max-w-lg">
        <SheetHeader className="px-0">
          <SheetTitle>Editar pieza</SheetTitle>
        </SheetHeader>

        <div className="space-y-3">
          {current.contentItemId ? (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              render={<a href={`/dashboard/${projectId}/content/${current.contentItemId}`} />}
            >
              <ExternalLink className="size-4" /> Abrir en AI Editor Pro
            </Button>
          ) : (
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <Checkbox checked={generateDraftOnCreate} onCheckedChange={() => setGenerateDraftOnCreate((v) => !v)} id="gen-draft" />
                <Label htmlFor="gen-draft" className="text-xs">
                  Generar primer borrador con IA
                </Label>
              </div>
              <Button type="button" className="w-full" disabled={creatingContent || busy} onClick={handleCreateContent}>
                {creatingContent ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Crear contenido
              </Button>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input value={current.title} onChange={(e) => setDraft({ ...current, title: e.target.value })} onBlur={() => save({})} />
          </div>
          <div className="space-y-1.5">
            <Label>Idea</Label>
            <Textarea value={current.idea ?? ""} onChange={(e) => setDraft({ ...current, idea: e.target.value })} onBlur={() => save({})} rows={2} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Plataforma</Label>
              <Select value={current.platform} onValueChange={(v) => v && save({ platform: v })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAMPAIGN_CHANNELS.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Formato</Label>
              <Input value={current.format ?? ""} onChange={(e) => setDraft({ ...current, format: e.target.value })} onBlur={() => save({})} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Pilar</Label>
            <Select value={current.pillarId ?? "__none__"} onValueChange={(v) => save({ pillarId: v === "__none__" ? null : v, pillar: pillars.find((p) => p.id === v) ?? null })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sin pilar</SelectItem>
                {pillars.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={current.status} onValueChange={(v) => v && save({ status: v })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAMPAIGN_PIECE_STATUS_VALUES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {CAMPAIGN_PIECE_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Prioridad</Label>
              <Select value={current.priority} onValueChange={(v) => v && save({ priority: v })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAMPAIGN_PIECE_PRIORITY_VALUES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {CAMPAIGN_PIECE_PRIORITY_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Fecha</Label>
              <Input type="date" value={current.scheduledDate?.slice(0, 10) ?? ""} onChange={(e) => save({ scheduledDate: e.target.value || null })} />
            </div>
            <div className="space-y-1.5">
              <Label>Hora</Label>
              <Input type="time" value={current.scheduledTime ?? ""} onChange={(e) => save({ scheduledTime: e.target.value })} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Responsable</Label>
            <Select value={current.assigneeId ?? "__none__"} onValueChange={(v) => save({ assigneeId: v === "__none__" ? null : v, assignee: members.find((m) => m.id === v) ?? null })}>
              <SelectTrigger className="w-full">
                <SelectValue />
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
          </div>

          <div className="space-y-1.5">
            <Label>CTA</Label>
            <Input value={current.cta ?? ""} onChange={(e) => setDraft({ ...current, cta: e.target.value })} onBlur={() => save({})} />
          </div>
          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea value={current.notes ?? ""} onChange={(e) => setDraft({ ...current, notes: e.target.value })} onBlur={() => save({})} rows={2} />
          </div>

          <div className="flex items-center gap-2 border-t pt-3">
            <Button type="button" variant="outline" size="sm" onClick={handleDuplicate}>
              <Copy className="size-3.5" /> Duplicar
            </Button>
            <Button type="button" variant="outline" size="sm" className="text-destructive" onClick={handleDelete}>
              <Trash2 className="size-3.5" /> Eliminar
            </Button>
            {saving ? <span className="text-xs text-muted-foreground">Guardando...</span> : null}
          </div>

          <div className="space-y-2 border-t pt-3">
            <Label className="text-xs text-muted-foreground">Comentarios internos</Label>
            <div className="max-h-48 space-y-2 overflow-y-auto">
              {comments.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin comentarios todavía.</p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className={`flex items-start gap-2 rounded-md border p-2 text-xs ${c.resolved ? "opacity-60" : ""}`}>
                    <button type="button" onClick={() => handleResolveComment(c.id, !c.resolved)} title={c.resolved ? "Reabrir" : "Resolver"}>
                      {c.resolved ? <CheckCircle2 className="size-3.5 text-emerald-600" /> : <Circle className="size-3.5 text-muted-foreground" />}
                    </button>
                    <div className="flex-1">
                      <p className="font-medium">{c.author.name || c.author.email}</p>
                      <p className="text-muted-foreground">{c.body}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="flex gap-1.5">
              <Input value={commentBody} onChange={(e) => setCommentBody(e.target.value)} placeholder="Añadir comentario..." />
              <Button type="button" variant="outline" onClick={handleAddComment}>
                Enviar
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
