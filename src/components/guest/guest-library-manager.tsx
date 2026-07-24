"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Pencil, RotateCcw, Star, Trash2 } from "lucide-react";
import { useGuestProject } from "@/hooks/use-guest-project";
import {
  duplicateLibraryItem,
  listLibraryItemsByProject,
  permanentlyDeleteLibraryItem,
  restoreLibraryItem,
  softDeleteLibraryItem,
  toggleLibraryItemFavorite,
  updateLibraryItem,
} from "@/lib/guest-storage/library";
import type { LocalLibraryItem } from "@/lib/guest-storage/types";
import { GuestProjectSelect } from "@/components/guest/guest-project-select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const KIND_LABELS: Record<LocalLibraryItem["kind"], string> = {
  CONTENT: "Contenido",
  SOCIAL_IDEAS: "Ideas",
  ADAPTATION: "Adaptación",
  REPLY: "Respuesta",
  OTHER: "Otro",
};

export function GuestLibraryManager() {
  const { projects, selectedId, selectProject, refresh: refreshProjects, isLoading: isLoadingProjects } =
    useGuestProject();
  const [items, setItems] = useState<LocalLibraryItem[]>([]);
  const [showTrash, setShowTrash] = useState(false);
  const [editing, setEditing] = useState<LocalLibraryItem | null>(null);
  const [editForm, setEditForm] = useState({ title: "", body: "" });

  async function refreshItems(projectId: string | null) {
    if (!projectId) {
      setItems([]);
      return;
    }
    setItems(await listLibraryItemsByProject(projectId, { includeDeleted: true }));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshItems(selectedId);
  }, [selectedId]);

  const visibleItems = items.filter((item) => item.isDeleted === showTrash);

  async function handleFavorite(id: string) {
    await toggleLibraryItemFavorite(id);
    await refreshItems(selectedId);
  }

  async function handleDuplicate(id: string) {
    await duplicateLibraryItem(id);
    await refreshItems(selectedId);
    toast.success("Elemento duplicado.");
  }

  async function handleSoftDelete(id: string) {
    await softDeleteLibraryItem(id);
    await refreshItems(selectedId);
  }

  async function handleRestore(id: string) {
    await restoreLibraryItem(id);
    await refreshItems(selectedId);
    toast.success("Elemento restaurado.");
  }

  async function handlePermanentDelete(id: string) {
    await permanentlyDeleteLibraryItem(id);
    await refreshItems(selectedId);
  }

  function openEdit(item: LocalLibraryItem) {
    setEditing(item);
    setEditForm({ title: item.title, body: item.body });
  }

  async function saveEdit() {
    if (!editing) return;
    await updateLibraryItem(editing.id, editForm);
    setEditing(null);
    await refreshItems(selectedId);
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
          <div className="flex gap-2">
            <Button type="button" variant={showTrash ? "outline" : "default"} size="sm" onClick={() => setShowTrash(false)}>
              Biblioteca
            </Button>
            <Button type="button" variant={showTrash ? "default" : "outline"} size="sm" onClick={() => setShowTrash(true)}>
              Papelera ({items.filter((i) => i.isDeleted).length})
            </Button>
          </div>

          {visibleItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {showTrash ? "La papelera está vacía." : "Todavía no hay nada guardado en este proyecto."}
            </p>
          ) : (
            <div className="space-y-3">
              {visibleItems.map((item) => (
                <Card key={item.id}>
                  <CardHeader className="flex-row items-start justify-between space-y-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{KIND_LABELS[item.kind]}</Badge>
                      <p className="truncate text-sm font-medium">{item.title}</p>
                      {item.isFavorite ? <Star className="size-3.5 fill-amber-400 text-amber-400" /> : null}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {!showTrash ? (
                        <>
                          <Button type="button" variant="ghost" size="icon-sm" aria-label="Favorito" onClick={() => handleFavorite(item.id)}>
                            <Star className={item.isFavorite ? "size-3.5 fill-amber-400 text-amber-400" : "size-3.5"} />
                          </Button>
                          <Button type="button" variant="ghost" size="icon-sm" aria-label="Editar" onClick={() => openEdit(item)}>
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon-sm" aria-label="Duplicar" onClick={() => handleDuplicate(item.id)}>
                            <Copy className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Copiar al portapapeles"
                            onClick={async () => {
                              await navigator.clipboard.writeText(item.body);
                              toast.success("Copiado al portapapeles.");
                            }}
                          >
                            <Copy className="size-3.5 opacity-50" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon-sm" aria-label="Eliminar" onClick={() => handleSoftDelete(item.id)}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button type="button" variant="ghost" size="icon-sm" aria-label="Restaurar" onClick={() => handleRestore(item.id)}>
                            <RotateCcw className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Eliminar definitivamente"
                            onClick={() => handlePermanentDelete(item.id)}
                          >
                            <Trash2 className="size-3.5 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">{item.body}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Crea un proyecto para empezar a guardar contenido.</p>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} maxLength={200} />
            <Textarea
              value={editForm.body}
              onChange={(e) => setEditForm({ ...editForm, body: e.target.value })}
              rows={10}
            />
          </div>
          <DialogFooter>
            <Button type="button" onClick={saveEdit}>
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
