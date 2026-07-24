"use client";

import { useEffect, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import {
  createLocalProject,
  deleteLocalProject,
  listLocalProjects,
  updateLocalProject,
} from "@/lib/guest-storage/projects";
import type { LocalProject } from "@/lib/guest-storage/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const emptyForm = { name: "", description: "", primaryLanguage: "es", tone: "", targetAudience: "", market: "" };

export function GuestProjectsManager() {
  const [projects, setProjects] = useState<LocalProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editing, setEditing] = useState<LocalProject | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showCreate, setShowCreate] = useState(false);

  async function refresh() {
    setProjects(await listLocalProjects());
  }

  useEffect(() => {
    (async () => {
      await refresh();
      setIsLoading(false);
    })();
  }, []);

  function openEdit(project: LocalProject) {
    setEditing(project);
    setForm({
      name: project.name,
      description: project.description,
      primaryLanguage: project.primaryLanguage,
      tone: project.tone,
      targetAudience: project.targetAudience,
      market: project.market,
    });
  }

  async function handleCreate() {
    if (!form.name.trim()) return;
    await createLocalProject(form);
    setForm(emptyForm);
    setShowCreate(false);
    await refresh();
  }

  async function handleSaveEdit() {
    if (!editing) return;
    await updateLocalProject(editing.id, form);
    setEditing(null);
    await refresh();
  }

  async function handleDelete(id: string) {
    await deleteLocalProject(id);
    await refresh();
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Cargando proyectos locales...</p>;

  return (
    <div className="space-y-4">
      <Button type="button" onClick={() => setShowCreate(true)}>
        Nuevo proyecto
      </Button>

      {projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no tienes proyectos locales. Crea uno para organizar tu contenido, campañas y calendario.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {projects.map((project) => (
            <Card key={project.id}>
              <CardHeader className="flex-row items-start justify-between space-y-0">
                <CardTitle className="text-base">{project.name}</CardTitle>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Editar" onClick={() => openEdit(project)}>
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Eliminar"
                    onClick={() => handleDelete(project.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-muted-foreground">
                {project.description ? <p>{project.description}</p> : null}
                <p>Idioma: {project.primaryLanguage}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo proyecto local</DialogTitle>
          </DialogHeader>
          <ProjectFormFields form={form} setForm={setForm} />
          <DialogFooter>
            <Button type="button" onClick={handleCreate} disabled={!form.name.trim()}>
              Crear proyecto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar proyecto</DialogTitle>
          </DialogHeader>
          <ProjectFormFields form={form} setForm={setForm} />
          <DialogFooter>
            <Button type="button" onClick={handleSaveEdit} disabled={!form.name.trim()}>
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProjectFormFields({
  form,
  setForm,
}: {
  form: typeof emptyForm;
  setForm: (form: typeof emptyForm) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <Label>Nombre</Label>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={200} autoFocus />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label>Descripción</Label>
        <Textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={2}
          maxLength={500}
        />
      </div>
      <div className="space-y-2">
        <Label>Idioma principal</Label>
        <Input
          value={form.primaryLanguage}
          onChange={(e) => setForm({ ...form, primaryLanguage: e.target.value })}
          maxLength={10}
        />
      </div>
      <div className="space-y-2">
        <Label>Mercado</Label>
        <Input value={form.market} onChange={(e) => setForm({ ...form, market: e.target.value })} maxLength={200} />
      </div>
      <div className="space-y-2">
        <Label>Tono</Label>
        <Input value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })} maxLength={200} />
      </div>
      <div className="space-y-2">
        <Label>Audiencia objetivo</Label>
        <Input
          value={form.targetAudience}
          onChange={(e) => setForm({ ...form, targetAudience: e.target.value })}
          maxLength={300}
        />
      </div>
    </div>
  );
}
