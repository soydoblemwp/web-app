"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Search, Archive, Trash2, Loader2 } from "lucide-react";
import { listMediaLibraryForSelectAction } from "@/server/actions/publishing-select";
import { uploadMediaAction, updateMediaAction, archiveMediaAction, deleteMediaAction } from "@/server/actions/publishing-media";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { MediaAssetData } from "@/components/publishing/types";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function LibraryView({ projectId }: { projectId: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState<MediaAssetData[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [selected, setSelected] = useState<MediaAssetData | null>(null);

  async function refresh() {
    setLoading(true);
    const items = await listMediaLibraryForSelectAction(projectId, { search: search || undefined, includeArchived: showArchived });
    setAssets(items as unknown as MediaAssetData[]);
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    listMediaLibraryForSelectAction(projectId, { search: search || undefined, includeArchived: showArchived }).then((items) => {
      if (cancelled) return;
      setAssets(items as unknown as MediaAssetData[]);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, search, showArchived]);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.set("file", file);
      const result = await uploadMediaAction(projectId, formData);
      if (result.error) toast.error(result.error);
    }
    setUploading(false);
    refresh();
  }

  async function handleSaveDetails(asset: MediaAssetData, patch: { displayName?: string; altText?: string; tags?: string[]; rightsSource?: string }) {
    const result = await updateMediaAction(projectId, asset.id, patch);
    if (result.error) toast.error(result.error);
    else refresh();
  }

  async function handleArchive(asset: MediaAssetData) {
    const result = await archiveMediaAction(projectId, asset.id, !asset.isArchived);
    if (result.error) toast.error(result.error);
    else {
      refresh();
      setSelected(null);
    }
  }

  async function handleDelete(asset: MediaAssetData) {
    const result = await deleteMediaAction(projectId, asset.id);
    if (result.error) toast.error(result.error);
    else {
      toast.success("Medio eliminado.");
      refresh();
      setSelected(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar medios..." className="pl-8" />
        </div>
        <div className="flex items-center gap-1.5">
          <Checkbox checked={showArchived} onCheckedChange={() => setShowArchived((v) => !v)} id="show-archived" />
          <Label htmlFor="show-archived" className="text-xs">
            Mostrar archivados
          </Label>
        </div>
        <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Subir
        </Button>
        <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => handleUpload(e.target.files)} />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : assets.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">Sin medios todavía.</CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
          {assets.map((asset) => (
            <button
              key={asset.id}
              type="button"
              onClick={() => setSelected(asset)}
              className="group relative aspect-square overflow-hidden rounded-md border hover:ring-2 hover:ring-primary"
            >
              {asset.mimeType.startsWith("video") ? (
                <video src={asset.url} className="size-full object-cover" muted />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={asset.url} alt={asset.altText ?? ""} className="size-full object-cover" />
              )}
              {asset.isArchived ? <span className="absolute top-1 right-1 rounded bg-background/80 px-1 text-[9px]">Archivado</span> : null}
            </button>
          ))}
        </div>
      )}

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto p-4 sm:max-w-sm">
          <SheetHeader className="px-0">
            <SheetTitle>Detalles del medio</SheetTitle>
          </SheetHeader>
          {selected ? (
            <div className="space-y-3">
              {selected.mimeType.startsWith("video") ? (
                <video src={selected.url} controls className="w-full rounded-md" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selected.url} alt={selected.altText ?? ""} className="w-full rounded-md" />
              )}
              <dl className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                <dt>Formato</dt>
                <dd>{selected.mimeType}</dd>
                <dt>Peso</dt>
                <dd>{formatBytes(selected.sizeBytes)}</dd>
                {selected.widthPx && selected.heightPx ? (
                  <>
                    <dt>Dimensiones</dt>
                    <dd>
                      {selected.widthPx}×{selected.heightPx}
                    </dd>
                  </>
                ) : null}
                {selected.durationSec ? (
                  <>
                    <dt>Duración</dt>
                    <dd>{selected.durationSec}s</dd>
                  </>
                ) : null}
              </dl>
              <div className="space-y-1.5">
                <Label className="text-xs">Nombre</Label>
                <Input
                  defaultValue={selected.displayName ?? selected.originalName}
                  onBlur={(e) => handleSaveDetails(selected, { displayName: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Texto alternativo</Label>
                <Input defaultValue={selected.altText ?? ""} onBlur={(e) => handleSaveDetails(selected, { altText: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Etiquetas (separadas por coma)</Label>
                <Input
                  defaultValue={selected.tags.join(", ")}
                  onBlur={(e) =>
                    handleSaveDetails(selected, { tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Derechos / fuente</Label>
                <Input defaultValue={selected.rightsSource ?? ""} onBlur={(e) => handleSaveDetails(selected, { rightsSource: e.target.value })} />
              </div>
              <div className="flex gap-1.5 border-t pt-3">
                <Button type="button" variant="outline" size="sm" onClick={() => handleArchive(selected)}>
                  <Archive className="size-3.5" /> {selected.isArchived ? "Desarchivar" : "Archivar"}
                </Button>
                <Button type="button" variant="outline" size="sm" className="text-destructive" onClick={() => handleDelete(selected)}>
                  <Trash2 className="size-3.5" /> Eliminar
                </Button>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
