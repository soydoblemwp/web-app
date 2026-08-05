"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Send, Check, RotateCcw, CalendarClock, X, LayoutTemplate } from "lucide-react";
import { RichEditor } from "@/components/editor/rich-editor";
import { useEditorAutosave, type AutosaveStatus } from "@/components/editor/use-editor-autosave";
import { updatePublicationAction, schedulePublicationAction, cancelSchedulingAction, recordApprovalDecisionAction } from "@/server/actions/publishing";
import { savePublicationAsTemplateAction } from "@/server/actions/publishing-templates";
import { detachMediaFromPublicationAction } from "@/server/actions/publishing-media";
import { computeComposerWarnings } from "@/lib/publishing/composer-warnings";
import { COMPOSER_PLATFORM_VALUES, platformLabel } from "@/lib/publishing/platform-specs";
import { STATUS_LABELS, canApprove } from "@/lib/publishing/status";
import { PublicationPreview } from "@/components/publishing/publication-preview";
import { ChecklistPanel } from "@/components/publishing/composer/checklist-panel";
import { MediaPicker } from "@/components/publishing/composer/media-picker";
import { ApprovalHistory } from "@/components/publishing/composer/approval-history";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import type { PublicationData, ProjectMemberData } from "@/components/publishing/types";

const AUTOSAVE_LABEL: Record<AutosaveStatus, string> = {
  idle: "",
  pending: "Cambios pendientes",
  saving: "Guardando...",
  saved: "Guardado",
  error: "Error al guardar — reintentar",
};

const PRIORITY_LABELS: Record<string, string> = { LOW: "Baja", MEDIUM: "Media", HIGH: "Alta", URGENT: "Urgente" };

