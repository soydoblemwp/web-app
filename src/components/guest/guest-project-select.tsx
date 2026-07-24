"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { createLocalProject } from "@/lib/guest-storage/projects";
import type { LocalProject } from "@/lib/guest-storage/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Project picker reused by every "organización local" page — keeps "which local project am I working in" consistent everywhere. */
export function GuestProjectSelect({
  projects,
  selectedId,
  onSelect,
  onCreated,
}: {
  projects: LocalProject[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreated: (project: LocalProject) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleCreate() {
    if (!name.trim()) return;
    setIsSaving(true);
    const project = await createLocalProject({ name });
    setIsSaving(false);
    setName("");
    setOpen(false);
    onCreated(project);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {projects.length > 0 ? (
        <Select value={selectedId ?? undefined} onValueChange={(value) => value && onSelect(value)}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue placeholder="Selecciona un proyecto" />
          </SelectTrigger>
          <SelectContent>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <p className="text-sm text-muted-foreground">Todavía no tienes proyectos locales.</p>
      )}

      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-1 size-4" /> Nuevo proyecto
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo proyecto local</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-project-name">Nombre</Label>
            <Input
              id="new-project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              placeholder="Mi marca"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" onClick={handleCreate} disabled={isSaving || !name.trim()}>
              {isSaving ? "Creando..." : "Crear proyecto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
