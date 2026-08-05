"use client";

import { useState } from "react";
import { ArrowUp, ArrowDown, RotateCw, X, FileImage } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import { ResetButton } from "@/components/public-tools/copy-download-actions";
import { formatBytes } from "@/lib/public-tools/files/format";
import { validateImageFile } from "@/lib/public-tools/files/validation";
import { ACCEPTED_IMAGE_MIMES, FILE_LIMITS } from "@/lib/public-tools/files/limits";
import { loadImageFromFile, drawImageToCanvas, canvasToBlob } from "@/lib/public-tools/files/image-io";
import { buildPdfFromImages, pdfPageSizeLabel, type PdfPageSizeOption, type ImageFitMode, type PdfOrientation, type EmbeddableImageInput } from "@/lib/public-tools/pdf/images-to-pdf";
import { downloadBlob } from "@/lib/public-tools/files/download";

interface QueuedImage {
  key: string;
  file: File;
  rotation: number;
  error?: string;
}

let nextKey = 0;

async function prepareEmbeddableImage(file: File, rotation: number): Promise<EmbeddableImageInput> {
  const loadResult = await loadImageFromFile(file);
  if (!loadResult.ok || !loadResult.loaded) throw new Error(loadResult.error?.message ?? "no-se-pudo-leer");
  const { image, width, height } = loadResult.loaded;
  const normalizedRotation = ((rotation % 360) + 360) % 360;
  const swapped = normalizedRotation === 90 || normalizedRotation === 270;
  const outWidth = swapped ? height : width;
  const outHeight = swapped ? width : height;

  const canvas = drawImageToCanvas(image, outWidth, outHeight, (ctx) => {
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((normalizedRotation * Math.PI) / 180);
    ctx.drawImage(image, -width / 2, -height / 2, width, height);
  });

  const isJpegSource = file.type === "image/jpeg";
  const blob = await canvasToBlob(canvas, isJpegSource ? "image/jpeg" : "image/png", 0.92);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  URL.revokeObjectURL(loadResult.loaded.url);
  return { bytes, format: isJpegSource ? "jpg" : "png", width: outWidth, height: outHeight };
}

