"use client";

import { useState } from "react";
import { Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import { CopyButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { formatBytes } from "@/lib/public-tools/files/format";
import { ACCEPTED_IMAGE_MIMES, FILE_LIMITS } from "@/lib/public-tools/files/limits";
import { loadImageFromFile } from "@/lib/public-tools/files/image-io";
import { downloadBlob } from "@/lib/public-tools/files/download";
import { buildZip } from "@/lib/public-tools/files/zip";

export function FaviconTool() {
  const [file, setFile] = useState<File | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [background, setBackground] = useState<"transparent" | "solid">("transparent");
  const [backgroundColor, setBackgroundColor] = useState("#ffffff");
  const [fit, setFit] = useState<"contain" | "cover">("contain");
  const [marginPercent, setMarginPercent] = useState(8);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [htmlSnippet, setHtmlSnippet] = useState<string | null>(null);
  const [zipBytes, setZipBytes] = useState<Uint8Array | null>(null);

  async function handleFileSelected(files: File[]) {
    const candidate = files[0];
    if (!candidate) return;
    setError(null);
    setPreviewUrl(null);
    setZipBytes(null);
    const result = await loadImageFromFile(candidate);
    if (!result.ok || !result.loaded) {
      setError(result.error?.message ?? "No se pudo leer esta imagen.");
      return;
    }
    setFile(candidate);
    setImage(result.loaded.image);
    setImageUrl(result.loaded.url);
  }

  function reset() {
    setFile(null);
    setImage(null);
    setImageUrl(null);
    setError(null);
    setPreviewUrl(null);
    setHtmlSnippet(null);
    setZipBytes(null);
  }

  async function handleGenerate() {
    if (!image) return;
    setIsProcessing(true);
    setError(null);
    try {
      const { generateFaviconPackage } = await import("@/lib/public-tools/images/favicon");
      const result = await generateFaviconPackage(image, { background, backgroundColor, fit, marginPercent });
      if (!result.ok || !result.assets) {
        setError(result.error ?? "No se pudo generar el favicon.");
        return;
      }
      const iconAsset = result.assets.find((a) => a.filename === "icon-192.png");
      if (iconAsset) {
        const blob = new Blob([new Uint8Array(iconAsset.bytes)], { type: iconAsset.mimeType });
        setPreviewUrl(URL.createObjectURL(blob));
      }
      setHtmlSnippet(result.htmlSnippet ?? null);

      const zipResult = buildZip(result.assets.map((a) => ({ name: a.filename, data: a.bytes })));
      if (!zipResult.ok || !zipResult.bytes) {
        setError(zipResult.error?.message ?? "No se pudo crear el ZIP.");
        return;
      }
      setZipBytes(zipResult.bytes);
    } catch {
      setError("No se pudo generar el paquete de favicons.");
    } finally {
      setIsProcessing(false);
    }
  }

  function downloadZip() {
    if (!zipBytes) return;
    downloadBlob("favicon-package.zip", zipBytes, "application/zip");
  }

  return (
    <div className="space-y-4">
      {!file ? (
        <FileUploadZone
          accept={ACCEPTED_IMAGE_MIMES.join(",")}
          onFilesSelected={(files) => void handleFileSelected(files)}
          label="Arrastra tu logo o imagen aquí, o"
          hint={`hasta ${Math.round(FILE_LIMITS.image.maxFileBytes / (1024 * 1024))} MB — recomendado: imagen cuadrada`}
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

      {file && imageUrl ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col items-center gap-2 rounded-lg border bg-white p-6">
              <p className="text-xs text-muted-foreground">Vista previa clara</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl ?? imageUrl} alt="Vista previa en fondo claro" className="size-16" />
            </div>
            <div className="flex flex-col items-center gap-2 rounded-lg border bg-zinc-900 p-6">
              <p className="text-xs text-zinc-400">Vista previa oscura</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl ?? imageUrl} alt="Vista previa en fondo oscuro" className="size-16" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <Label htmlFor="favicon-background" className="mb-1">
                Fondo
              </Label>
              <Select value={background} onValueChange={(v) => setBackground(v as "transparent" | "solid")}>
                <SelectTrigger id="favicon-background" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="transparent">Transparente</SelectItem>
                  <SelectItem value="solid">Sólido</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {background === "solid" ? (
              <div>
                <Label htmlFor="favicon-bg-color" className="mb-1">
                  Color de fondo
                </Label>
                <Input id="favicon-bg-color" type="color" value={backgroundColor} onChange={(e) => setBackgroundColor(e.target.value)} className="h-9" />
              </div>
            ) : null}
            <div>
              <Label htmlFor="favicon-fit" className="mb-1">
                Ajuste
              </Label>
              <Select value={fit} onValueChange={(v) => setFit(v as "contain" | "cover")}>
                <SelectTrigger id="favicon-fit" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contain">Contener</SelectItem>
                  <SelectItem value="cover">Cubrir</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="favicon-margin" className="mb-1">
                Margen ({marginPercent}%)
              </Label>
              <input id="favicon-margin" type="range" min={0} max={30} value={marginPercent} onChange={(e) => setMarginPercent(Number(e.target.value))} className="w-full" />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={handleGenerate} disabled={isProcessing}>
              <Star className="size-3.5" /> {isProcessing ? "Generando..." : "Generar favicons"}
            </Button>
            <ResetButton onReset={reset} />
          </div>
        </div>
      ) : null}

      {zipBytes ? (
        <div aria-live="polite" className="space-y-2 rounded-lg border bg-muted/30 p-4">
          <p className="text-sm">Paquete generado: favicon.ico real, PNGs, apple-touch-icon, site.webmanifest y snippet HTML.</p>
          {htmlSnippet ? <pre className="overflow-x-auto rounded bg-muted p-2 text-xs">{htmlSnippet}</pre> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={downloadZip}>
              Descargar favicon-package.zip
            </Button>
            {htmlSnippet ? <CopyButton text={htmlSnippet} label="Copiar HTML" /> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