export function PublicationComposer({
  projectId,
  publication,
  members,
  campaigns,
  brandProfiles,
  currentUserId,
  requireApprovalBeforePublish,
  allowSelfApproval,
}: {
  projectId: string;
  publication: PublicationData;
  members: ProjectMemberData[];
  campaigns: { id: string; name: string }[];
  brandProfiles: { id: string; name: string }[];
  currentUserId: string;
  requireApprovalBeforePublish: boolean;
  allowSelfApproval: boolean;
}) {
  const router = useRouter();
  const [post, setPost] = useState(publication);
  const [hashtagDraft, setHashtagDraft] = useState("");
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(post.scheduledAt?.slice(0, 10) ?? "");
  const [scheduleTime, setScheduleTime] = useState(post.scheduledAt?.slice(11, 16) ?? "");
  const [scheduleTz, setScheduleTz] = useState(post.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState(`${post.internalTitle ?? "Plantilla"}`);
  const [decisionComment, setDecisionComment] = useState("");
  const [saving, setSaving] = useState(false);

  const postRef = useRef(post);
  const updatedAtRef = useRef(post.updatedAt);

  const buildPatch = (p: PublicationData) => ({
    internalTitle: p.internalTitle ?? "",
    platform: p.platform,
    format: p.format ?? "",
    text: p.text,
    firstComment: p.firstComment ?? "",
    hashtags: p.hashtags,
    cta: p.cta ?? "",
    link: p.link ?? "",
    altText: p.altText ?? "",
    assigneeId: p.assigneeId,
    approverId: p.approverId,
    priority: p.priority,
    campaignId: p.campaignId,
    brandProfileId: p.brandProfileId,
    notes: p.notes ?? "",
  });

  const autosave = useEditorAutosave(async () => {
    const result = await updatePublicationAction(projectId, post.id, buildPatch(postRef.current), updatedAtRef.current);
    if (result.error) throw new Error(result.error);
    if (result.updatedAt) updatedAtRef.current = result.updatedAt;
  });

  function patch(next: Partial<PublicationData>) {
    setPost((prev) => {
      const merged = { ...prev, ...next };
      postRef.current = merged;
      return merged;
    });
    autosave.notifyChange(`patch:${JSON.stringify(next)}:${Date.now()}`);
  }

  const warnings = useMemo(
    () =>
      computeComposerWarnings({
        platform: post.platform as never,
        text: post.text,
        hashtags: post.hashtags,
        cta: post.cta ?? "",
        link: post.link ?? "",
        mediaCount: post.media.length,
        altTextCount: post.media.filter((m) => m.altTextOverride || m.fileAsset.altText).length,
      }),
    [post]
  );

  function addHashtag() {
    const value = hashtagDraft.trim().replace(/^#/, "");
    if (!value) return;
    patch({ hashtags: [...post.hashtags, value] });
    setHashtagDraft("");
  }

  async function handleSchedule() {
    if (!scheduleDate || !scheduleTime) {
      toast.error("Selecciona fecha y hora.");
      return;
    }
    const iso = new Date(`${scheduleDate}T${scheduleTime}`).toISOString();
    const result = await schedulePublicationAction(projectId, post.id, { scheduledAt: iso, timezone: scheduleTz });
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Publicación programada.");
    setScheduleDialogOpen(false);
    router.refresh();
  }

  async function handleCancelSchedule() {
    const result = await cancelSchedulingAction(projectId, post.id);
    if (result.error) toast.error(result.error);
    else {
      toast.success("Programación cancelada.");
      router.refresh();
    }
  }

  async function handleDecision(action: "SUBMITTED" | "APPROVED" | "CHANGES_REQUESTED") {
    const result = await recordApprovalDecisionAction(projectId, post.id, { action, comment: decisionComment });
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setDecisionComment("");
    toast.success("Registrado.");
    router.refresh();
  }

  async function handleSaveTemplate() {
    setSaving(true);
    const result = await savePublicationAsTemplateAction(projectId, { postId: post.id, name: templateName });
    setSaving(false);
    setTemplateDialogOpen(false);
    if (result.error) toast.error(result.error);
    else toast.success("Plantilla guardada.");
  }

  async function handleRemoveMedia(fileAssetId: string) {
    const previous = post.media;
    setPost((prev) => ({ ...prev, media: prev.media.filter((m) => m.fileAsset.id !== fileAssetId) }));
    const result = await detachMediaFromPublicationAction(projectId, post.id, fileAssetId);
    if (result.error) {
      setPost((prev) => ({ ...prev, media: previous }));
      toast.error(result.error);
    }
  }

  const selectedBrandProfile = brandProfiles.find((b) => b.id === post.brandProfileId);
  const canApproveThis = canApprove({ actorId: currentUserId, authorId: post.authorId, allowSelfApproval });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline">{STATUS_LABELS[post.status as keyof typeof STATUS_LABELS]}</Badge>
            <span className="text-xs text-muted-foreground">{AUTOSAVE_LABEL[autosave.status]}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={() => setTemplateDialogOpen(true)}>
              <LayoutTemplate className="size-3.5" /> Guardar como plantilla
            </Button>
            {post.status !== "DRAFT" && post.scheduledAt ? (
              <Button type="button" variant="outline" size="sm" onClick={handleCancelSchedule}>
                <X className="size-3.5" /> Cancelar programación
              </Button>
            ) : (
              <Button type="button" size="sm" onClick={() => setScheduleDialogOpen(true)}>
                <CalendarClock className="size-3.5" /> Programar
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="composer-title">Título interno</Label>
          <Input id="composer-title" value={post.internalTitle ?? ""} onChange={(e) => patch({ internalTitle: e.target.value })} maxLength={300} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label>Plataforma</Label>
            <Select value={post.platform} onValueChange={(v) => v && patch({ platform: v })}>
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
          <div className="space-y-1.5">
            <Label htmlFor="composer-format">Formato</Label>
            <Input id="composer-format" value={post.format ?? ""} onChange={(e) => patch({ format: e.target.value })} placeholder="post, reel, story..." />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Texto ({post.text.length} caracteres)</Label>
          <RichEditor content={post.text} onChangeHtml={(html) => patch({ text: html })} placeholder="Escribe el contenido de la publicación..." />
        </div>

        <div className="space-y-1.5">
          <Label>Hashtags</Label>
          <div className="flex gap-1.5">
            <Input
              value={hashtagDraft}
              onChange={(e) => setHashtagDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addHashtag())}
              placeholder="marketing"
            />
            <Button type="button" variant="outline" onClick={addHashtag}>
              Añadir
            </Button>
          </div>
          {post.hashtags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {post.hashtags.map((tag, i) => (
                <button
                  key={`${tag}-${i}`}
                  type="button"
                  onClick={() => patch({ hashtags: post.hashtags.filter((_, idx) => idx !== i) })}
                  className="rounded-full border bg-muted/50 px-2.5 py-0.5 text-xs hover:bg-destructive/10 hover:text-destructive"
                >
                  #{tag} ×
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="composer-cta">CTA</Label>
            <Input id="composer-cta" value={post.cta ?? ""} onChange={(e) => patch({ cta: e.target.value })} maxLength={300} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="composer-link">Enlace</Label>
            <Input id="composer-link" value={post.link ?? ""} onChange={(e) => patch({ link: e.target.value })} placeholder="https://..." />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="composer-first-comment">Primer comentario</Label>
          <Input id="composer-first-comment" value={post.firstComment ?? ""} onChange={(e) => patch({ firstComment: e.target.value })} maxLength={2000} />
        </div>

        <MediaPicker projectId={projectId} publicationId={post.id} attached={post.media} onRemove={handleRemoveMedia} onAttached={() => router.refresh()} />

        <div className="space-y-1.5">
          <Label htmlFor="composer-alt-text">Texto alternativo (general)</Label>
          <Input id="composer-alt-text" value={post.altText ?? ""} onChange={(e) => patch({ altText: e.target.value })} maxLength={1000} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="composer-notes">Notas internas</Label>
          <Input id="composer-notes" value={post.notes ?? ""} onChange={(e) => patch({ notes: e.target.value })} maxLength={4000} />
        </div>

        {warnings.length > 0 ? (
          <div className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
            {warnings.map((w) => (
              <p key={w.id} className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {w.message}
              </p>
            ))}
          </div>
        ) : null}

        <div className="space-y-2 rounded-lg border p-3">
          <Label className="text-xs text-muted-foreground">Flujo de aprobación</Label>
          <div className="flex flex-wrap gap-1.5">
            <Button type="button" size="sm" variant="outline" onClick={() => handleDecision("SUBMITTED")}>
              <Send className="size-3.5" /> Enviar a revisión
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={!canApproveThis} title={!canApproveThis ? "No puedes aprobar tu propia publicación" : undefined} onClick={() => handleDecision("APPROVED")}>
              <Check className="size-3.5" /> Aprobar
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => handleDecision("CHANGES_REQUESTED")}>
              <RotateCcw className="size-3.5" /> Solicitar cambios
            </Button>
          </div>
          <Input value={decisionComment} onChange={(e) => setDecisionComment(e.target.value)} placeholder="Comentario (opcional)" />
          {requireApprovalBeforePublish ? (
            <p className="text-xs text-muted-foreground">Este proyecto requiere aprobación antes de programar.</p>
          ) : null}
          <ApprovalHistory postId={post.id} />
        </div>

        <ChecklistPanel
          projectId={projectId}
          postId={post.id}
          platform={post.platform}
          state={post.checklistState}
          onStateChange={(state) => setPost((prev) => ({ ...prev, checklistState: state }))}
        />
      </div>

      <div className="space-y-4">
        <PublicationPreview publication={post} brandName={selectedBrandProfile?.name ?? "Tu marca"} />

        <div className="space-y-3 rounded-lg border p-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Responsable</Label>
            <Select value={post.assigneeId ?? "__none__"} onValueChange={(v) => patch({ assigneeId: v === "__none__" ? null : v })}>
              <SelectTrigger className="w-full" size="sm">
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
            <Label className="text-xs">Aprobador</Label>
            <Select value={post.approverId ?? "__none__"} onValueChange={(v) => patch({ approverId: v === "__none__" ? null : v })}>
              <SelectTrigger className="w-full" size="sm">
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
            <Label className="text-xs">Prioridad</Label>
            <Select value={post.priority} onValueChange={(v) => v && patch({ priority: v })}>
              <SelectTrigger className="w-full" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Campaña</Label>
            <Select value={post.campaignId ?? "__none__"} onValueChange={(v) => patch({ campaignId: v === "__none__" ? null : v })}>
              <SelectTrigger className="w-full" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sin campaña</SelectItem>
                {campaigns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Brand Profile</Label>
            <Select value={post.brandProfileId ?? "__none__"} onValueChange={(v) => patch({ brandProfileId: v === "__none__" ? null : v })}>
              <SelectTrigger className="w-full" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Ninguno</SelectItem>
                {brandProfiles.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Programar publicación</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Fecha</Label>
              <Input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Hora</Label>
              <Input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Zona horaria</Label>
            <Input value={scheduleTz} onChange={(e) => setScheduleTz(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setScheduleDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleSchedule}>
              Programar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Guardar como plantilla</DialogTitle>
          </DialogHeader>
          <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} maxLength={200} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTemplateDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={saving} onClick={handleSaveTemplate}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