export function ImagesToPdfTool() {
  const [queue, setQueue] = useState<QueuedImage[]>([]);
  const [pageSize, setPageSize] = useState<PdfPageSizeOption>("auto");
  const [orientation, setOrientation] = useState<PdfOrientation>("auto");
  const [marginPt, setMarginPt] = useState(20);
  const [fit, setFit] = useState<ImageFitMode>("contain");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);

  function addFiles(files: File[]) {
    setError(null);
    setResultBytes(null);
    const entries: QueuedImage[] = files.map((file) => {
      const validation = validateImageFile(file);
      return { key: String(nextKey++), file, rotation: 0, error: validation.ok ? undefined : validation.error?.message };
    });
    setQueue((prev) => [...prev, ...entries]);
  }

  function removeItem(key: string) {
    setQueue((prev) => prev.filter((q) => q.key !== key));
  }

  function moveItem(key: string, direction: -1 | 1) {
    setQueue((prev) => {
      const index = prev.findIndex((q) => q.key === key);
      const targetIndex = index + direction;
      if (index === -1 || targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  }

  function rotateItem(key: string) {
    setQueue((prev) => prev.map((q) => (q.key === key ? { ...q, rotation: (q.rotation + 90) % 360 } : q)));
  }

  function reset() {
    setQueue([]);
    setError(null);
    setResultBytes(null);
  }

  const validItems = queue.filter((q) => !q.error);

  async function handleGenerate() {
    if (validItems.length === 0) return;
    setIsProcessing(true);
    setError(null);
    try {
      const images = await Promise.all(validItems.map((item) => prepareEmbeddableImage(item.file, item.rotation)));
      const result = await buildPdfFromImages(images, { pageSize, orientation, marginPt, fit });
      if (!result.ok || !result.bytes) {
        setError(result.error?.message ?? "No se pudo generar el PDF.");
        return;
      }
      setResultBytes(result.bytes);
    } catch {
      setError("No se pudo generar el PDF a partir de las imágenes.");
    } finally {
      setIsProcessing(false);
    }
  }

  function download() {
    if (!resultBytes) return;
    downloadBlob("imagenes-convertidas.pdf", resultBytes, "application/pdf");
  }

  return (
    <div className="space-y-4">
      <FileUploadZone
        accept={ACCEPTED_IMAGE_MIMES.join(",")}
        multiple
        onFilesSelected={addFiles}
        label="Arrastra tus imágenes aquí, o"
        hint={`hasta 30 imágenes, ${Math.round(FILE_LIMITS.image.maxFileBytes / (1024 * 1024))} MB cada una`}
      />

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {queue.length > 0 ? (
        <ul className="space-y-2">
          {queue.map((item, index) => (
            <li key={item.key} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
              <span className="w-6 text-center text-xs text-muted-foreground">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate">{item.file.name}</span>
              <span className="text-xs text-muted-foreground">{formatBytes(item.file.size)}</span>
              {item.error ? (
                <span role="alert" className="text-xs text-destructive">
                  {item.error}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">{item.rotation}°</span>
              )}
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Rotar 90°" onClick={() => rotateItem(item.key)} disabled={!!item.error}>
                <RotateCw className="size-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Subir en la lista" disabled={index === 0} onClick={() => moveItem(item.key, -1)}>
                <ArrowUp className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Bajar en la lista"
                disabled={index === queue.length - 1}
                onClick={() => moveItem(item.key, 1)}
              >
                <ArrowDown className="size-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Eliminar ${item.file.name}`} onClick={() => removeItem(item.key)}>
                <X className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {queue.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <Label htmlFor="page-size" className="mb-1">
              Tamaño de página
            </Label>
            <Select value={pageSize} onValueChange={(v) => setPageSize(v as PdfPageSizeOption)}>
              <SelectTrigger id="page-size" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["auto", "a4", "letter", "legal"] as PdfPageSizeOption[]).map((option) => (
                  <SelectItem key={option} value={option}>
                    {pdfPageSizeLabel(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="orientation" className="mb-1">
              Orientación
            </Label>
            <Select value={orientation} onValueChange={(v) => setOrientation(v as PdfOrientation)}>
              <SelectTrigger id="orientation" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Automática</SelectItem>
                <SelectItem value="portrait">Vertical</SelectItem>
                <SelectItem value="landscape">Horizontal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="margin" className="mb-1">
              Margen (pt)
            </Label>
            <Input id="margin" type="number" min={0} max={100} value={marginPt} onChange={(e) => setMarginPt(Number(e.target.value) || 0)} />
          </div>
          <div>
            <Label htmlFor="fit" className="mb-1">
              Ajuste
            </Label>
            <Select value={fit} onValueChange={(v) => setFit(v as ImageFitMode)}>
              <SelectTrigger id="fit" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contain">Contener</SelectItem>
                <SelectItem value="cover">Cubrir</SelectItem>
                <SelectItem value="actual">Tamaño real</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={handleGenerate} disabled={validItems.length === 0 || isProcessing}>
          <FileImage className="size-3.5" /> {isProcessing ? "Generando..." : "Generar PDF"}
        </Button>
        <ResetButton onReset={reset} />
      </div>

      {resultBytes ? (
        <div aria-live="polite" className="space-y-2 rounded-lg border bg-muted/30 p-4">
          <p className="text-sm">PDF generado con {validItems.length} imágenes ({formatBytes(resultBytes.byteLength)}).</p>
          <Button type="button" size="sm" onClick={download}>
            Descargar imagenes-convertidas.pdf
          </Button>
        </div>
      ) : null}
    </div>
  );
}
