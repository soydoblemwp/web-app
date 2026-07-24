"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { useGuestProject } from "@/hooks/use-guest-project";
import {
  createCalendarEntry,
  deleteCalendarEntry,
  listCalendarEntriesByProject,
  updateCalendarEntry,
} from "@/lib/guest-storage/calendar";
import { listCampaignsByProject } from "@/lib/guest-storage/campaigns";
import type { LocalCalendarEntry, LocalCalendarStatus, LocalCampaign } from "@/lib/guest-storage/types";
import { GuestProjectSelect } from "@/components/guest/guest-project-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS_LABELS: Record<LocalCalendarStatus, string> = {
  IDEA: "Idea",
  DRAFT: "Borrador",
  SCHEDULED: "Programada",
  PUBLISHED: "Publicada",
  ARCHIVED: "Archivada",
};

export function GuestCalendarManager() {
  const { projects, selectedId, selectProject, refresh: refreshProjects, isLoading: isLoadingProjects } =
    useGuestProject();
  const [entries, setEntries] = useState<LocalCalendarEntry[]>([]);
  const [campaigns, setCampaigns] = useState<LocalCampaign[]>([]);
  const [platform, setPlatform] = useState("Instagram");
  const [text, setText] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");

  async function refreshAll(projectId: string | null) {
    if (!projectId) {
      setEntries([]);
      setCampaigns([]);
      return;
    }
    const [entryList, campaignList] = await Promise.all([
      listCalendarEntriesByProject(projectId),
      listCampaignsByProject(projectId),
    ]);
    setEntries(entryList);
    setCampaigns(campaignList);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshAll(selectedId);
  }, [selectedId]);

  async function handleCreate() {
    if (!selectedId || !text.trim()) return;
    await createCalendarEntry({
      projectId: selectedId,
      platform,
      text,
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      status: scheduledAt ? "SCHEDULED" : "IDEA",
    });
    setText("");
    setScheduledAt("");
    await refreshAll(selectedId);
  }

  async function handleStatusChange(id: string, status: LocalCalendarStatus) {
    await updateCalendarEntry(id, { status });
    await refreshAll(selectedId);
  }

  async function handleDelete(id: string) {
    await deleteCalendarEntry(id);
    await refreshAll(selectedId);
  }

  const campaignNameById = new Map(campaigns.map((c) => [c.id, c.name]));

  if (isLoadingProjects) return <p className="text-sm text-muted-foreground">Cargando...</p>;

  return (
    <div className="space-y-4">
      <GuestProjectSelect
        projects={projects}
        selectedId={selectedId}
        onSelect={selectProject}
        onCreated={async (p) => {
          await refreshProjects();
          selectProject(p.id);
        }}
      />

      {selectedId ? (
        <>
          <Card>
            <CardContent className="space-y-3 pt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Plataforma</Label>
                  <Input value={platform} onChange={(e) => setPlatform(e.target.value)} maxLength={60} />
                </div>
                <div className="space-y-2">
                  <Label>Fecha y hora (opcional)</Label>
                  <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Texto de la publicación</Label>
                  <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={10_000} />
                </div>
              </div>
              <Button type="button" onClick={handleCreate} disabled={!text.trim()}>
                Añadir al calendario
              </Button>
              <p className="text-xs text-muted-foreground">
                Esto solo guarda la publicación localmente — nunca se envía ni se publica automáticamente en ninguna
                red social.
              </p>
            </CardContent>
          </Card>

          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay publicaciones programadas todavía.</p>
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => (
                <Card key={entry.id}>
                  <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{entry.platform}</Badge>
                      {entry.scheduledAt ? (
                        <span className="text-xs text-muted-foreground">
                          {new Date(entry.scheduledAt).toLocaleString()}
                        </span>
                      ) : null}
                      {entry.campaignId ? <Badge variant="secondary">{campaignNameById.get(entry.campaignId)}</Badge> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <Select value={entry.status} onValueChange={(v) => v && handleStatusChange(entry.id, v as LocalCalendarStatus)}>
                        <SelectTrigger className="w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(STATUS_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label="Eliminar" onClick={() => handleDelete(entry.id)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">{entry.text}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Crea un proyecto para empezar a programar publicaciones.</p>
      )}
    </div>
  );
}
