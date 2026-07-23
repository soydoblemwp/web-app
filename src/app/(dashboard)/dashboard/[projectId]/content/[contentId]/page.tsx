import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Star, Copy, Archive, Trash2 } from "lucide-react";
import { getContentItem } from "@/server/services/content";
import {
  updateContentItemAction,
  toggleFavoriteContentAction,
  archiveContentAction,
  deleteContentAction,
  duplicateContentAction,
} from "@/server/actions/content";
import { ContentStatusSelect } from "@/components/content/content-status-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Contenido" };

export default async function ContentDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; contentId: string }>;
}) {
  const { projectId, contentId } = await params;
  const item = await getContentItem(contentId);
  if (!item || item.projectId !== projectId) notFound();

  const saveAction = updateContentItemAction.bind(null, projectId);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Badge variant="secondary">{item.type}</Badge>
            <Badge variant="outline">{item.status}</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{item.title}</h1>
          <p className="text-xs text-muted-foreground">
            Autor: {item.author.name || item.author.email} · Actualizado {item.updatedAt.toLocaleString("es-ES")}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <form action={toggleFavoriteContentAction.bind(null, projectId, item.id, !item.isFavorite)}>
            <Button type="submit" variant="outline" size="icon" aria-label="Favorito">
              <Star className={item.isFavorite ? "size-4 fill-amber-400 text-amber-400" : "size-4"} />
            </Button>
          </form>
          <form action={duplicateContentAction.bind(null, projectId, item.id)}>
            <Button type="submit" variant="outline" size="icon" aria-label="Duplicar">
              <Copy className="size-4" />
            </Button>
          </form>
          <form action={archiveContentAction.bind(null, projectId, item.id)}>
            <Button type="submit" variant="outline" size="icon" aria-label="Archivar">
              <Archive className="size-4" />
            </Button>
          </form>
          <form action={deleteContentAction.bind(null, projectId, item.id)}>
            <Button type="submit" variant="outline" size="icon" aria-label="Eliminar">
              <Trash2 className="size-4" />
            </Button>
          </form>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Label className="text-sm">Estado</Label>
        <ContentStatusSelect projectId={projectId} contentId={item.id} status={item.status} />
      </div>

      <form action={saveAction} className="space-y-4">
        <input type="hidden" name="id" value={item.id} />
        <div className="space-y-2">
          <Label htmlFor="title">Título</Label>
          <Input id="title" name="title" defaultValue={item.title} maxLength={300} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="body">Contenido</Label>
          <Textarea id="body" name="body" defaultValue={item.body} rows={16} className="font-mono text-sm" />
        </div>
        <Button type="submit">Guardar cambios</Button>
      </form>

      {item.versions.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-medium">Historial de versiones ({item.versions.length})</h2>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {item.versions.slice(0, 5).map((version) => (
              <li key={version.id}>{version.createdAt.toLocaleString("es-ES")}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
