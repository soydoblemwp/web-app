"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, X, Loader2, Image as ImageIcon } from "lucide-react";
import { uploadMediaAction, attachMediaToPublicationAction } from "@/server/actions/publishing-media";
import { listMediaLibraryForSelectAction } from "@/server/actions/publishing-select";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { MediaAssetData, PublicationMediaData } from "@/components/publishing/types";

export function MediaPicker({
  projectId,
  publicationId,
  attached,
  onRemove,
  onAttached,
}: {
  projectId: string;
  publicationId: string;
  attached: PublicationMediaData[];
  onRemove: (fileAssetId: string) => void;
  onAttached: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [library, setLibrary] = useState<MediaAssetData[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.set("file", file);
      const result = await uploadMediaAction(projectId, formData);
      if (result.error) {
        toast.error(result.error);
        continue;
      }
      if (result.id) await attachMediaToPublicationAction(projectId, publicationId, result.id);
    }
    setUploading(false);
    onAttached();
  }

  async function openLibrary() {
    setLibraryOpen(true);
    setLoadingLibrary(true);
    const items = await listMediaLibraryForSelectAction(projectId);
    setLibrary(items as unknown as MediaAssetData[]);
    setLoadingLibrary(false);
  }

  async function handleReuse(assetId: string) {
    const result = await attachMediaToPublicationAction(projectId, publicationId, assetId);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setLibraryOpen(false);
    onAttached();
  }

  return (
    <div className="space-y-2">
      <Label>Medios</Label>
      <div className="flex flex-wrap gap-2">
        {attached.map(({ fileAsset }) => (
          <div key={fileAsset.id} className="group relative size-16 overflow-hidden rounded-md border">
            {fileAsset.mimeType.startsWith("video") ? (
              <video src={fileAsset.url} className="size-full object-cover" muted />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fileAsset.url} alt={fileAsset.altText ?? ""} className="size-full object-cover" />
            )}
            <button
              type="button"
              onClick={() => onRemove(fileAsset.id)}
              className="absolute top-0.5 right-0.5 rounded-full bg-background/80 p-0.5 opacity-0 group-hover:opacity-100"
              aria-label="Quitar medio"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex size-16 flex-col items-center justify-center gap-0.5 rounded-md border border-dashed text-muted-foreground hover:bg-muted"
        >
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          <span className="text-[9px]">Subir</span>
        </button>
        <button
          type="button"
          onClick={openLibrary}
          className="flex size-16 flex-col items-center justify-center gap-0.5 rounded-md border border-dashed text-muted-foreground hover:bg-muted"
        >
          <ImageIcon className="size-4" />
          <span className="text-[9px]">Biblioteca</span>
        </button>
        <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => handleUpload(e.target.files)} />
      </div>

      <Dialog open={libraryOpen} onOpenChange={setLibraryOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Reutilizar medio</DialogTitle>
          </DialogHeader>
          {loadingLibrary ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : library.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay medios en la biblioteca todavía.</p>
          ) : (
            <div className="grid max-h-96 grid-cols-4 gap-2 overflow-y-auto">
              {library.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => handleReuse(asset.id)}
                  className="aspect-square overflow-hidden rounded-md border hover:ring-2 hover:ring-primary"
                  title={asset.displayName ?? asset.originalName}
                >
                  {asset.mimeType.startsWith("video") ? (
                    <video src={asset.url} className="size-full object-cover" muted />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={asset.url} alt={asset.altText ?? ""} className="size-full object-cover" />
                  )}
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
