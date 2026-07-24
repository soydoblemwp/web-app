"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { useGuestProject } from "@/hooks/use-guest-project";
import { createCampaign, deleteCampaign, listCampaignsByProject, updateCampaign } from "@/lib/guest-storage/campaigns";
import type { LocalCampaign, LocalCampaignStatus } from "@/lib/guest-storage/types";
import { GuestProjectSelect } from "@/components/guest/guest-project-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS_LABELS: Record<LocalCampaignStatus, string> = {
  DRAFT: "Borrador",
  PLANNED: "Planificada",
  ACTIVE: "Activa",
  PAUSED: "Pausada",
  COMPLETED: "Completada",
  ARCHIVED: "Archivada",
};

const emptyForm = { name: "", description: "", objective: "", audience: "", primaryCTA: "" };

export function GuestCampaignsManager() {
  const { projects, selectedId, selectProject, refresh: refreshProjects, isLoading: isLoadingProjects } =
    useGuestProject();
  const [campaigns, setCampaigns] = useState<LocalCampaign[]>([]);
  const [form, setForm] = useState(emptyForm);

  async function refreshCampaigns(projectId: string | null) {
    setCampaigns(projectId ? await listCampaignsByProject(projectId) : []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshCampaigns(selectedId);
  }, [selectedId]);

  async function handleCreate() {
    if (!selectedId || !form.name.trim()) return;
    await createCampaign({ projectId: selectedId, ...form });
    setForm(emptyForm);
    await refreshCampaigns(selectedId);
  }

  async function handleStatusChange(id: string, status: LocalCampaignStatus) {
    await updateCampaign(id, { status });
    await refreshCampaigns(selectedId);
  }

  async function handleDelete(id: string) {
    await deleteCampaign(id);
    await refreshCampaigns(selectedId);
  }

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
            <CardHeader>
              <CardTitle className="text-base">Nueva campaña</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Nombre</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={200} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Descripción</Label>
                  <Textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={2}
                    maxLength={2000}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Objetivo</Label>
                  <Input value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })} maxLength={500} />
                </div>
                <div className="space-y-2">
                  <Label>Audiencia</Label>
                  <Input value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} maxLength={300} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Llamado a la acción principal</Label>
                  <Input value={form.primaryCTA} onChange={(e) => setForm({ ...form, primaryCTA: e.target.value })} maxLength={300} />
                </div>
              </div>
              <Button type="button" onClick={handleCreate} disabled={!form.name.trim()}>
                Crear campaña
              </Button>
            </CardContent>
          </Card>

          {campaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay campañas en este proyecto.</p>
          ) : (
            <div className="space-y-3">
              {campaigns.map((campaign) => (
                <Card key={campaign.id}>
                  <CardHeader className="flex-row items-start justify-between space-y-0">
                    <div>
                      <CardTitle className="text-base">{campaign.name}</CardTitle>
                      {campaign.description ? (
                        <p className="mt-1 text-sm text-muted-foreground">{campaign.description}</p>
                      ) : null}
                    </div>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Eliminar" onClick={() => handleDelete(campaign.id)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-center gap-3">
                    <Select value={campaign.status} onValueChange={(v) => v && handleStatusChange(campaign.id, v as LocalCampaignStatus)}>
                      <SelectTrigger className="w-40">
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
                    {campaign.objective ? <Badge variant="outline">{campaign.objective}</Badge> : null}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Crea un proyecto para empezar a planificar campañas.</p>
      )}
    </div>
  );
}
