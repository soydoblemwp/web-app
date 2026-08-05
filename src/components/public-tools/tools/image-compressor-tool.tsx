"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, Download, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { loadImageFromFile, drawImageToCanvas, canvasToBlob, extensionForFormat, type ExportFormat } from "@/lib/public-tools/files/image-io";
import { ObjectUrlRegistry } from "@/lib/public-tools/files/object-url";
import { formatBytes } from "@/lib/public-tools/files/format";
import { ACCEPTED_IMAGE_MIMES, FILE_LIMITS } from "@/lib/public-tools/files/limits";

/**
 * Fase 42 correction-in-advance: this tool now goes through the shared
 * `src/lib/public-tools/files/image-io.ts` core (load/draw/export) instead
 * of its own inline Canvas logic — the same core Recortar imágenes,
 * Generador de favicons, Extractor de paleta and Ocultar información reuse,
 * so there is exactly one "load an image file safely" implementation in the
 * app (spec section 3/17: "reutiliza... No copies el núcleo").
 */
export function ImageCompressorTool() {
  const [file, setFile] = useState<File | null>(null);
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [width, setWidth] = useState<number>(0);
  const [height, setHeight] = useState<number>(0);
  const [keepAspect, setKeepAspect] = useState(true);
  const [quality, setQuality] = useState(0.8);
  const [format, setFormat] = useState<ExportFormat>("image/jpeg");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultBytes, setResultBytes] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const aspectRatioRef = useRef(1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const urlsRef = useRef(new ObjectUrlRegistry());

  useEffect(() => {
    const urls = urlsRef.current;
    return () => urls.revokeAll();
  }, []);

  function reset() {
    urlsRef.current.revokeAll();
    setFile(null);
    setSourceImage(null);
    setSourceUrl(null);
    setResultUrl(null);
    setResultBytes(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const loadFile = useCallback(async (candidate: File) => {
    setError(null);
    const result = await loadImageFromFile(candidate);
    if (!result.ok || !result.loaded) {
      setError(result.error?.message ?? "No se pudo leer esta imagen.");
      return;
    }
    aspectRatioRef.current = result.loaded.width / result.loaded.height;
    setSourceImage(result.loaded.image);
    setSourceUrl(result.loaded.url);
    setWidth(result.loaded.width);
    setHeight(result.loaded.height);
    setFile(candidate);
    setResultUrl(null);
    setResultBytes(null);
  }, []);

  function handleWidthChange(value: number) {
    setWidth(value);
    if (keepAspect && aspectRatioRef.current) setHeight(Math.round(value / aspectRatioRef.current));
  }

  function handleHeightChange(value: number) {
    setHeight(value);
    if (keepAspect && aspectRatioRef.current) setWidth(Math.round(value * aspectRatioRef.current));
  }

  async function handleCompress() {
    if (!sourceImage) return;
    setIsProcessing(true);
    setError(null);
    try {
      const canvas = drawImageToCanvas(sourceImage, width, height);
      const blob = await canvasToBlob(canvas, format, quality);

      urlsRef.current.revoke(resultUrl);
      const url = urlsRef.current.create(blob);
      setResultUrl(url);
      setResultBytes(blob.size);
    } catch {
      setError("No se pudo procesar la imagen. Prueba con otro archivo o ajustes.");
    } finally {
      setIsProcessing(false);
    }
  }

  function downloadResult() {
    if (!resultUrl) return;
    const link = document.createElement("a");
    link.href = resultUrl;
    link.download = `imagen-comprimida.${extensionForFormat(format)}`;
    link.click();
  }

  return (
    <div className="space-y-4">
      <div
        className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const dropped = e.dataTransfer.files?.[0];
          if (dropped) void loadFile(dropped);
        }}
      >
        <Upload className="size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Arrastra una imagen aquí, o</p>
        <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
          Seleccionar archivo
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_IMAGE_MIMES.join(",")}
          className="sr-only"
          onChange={(e) => {
            const selected = e.target.files?.[0];
            if (selected) void loadFile(selected);
          }}
          aria-label="Seleccionar imagen"
        />
        <p className="text-xs text-muted-foreground">JPEG, PNG o WebP · hasta {formatBytes(FILE_LIMITS.image.maxFileBytes)}</p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {file && sourceUrl ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="truncate">{file.name}</span>
            <span className="text-muted-foreground">({formatBytes(file.size)})</span>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Eliminar archivo" onClick={reset}>
              <X className="size-3.5" />
            </Button>
          </div>

          {/* next/image can't optimize a locally-generated blob: URL (no remote loader applies, and the point of this tool is that the file never leaves the browser) — a plain <img> is the correct element here. */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={sourceUrl} alt="Vista previa original" className="max-h-64 w-full rounded-lg border object-contain" />
            {resultUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={resultUrl} alt="Vista previa comprimida" className="max-h-64 w-full rounded-lg border object-contain" />
            ) : (
              <div className="flex max-h-64 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                El resultado aparecerá aquí
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <Label htmlFor="image-width" className="mb-1">
                Ancho (px)
              </Label>
              <Input id="image-width" type="number" min={1} max={FILE_LIMITS.image.maxDimension} value={width} onChange={(e) => handleWidthChange(Number(e.target.value) || 1)} />
            </div>
            <div>
              <Label htmlFor="image-height" className="mb-1">
                Alto (px)
              </Label>
              <Input id="image-height" type="number" min={1} max={FILE_LIMITS.image.maxDimension} value={height} onChange={(e) => handleHeightChange(Number(e.target.value) || 1)} />
            </div>
            <div className="col-span-2 flex items-end gap-2 pb-1.5">
              <Checkbox id="keep-aspect" checked={keepAspect} onCheckedChange={() => setKeepAspect((v) => !v)} />
              <Label htmlFor="keep-aspect" className="text-sm font-normal">
                Mantener proporción
              </Label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <Label htmlFor="image-format" className="mb-1">
                Formato de salida
              </Label>
              <Select value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
                <SelectTrigger id="image-format" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="image/jpeg">JPEG</SelectItem>
                  <SelectItem value="image/png">PNG</SelectItem>
                  <SelectItem value="image/webp">WebP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {format !== "image/png" ? (
              <div>
                <Label htmlFor="image-quality" className="mb-1">
                  Calidad ({Math.round(quality * 100)}%)
                </Label>
                <input
                  id="image-quality"
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={quality}
                  onChange={(e) => setQuality(Number(e.target.value))}
                  className="w-full"
                />
              </div>
            ) : null}
          </div>

          {resultBytes !== null ? (
            <p aria-live="polite" className="text-sm text-muted-foreground">
              Tamaño original: {formatBytes(file.size)} · Tamaño comprimido: {formatBytes(resultBytes)} (
              {Math.round((1 - resultBytes / file.size) * 100)}% de reducción)
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={handleCompress} disabled={isProcessing}>
              {isProcessing ? "Procesando..." : "Procesar imagen"}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={!resultUrl} onClick={downloadResult}>
              <Download className="size-3.5" /> Descargar
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={reset}>
              <RotateCcw className="size-3.5" /> Reiniciar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
