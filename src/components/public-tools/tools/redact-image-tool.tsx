"use client";

import { useRef, useState } from "react";
import { EyeOff, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import { ResetButton } from "@/components/public-tools/copy-download-actions";
import { formatBytes } from "@/lib/public-tools/files/format";
import { ACCEPTED_IMAGE_MIMES, FILE_LIMITS } from "@/lib/public-tools/files/limits";
import { loadImageFromFile, drawImageToCanvas, canvasToBlob } from "@/lib/public-tools/files/image-io";
import { ObjectUrlRegistry } from "@/lib/public-tools/files/object-url";
import type { RedactEffect, RedactZone } from "@/lib/public-tools/images/redact";

const DISPLAY_MAX_WIDTH = 520;

let nextZoneId = 0;

export function RedactImageTool() {
  const [file, setFile] = useState<File | null>(null);
  const [sourceCanvas, setSourceCanvas] = useState<HTMLCanvasElement | null>(null);
  const [zones, setZones] = useState<RedactZone[]>([]);
  const [history, setHistory] = useState<RedactZone[][]>([]);
  const [redoStack, setRedoStack] = useState<RedactZone[][]>([]);
  const [effect, setEffect] = useState<RedactEffect>("pixelate");
  const [intensity, setIntensity] = useState(16);
  const [blockColor, setBlockColor] = useState("#000000");
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const urlsRef = useRef(new ObjectUrlRegistry());
  const drawStateRef = useRef<{ startX: number; startY: number } | null>(null);

  async function handleFileSelected(files: File[]) {
    const candidate = files[0];
    if (!candidate) return;
    setError(null);
    setPreviewUrl(null);
    const result = await loadImageFromFile(candidate);
    if (!result.ok || !result.loaded) {
      setError(result.error?.message ?? "No se pudo leer esta imagen.");
      return;
    }
    setFile(candidate);
    const canvas = drawImageToCanvas(result.loaded.image, result.loaded.width, result.loaded.height);
    setSourceCanvas(canvas);
    setZones([]);
    setHistory([]);
    setRedoStack([]);
  }

  function reset() {
    urlsRef.current.revokeAll();
    setFile(null);
    setSourceCanvas(null);
    setZones([]);
    setHistory([]);
    setRedoStack([]);
    setError(null);
    setPreviewUrl(null);
  }

  const displayScale = sourceCanvas ? Math.min(1, DISPLAY_MAX_WIDTH / sourceCanvas.width) : 1;
  const displayWidth = sourceCanvas ? sourceCanvas.width * displayScale : 0;
  const displayHeight = sourceCanvas ? sourceCanvas.height * displayScale : 0;

  function pushHistory() {
    setHistory((prev) => [...prev, zones]);
    setRedoStack([]);
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    drawStateRef.current = { startX: e.clientX - rect.left, startY: e.clientY - rect.top };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const start = drawStateRef.current;
    drawStateRef.current = null;
    if (!start || !sourceCanvas) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;

    const x = Math.min(start.startX, endX) / displayScale;
    const y = Math.min(start.startY, endY) / displayScale;
    const width = Math.abs(endX - start.startX) / displayScale;
    const height = Math.abs(endY - start.startY) / displayScale;
    if (width < 6 || height < 6) return;

    pushHistory();
    setZones((prev) => [...prev, { id: String(nextZoneId++), x, y, width, height }]);
  }

  function updateZoneField(id: string, field: keyof RedactZone, value: number) {
    pushHistory();
    setZones((prev) => prev.map((z) => (z.id === id ? { ...z, [field]: value } : z)));
  }

  function removeZone(id: string) {
    pushHistory();
    setZones((prev) => prev.filter((z) => z.id !== id));
  }

  function undo() {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      setRedoStack((redo) => [...redo, zones]);
      setZones(prev[prev.length - 1]);
      return prev.slice(0, -1);
    });
  }

  function redo() {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      setHistory((h) => [...h, zones]);
      setZones(prev[prev.length - 1]);
      return prev.slice(0, -1);
    });
  }

  async function handleExport() {
    if (!sourceCanvas) return;
    setError(null);
    try {
      const { applyAllRedactZones } = await import("@/lib/public-tools/images/redact");
      const output = document.createElement("canvas");
      output.width = sourceCanvas.width;
      output.height = sourceCanvas.height;
      applyAllRedactZones(output, sourceCanvas, zones, effect, intensity, blockColor);
      const blob = await canvasToBlob(output, "image/png");
      urlsRef.current.revoke(previewUrl);
      const url = urlsRef.current.create(blob);
      setPreviewUrl(url);
    } catch {
      setError("No se pudo procesar la imagen.");
    }
  }

  function download() {
    if (!previewUrl) return;
    const link = document.createElement("a");
    link.href = previewUrl;
    link.download = "imagen-con-zonas-ocultas.png";
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

      {sourceCanvas ? (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">Arrastra sobre la imagen para dibujar una zona a ocultar.</p>
          <div
            className="relative touch-none select-none overflow-hidden rounded-lg border bg-muted/20"
            style={{ width: displayWidth, height: displayHeight }}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={sourceCanvas.toDataURL()} alt="Imagen a editar" className="pointer-events-none absolute inset-0 h-full w-full" draggable={false} />
            {zones.map((zone) => (
              <div
                key={zone.id}
                className="absolute border-2 border-destructive bg-destructive/20"
                style={{ left: zone.x * displayScale, top: zone.y * displayScale, width: zone.width * displayScale, height: zone.height * displayScale }}
              />
            ))}
          </div>

          {zones.length > 0 ? (
            <ul className="space-y-2">
              {zones.map((zone, index) => (
                <li key={zone.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm">
                  <span className="text-xs text-muted-foreground">Zona {index + 1}</span>
                  <Label htmlFor={`zone-x-${zone.id}`} className="sr-only">
                    X
                  </Label>
                  <Input id={`zone-x-${zone.id}`} type="number" className="w-20" value={Math.round(zone.x)} onChange={(e) => updateZoneField(zone.id, "x", Number(e.target.value) || 0)} />
                  <Input type="number" className="w-20" value={Math.round(zone.y)} onChange={(e) => updateZoneField(zone.id, "y", Number(e.target.value) || 0)} aria-label="Y" />
                  <Input
                    type="number"
                    className="w-20"
                    value={Math.round(zone.width)}
                    onChange={(e) => updateZoneField(zone.id, "width", Number(e.target.value) || 1)}
                    aria-label="Ancho"
                  />
                  <Input
                    type="number"
                    className="w-20"
                    value={Math.round(zone.height)}
                    onChange={(e) => updateZoneField(zone.id, "height", Number(e.target.value) || 1)}
                    aria-label="Alto"
                  />
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Eliminar zona ${index + 1}`} onClick={() => removeZone(zone.id)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={undo} disabled={history.length === 0}>
              Deshacer
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={redo} disabled={redoStack.length === 0}>
              Rehacer
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div role="group" aria-label="Efecto" className="col-span-2 flex flex-wrap gap-2 sm:col-span-2">
              {(["pixelate", "blur", "solid"] as RedactEffect[]).map((option) => (
                <Button key={option} type="button" size="sm" variant={effect === option ? "default" : "outline"} aria-pressed={effect === option} onClick={() => setEffect(option)}>
                  {option === "pixelate" ? "Pixelado" : option === "blur" ? "Desenfoque" : "Bloque sólido"}
                </Button>
              ))}
            </div>
            {effect !== "solid" ? (
              <div>
                <Label htmlFor="redact-intensity" className="mb-1">
                  Intensidad ({intensity})
                </Label>
                <input id="redact-intensity" type="range" min={4} max={40} value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} className="w-full" />
              </div>
            ) : (
              <div>
                <Label htmlFor="redact-color" className="mb-1">
                  Color del bloque
                </Label>
                <Input id="redact-color" type="color" value={blockColor} onChange={(e) => setBlockColor(e.target.value)} className="h-9" />
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={handleExport} disabled={zones.length === 0}>
              <EyeOff className="size-3.5" /> Aplicar y previsualizar
            </Button>
            <ResetButton onReset={reset} />
          </div>
        </div>
      ) : null}

      {previewUrl ? (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="Vista previa con zonas ocultas" className="max-h-80 rounded border" />
          <p className="text-xs text-muted-foreground">
            Revisa la imagen exportada antes de compartirla. El efecto oculta visualmente la zona seleccionada, pero no sustituye una revisión de privacidad
            profesional.
          </p>
          <Button type="button" size="sm" onClick={download}>
            Descargar
          </Button>
        </div>
      ) : null}
    </div>
  );
}
