"use client";

import { useEffect, useRef, useState } from "react";
import { Crop, RotateCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import { ResetButton } from "@/components/public-tools/copy-download-actions";
import { formatBytes } from "@/lib/public-tools/files/format";
import { ACCEPTED_IMAGE_MIMES, FILE_LIMITS } from "@/lib/public-tools/files/limits";
import { loadImageFromFile, drawImageToCanvas, canvasToBlob, extensionForFormat, type ExportFormat } from "@/lib/public-tools/files/image-io";
import { ObjectUrlRegistry } from "@/lib/public-tools/files/object-url";

type AspectPreset = "free" | "1:1" | "4:3" | "3:2" | "16:9" | "9:16";
const ASPECT_VALUES: Record<AspectPreset, number | null> = { free: null, "1:1": 1, "4:3": 4 / 3, "3:2": 3 / 2, "16:9": 16 / 9, "9:16": 9 / 16 };

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const DISPLAY_MAX_WIDTH = 520;
const HANDLE_SIZE = 14;

export function CropImageTool() {
  const [file, setFile] = useState<File | null>(null);
  const [rotatedCanvas, setRotatedCanvas] = useState<HTMLCanvasElement | null>(null);
  const [rotation, setRotation] = useState(0);
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [aspect, setAspect] = useState<AspectPreset>("free");
  const [shape, setShape] = useState<"rect" | "circle">("rect");
  const [error, setError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultFormat, setResultFormat] = useState<ExportFormat>("image/png");
  const dragStateRef = useRef<{ mode: "new" | "move" | "resize"; startX: number; startY: number; startRect: Rect; handle?: string } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const urlsRef = useRef(new ObjectUrlRegistry());

  useEffect(() => {
    const urls = urlsRef.current;
    return () => urls.revokeAll();
  }, []);

  async function handleFileSelected(files: File[]) {
    const candidate = files[0];
    if (!candidate) return;
    setError(null);
    setResultUrl(null);
    const result = await loadImageFromFile(candidate);
    if (!result.ok || !result.loaded) {
      setError(result.error?.message ?? "No se pudo leer esta imagen.");
      return;
    }
    setFile(candidate);
    setSourceImage(result.loaded.image);
    setRotation(0);
    const canvas = drawImageToCanvas(result.loaded.image, result.loaded.width, result.loaded.height);
    setRotatedCanvas(canvas);
    setSelection({ x: canvas.width * 0.1, y: canvas.height * 0.1, width: canvas.width * 0.8, height: canvas.height * 0.8 });
  }

  function rotate() {
    if (!sourceImage) return;
    const nextRotation = (rotation + 90) % 360;
    setRotation(nextRotation);
    const swapped = nextRotation === 90 || nextRotation === 270;
    const outWidth = swapped ? sourceImage.naturalHeight : sourceImage.naturalWidth;
    const outHeight = swapped ? sourceImage.naturalWidth : sourceImage.naturalHeight;
    const canvas = drawImageToCanvas(sourceImage, outWidth, outHeight, (ctx) => {
      ctx.translate(outWidth / 2, outHeight / 2);
      ctx.rotate((nextRotation * Math.PI) / 180);
      ctx.drawImage(sourceImage, -sourceImage.naturalWidth / 2, -sourceImage.naturalHeight / 2);
    });
    setRotatedCanvas(canvas);
    setSelection({ x: outWidth * 0.1, y: outHeight * 0.1, width: outWidth * 0.8, height: outHeight * 0.8 });
  }

  function reset() {
    urlsRef.current.revokeAll();
    setFile(null);
    setRotatedCanvas(null);
    setSourceImage(null);
    setSelection(null);
    setRotation(0);
    setError(null);
    setResultUrl(null);
  }

  const displayScale = rotatedCanvas ? Math.min(1, DISPLAY_MAX_WIDTH / rotatedCanvas.width) : 1;
  const displayWidth = rotatedCanvas ? rotatedCanvas.width * displayScale : 0;
  const displayHeight = rotatedCanvas ? rotatedCanvas.height * displayScale : 0;

  function clampRect(rect: Rect, bounds: { width: number; height: number }): Rect {
    let { x, y, width, height } = rect;
    width = Math.max(10, Math.min(width, bounds.width));
    height = Math.max(10, Math.min(height, bounds.height));
    x = Math.max(0, Math.min(x, bounds.width - width));
    y = Math.max(0, Math.min(y, bounds.height - height));
    return { x, y, width, height };
  }

  function toNatural(displayDelta: number): number {
    return displayDelta / displayScale;
  }

  function handlePointerDown(e: React.PointerEvent, mode: "move" | "resize", handle?: string) {
    if (!selection) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragStateRef.current = { mode, startX: e.clientX, startY: e.clientY, startRect: selection, handle };
  }

  function handlePointerMove(e: React.PointerEvent) {
    const drag = dragStateRef.current;
    if (!drag || !rotatedCanvas) return;
    const dx = toNatural(e.clientX - drag.startX);
    const dy = toNatural(e.clientY - drag.startY);
    const bounds = { width: rotatedCanvas.width, height: rotatedCanvas.height };
    const ratio = ASPECT_VALUES[aspect];

    if (drag.mode === "move") {
      setSelection(clampRect({ ...drag.startRect, x: drag.startRect.x + dx, y: drag.startRect.y + dy }, bounds));
      return;
    }

    if (drag.mode === "resize") {
      let { x, y, width, height } = drag.startRect;
      if (drag.handle?.includes("e")) width = drag.startRect.width + dx;
      if (drag.handle?.includes("s")) height = drag.startRect.height + dy;
      if (drag.handle?.includes("w")) {
        width = drag.startRect.width - dx;
        x = drag.startRect.x + dx;
      }
      if (drag.handle?.includes("n")) {
        height = drag.startRect.height - dy;
        y = drag.startRect.y + dy;
      }
      if (ratio) height = width / ratio;
      setSelection(clampRect({ x, y, width, height }, bounds));
    }
  }

  function handlePointerUp() {
    dragStateRef.current = null;
  }

  function updateSelectionField(field: keyof Rect, value: number) {
    if (!selection || !rotatedCanvas) return;
    const next = { ...selection, [field]: value };
    if (ASPECT_VALUES[aspect] && (field === "width" || field === "height")) {
      next.height = field === "width" ? value / ASPECT_VALUES[aspect]! : value;
      next.width = field === "height" ? value * ASPECT_VALUES[aspect]! : value;
    }
    setSelection(clampRect(next, { width: rotatedCanvas.width, height: rotatedCanvas.height }));
  }

  async function handleExport(format: ExportFormat) {
    if (!rotatedCanvas || !selection) return;
    const output = drawImageToCanvas(rotatedCanvas, selection.width, selection.height, (ctx, canvas) => {
      if (shape === "circle") {
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(canvas.width / 2, canvas.height / 2, canvas.width / 2, canvas.height / 2, 0, 0, Math.PI * 2);
        ctx.clip();
      }
      ctx.drawImage(rotatedCanvas, selection.x, selection.y, selection.width, selection.height, 0, 0, canvas.width, canvas.height);
      if (shape === "circle") ctx.restore();
    });
    const effectiveFormat: ExportFormat = shape === "circle" ? "image/png" : format;
    const blob = await canvasToBlob(output, effectiveFormat, 0.92);
    urlsRef.current.revoke(resultUrl);
    const url = urlsRef.current.create(blob);
    setResultUrl(url);
    setResultFormat(effectiveFormat);
  }

  function downloadResult() {
    if (!resultUrl) return;
    const link = document.createElement("a");
    link.href = resultUrl;
    link.download = `imagen-recortada.${extensionForFormat(resultFormat)}`;
    link.click();
  }

  return (
    <div className="space-y-4">
      {!file ? (
        <FileUploadZone
          accept={ACCEPTED_IMAGE_MIMES.join(",")}
          onFilesSelected={(files) => void handleFileSelected(files)}
          label="Arrastra una imagen aquí, o"
          hint={`hasta ${Math.round(FILE_LIMITS.image.maxFileBytes / (1024 * 1024))} MB`}
        />
      ) : (
        <div className="flex items-center gap-2 text-sm">
          <span className="truncate">{file.name}</span>
          <span className="text-muted-foreground">({formatBytes(file.size)})</span>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Eliminar archivo" onClick={reset}>
            <X className="size-3.5" />
          </Button>
        </div>
      )}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {rotatedCanvas && selection ? (
        <div className="space-y-4">
          <div role="group" aria-label="Relación de aspecto" className="flex flex-wrap gap-2">
            {(Object.keys(ASPECT_VALUES) as AspectPreset[]).map((key) => (
              <Button key={key} type="button" size="sm" variant={aspect === key ? "default" : "outline"} aria-pressed={aspect === key} onClick={() => setAspect(key)}>
                {key === "free" ? "Libre" : key}
              </Button>
            ))}
            <Button type="button" size="sm" variant={shape === "circle" ? "default" : "outline"} aria-pressed={shape === "circle"} onClick={() => setShape((s) => (s === "circle" ? "rect" : "circle"))}>
              Círculo
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={rotate}>
              <RotateCw className="size-3.5" /> Rotar
            </Button>
          </div>

          <div
            ref={containerRef}
            className="relative touch-none select-none overflow-hidden rounded-lg border bg-muted/20"
            style={{ width: displayWidth, height: displayHeight }}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={rotatedCanvas.toDataURL()} alt="Imagen a recortar" className="pointer-events-none absolute inset-0 h-full w-full" draggable={false} />
            <div
              role="group"
              aria-label="Selección de recorte, arrastrable"
              className={`absolute cursor-move border-2 border-primary bg-primary/10 ${shape === "circle" ? "rounded-full" : ""}`}
              style={{
                left: selection.x * displayScale,
                top: selection.y * displayScale,
                width: selection.width * displayScale,
                height: selection.height * displayScale,
              }}
              onPointerDown={(e) => handlePointerDown(e, "move")}
            >
              {["nw", "ne", "sw", "se"].map((handle) => (
                <div
                  key={handle}
                  role="button"
                  tabIndex={0}
                  aria-label={`Redimensionar selección (${handle})`}
                  className="absolute rounded-full border-2 border-primary bg-background"
                  style={{
                    width: HANDLE_SIZE,
                    height: HANDLE_SIZE,
                    cursor: `${handle}-resize`,
                    left: handle.includes("w") ? -HANDLE_SIZE / 2 : undefined,
                    right: handle.includes("e") ? -HANDLE_SIZE / 2 : undefined,
                    top: handle.includes("n") ? -HANDLE_SIZE / 2 : undefined,
                    bottom: handle.includes("s") ? -HANDLE_SIZE / 2 : undefined,
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    handlePointerDown(e, "resize", handle);
                  }}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <Label htmlFor="crop-x" className="mb-1">
                X
              </Label>
              <Input id="crop-x" type="number" value={Math.round(selection.x)} onChange={(e) => updateSelectionField("x", Number(e.target.value) || 0)} />
            </div>
            <div>
              <Label htmlFor="crop-y" className="mb-1">
                Y
              </Label>
              <Input id="crop-y" type="number" value={Math.round(selection.y)} onChange={(e) => updateSelectionField("y", Number(e.target.value) || 0)} />
            </div>
            <div>
              <Label htmlFor="crop-width" className="mb-1">
                Ancho
              </Label>
              <Input id="crop-width" type="number" value={Math.round(selection.width)} onChange={(e) => updateSelectionField("width", Number(e.target.value) || 1)} />
            </div>
            <div>
              <Label htmlFor="crop-height" className="mb-1">
                Alto
              </Label>
              <Input id="crop-height" type="number" value={Math.round(selection.height)} onChange={(e) => updateSelectionField("height", Number(e.target.value) || 1)} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => handleExport("image/png")}>
              <Crop className="size-3.5" /> Exportar PNG
            </Button>
            <Button type="button" variant="outline" onClick={() => handleExport("image/jpeg")} disabled={shape === "circle"}>
              Exportar JPEG
            </Button>
            <ResetButton onReset={reset} />
          </div>
        </div>
      ) : null}

      {resultUrl ? (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={resultUrl} alt="Resultado del recorte" className="max-h-64 rounded border" />
          <Button type="button" size="sm" onClick={downloadResult}>
            Descargar
          </Button>
        </div>
      ) : null}
    </div>
  );
}
