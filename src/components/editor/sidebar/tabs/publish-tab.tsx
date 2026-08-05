"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, X } from "lucide-react";
import { socialPlatformValues } from "@/lib/validation/social";
import type { SocialPlatform } from "@/generated/prisma/enums";
import { PUBLISH_CHECKLIST_ITEMS, parsePublishPlan, computeChecklistProgress } from "@/lib/editor/publish-checklist";
import { updateContentChecklistAction } from "@/server/actions/content";
import { scheduleContentForPublicationAction, listContentSchedulesAction, rescheduleSocialPostAction } from "@/server/actions/social";
import { listCampaignsForSelectAction } from "@/server/actions/campaign";
import { useEditorAutosave, type AutosaveStatus } from "@/components/editor/use-editor-autosave";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const AUTOSAVE_LABEL: Record<AutosaveStatus, string> = {
  idle: "",
  pending: "Cambios pendientes",
  saving: "Guardando",
  saved: "Guardado",
  error: "Error al guardar",
};

interface ScheduleRow {
  id: string;
  platform: SocialPlatform;
  scheduledAt: string | null;
  timezone: string;
  status: string;
  campaignId: string | null;
  tags: string[];
}

export function PublishTab({
  projectId,
  contentId,
  title,
  bodyText,
  publishChecklistRaw,
}: {
  projectId: string;
  contentId: string;
  title: string;
  bodyText: string;
  publishChecklistRaw: unknown;
}) {
  const initialPlan = parsePublishPlan(publishChecklistRaw);
  const [checklist, setChecklist] = useState<Record<string, boolean>>(initialPlan.checklist);
  const [assigneeName, setAssigneeName] = useState(initialPlan.assigneeName ?? "");
  const progress = computeChecklistProgress(checklist);

  // Refs (not the state above) back the debounced save: the timer that
  // eventually fires captures whichever `save` closure existed at the
  // moment it was scheduled, which would otherwise read a one-click-stale
  // `checklist`/`assigneeName` from React state — refs are always current
  // regardless of which render's closure ends up running (same pattern as
  // ContentEditorPanel's titleRef/bodyRef).
  const checklistRef = useRef(checklist);
  const assigneeRef = useRef(assigneeName);

  const checklistAutosave = useEditorAutosave(async () => {
    const result = await updateContentChecklistAction(projectId, contentId, {
      checklist: checklistRef.current,
      assigneeName: assigneeRef.current || null,
    });
    if (result.error) throw new Error(result.error);
  });

  function toggleItem(id: string) {
    const next = { ...checklist, [id]: !checklist[id] };
    setChecklist(next);
    checklistRef.current = next;
    checklistAutosave.notifyChange(`checklist:${JSON.stringify(next)}`);
  }

  function handleAssigneeChange(value: string) {
    setAssigneeName(value);
    assigneeRef.current = value;
    checklistAutosave.notifyChange(`assignee:${value}`);
  }

  const [platform, setPlatform] = useState<SocialPlatform>("INSTAGRAM");
  const [scheduledAtLocal, setScheduledAtLocal] = useState("");
  const [timezone, setTimezone] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return "UTC";
    }
  });
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [tagsInput, setTagsInput] = useState("");
  const [campaigns, setCampaigns] = useState<{ id: string; name: string; status: string }[]>([]);
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [scheduling, setScheduling] = useState(false);

  useEffect(() => {
    listCampaignsForSelectAction(projectId).then(setCampaigns);
    listContentSchedulesAction(projectId, contentId).then((rows) =>
      setSchedules(
        rows.map((row) => ({
          ...row,
          scheduledAt: row.scheduledAt ? row.scheduledAt.toISOString() : null,
        }))
      )
    );
  }, [projectId, contentId]);

  async function handleSchedule() {
    if (!scheduledAtLocal) {
      toast.error("Selecciona fecha y hora de publicación.");
      return;
    }
    setScheduling(true);
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const result = await scheduleContentForPublicationAction(projectId, {
      contentId,
      platform,
      text: bodyText.slice(0, 2000) || title,
      scheduledAt: scheduledAtLocal,
      timezone,
      campaignId,
      tags,
    });
    setScheduling(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Publicación programada y añadida al calendario.");
    listContentSchedulesAction(projectId, contentId).then((rows) =>
      setSchedules(rows.map((row) => ({ ...row, scheduledAt: row.scheduledAt ? row.scheduledAt.toISOString() : null })))
    );
  }

  async function handleCancel(postId: string) {
    await rescheduleSocialPostAction(projectId, postId, "");
    setSchedules((prev) => prev.filter((s) => s.id !== postId));
    toast.success("Programación cancelada.");
  }

  return (
    <div className="space-y-4">
      {schedules.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Programaciones activas</p>
          <ul className="space-y-1">
            {schedules
              .filter((s) => s.scheduledAt)
              .map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 rounded-md border p-1.5 text-xs">
                  <span className="flex items-center gap-1.5">
                    <CalendarClock className="size-3.5 text-muted-foreground" />
                    {s.platform} · {new Date(s.scheduledAt!).toLocaleString("es-ES")} ({s.timezone})
                  </span>
                  <Button type="button" variant="ghost" size="icon-xs" title="Cancelar programación" onClick={() => handleCancel(s.id)}>
                    <X className="size-3.5" />
                  </Button>
                </li>
              ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="publish-platform" className="text-xs">
          Plataforma
        </Label>
        <Select value={platform} onValueChange={(v) => v && setPlatform(v as SocialPlatform)}>
          <SelectTrigger id="publish-platform" size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {socialPlatformValues.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="publish-datetime" className="text-xs">
            Fecha y hora
          </Label>
          <Input
            id="publish-datetime"
            type="datetime-local"
            value={scheduledAtLocal}
            onChange={(e) => setScheduledAtLocal(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="publish-timezone" className="text-xs">
            Zona horaria
          </Label>
          <Input id="publish-timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="publish-campaign" className="text-xs">
          Campaña
        </Label>
        <Select value={campaignId ?? "__none__"} onValueChange={(v) => setCampaignId(v === "__none__" ? null : v)}>
          <SelectTrigger id="publish-campaign" size="sm" className="w-full">
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
        <Label htmlFor="publish-tags" className="text-xs">
          Etiquetas (separadas por coma)
        </Label>
        <Input id="publish-tags" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="lanzamiento, promo..." />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="publish-assignee" className="text-xs">
          Responsable
        </Label>
        <Input id="publish-assignee" value={assigneeName} onChange={(e) => handleAssigneeChange(e.target.value)} placeholder="Nombre..." />
      </div>

      <Button type="button" size="sm" className="w-full" disabled={scheduling} onClick={handleSchedule}>
        {scheduling ? "Programando..." : "Programar publicación"}
      </Button>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-muted-foreground">Checklist de publicación</span>
          <span className="font-medium">{progress}%</span>
        </div>
        <Progress value={progress} />
        <ul className="space-y-1.5">
          {PUBLISH_CHECKLIST_ITEMS.map((item) => (
            <li key={item.id} className="flex items-center gap-2 text-xs">
              <Checkbox checked={checklist[item.id] === true} onCheckedChange={() => toggleItem(item.id)} id={`checklist-${item.id}`} />
              <label htmlFor={`checklist-${item.id}`} className="cursor-pointer">
                {item.label}
              </label>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">{AUTOSAVE_LABEL[checklistAutosave.status]}</p>
      </div>
    </div>
  );
}
