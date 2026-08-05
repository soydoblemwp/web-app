"use client";

import { useState } from "react";
import { Palette as PaletteIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import { CopyButton, DownloadButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { formatBytes } from "@/lib/public-tools/files/format";
import { ACCEPTED_IMAGE_MIMES, FILE_LIMITS } from "@/lib/public-tools/files/limits";
import { loadImageFromFile, drawImageToCanvas } from "@/lib/public-tools/files/image-io";
import type { PaletteColor, PaletteSortMode } from "@/lib/public-tools/images/palette";

export function PaletteTool() {
  const [file, setFile] = useState<File | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [colorCount, setColorCount] = useState(6);
  const [sortMode, setSortMode] = useState<PaletteSortMode>("predominance");
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [colors, setColors] = useState<PaletteColor[] | null>(null);
  const [cssExport, setCssExport] = useState("");
  const [jsonExport, setJsonExport] = useState("");

  async function handleFileSelected(files: File[]) {
    const candidate = files[0];
    if (!candidate) return;
    setError(null);
    setColors(null);
    const result = await loadImageFromFile(candidate);
    if (!result.ok || !result.loaded) {
      setError(result.error?.message ?? "No se pudo leer esta imagen.");
      return;
    }
    setFile(candidate);
    setImage(result.loaded.image);
  }

  function reset() {
    setFile(null);
    setImage(null);
    setError(null);
    setColors(null);
    setCssExport("");
    setJsonExport("");
  }

  async function extract(mode: PaletteSortMode = sortMode) {
    if (!image) return;
    setIsProcessing(true);
    setError(null);
    try {
      const { extractPalette, paletteToCss, paletteToJson } = await import("@/lib/public-tools/images/palette");
      const canvas = drawImageToCanvas(image, Math.min(image.naturalWidth, 400), Math.min(image.naturalHeight, Math.round((400 * image.naturalHeight) / image.naturalWidth)));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no-context");
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const extracted = extractPalette(imageData, colorCount, mode);
      setColors(extracted);
      setCssExport(paletteToCss(extracted));
      setJsonExport(paletteToJson(extracted));
    } catch {
      setError("No se pudo extraer la paleta de esta imagen.");
    } finally {
      setIsProcessing(false);
    }
  }

  async function changeSortMode(mode: PaletteSortMode) {
    setSortMode(mode);
    if (colors) await extract(mode);
  }

  async function downloadPaletteCard() {
    if (!colors || colors.length === 0) return;
    const canvas = document.createElement("canvas");
    const swatchSize = 100;
    canvas.width = swatchSize * colors.length;
    canvas.height = swatchSize + 30;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    colors.forEach((color, i) => {
      ctx.fillStyle = color.hex;
      ctx.fillRect(i * swatchSize, 0, swatchSize, swatchSize);
      ctx.fillStyle = "#111111";
      ctx.font = "12px monospace";
      ctx.fillText(color.hex, i * swatchSize + 8, swatchSize + 18);
    });
    const blob: Blob = await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no-blob"))), "image/png"));
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "paleta-colores.png";
    link.click();
    URL.revokeObjectURL(url);
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

      {file ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-32">
              <Label htmlFor="palette-count" className="mb-1">
                Cantidad de colores
              </Label>
              <Input id="palette-count" type="number" min={2} max={16} value={colorCount} onChange={(e) => setColorCount(Number(e.target.value) || 6)} />
            </div>
            <Button type="button" onClick={() => extract()} disabled={isProcessing}>
              <PaletteIcon className="size-3.5" /> {isProcessing ? "Extrayendo..." : "Extraer paleta"}
            </Button>
            <ResetButton onReset={reset} />
          </div>
        </div>
      ) : null}

      {colors ? (
        <div className="space-y-4">
          <div role="group" aria-label="Ordenar por" className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant={sortMode === "predominance" ? "default" : "outline"} onClick={() => void changeSortMode("predominance")}>
              Predominancia
            </Button>
            <Button type="button" size="sm" variant={sortMode === "luminosity" ? "default" : "outline"} onClick={() => void changeSortMode("luminosity")}>
              Luminosidad
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {colors.map((color) => (
              <div key={color.hex} className="space-y-1 rounded-lg border p-3">
                <div className="h-16 w-full rounded" style={{ backgroundColor: color.hex }} />
                <p className="font-mono text-sm">{color.hex}</p>
                <p className="text-xs text-muted-foreground">
                  rgb({color.r}, {color.g}, {color.b}) · {color.percent.toFixed(1)}%
                </p>
                {color.lowContrastBoth ? (
                  <p role="alert" className="text-xs text-amber-600 dark:text-amber-400">
                    Contraste bajo con texto blanco y negro.
                  </p>
                ) : null}
                <CopyButton text={color.hex} label="Copiar HEX" />
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <DownloadButton content={cssExport} filename="paleta-colores.css" label="Descargar CSS" />
            <DownloadButton content={jsonExport} filename="paleta-colores.json" label="Descargar JSON" mimeType="application/json" />
            <Button type="button" variant="outline" size="sm" onClick={downloadPaletteCard}>
              Descargar tarjeta PNG
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
