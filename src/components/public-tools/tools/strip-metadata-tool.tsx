"use client";

import { useState } from "react";
import { ShieldOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import { ResetButton } from "@/components/public-tools/copy-download-actions";
import { formatBytes } from "@/lib/public-tools/files/format";
import { ACCEPTED_IMAGE_MIMES, FILE_LIMITS } from "@/lib/public-tools/files/limits";
import { loadImageFromFile, drawImageToCanvas, canvasToBlob, extensionForFormat, type ExportFormat } from "@/lib/public-tools/files/image-io";
import { detectImageMetadata, type MetadataFinding } from "@/lib/public-tools/images/metadata";
import { downloadBlob } from "@/lib/public-tools/files/download";

export function StripMetadataTool() {
  const [file, setFile] = useState<File | null>(null);
  const [findings, setFindings] = useState<MetadataFinding[] | null>(null);
  const [fullyParsed, setFullyParsed] = useState(false);
  const [outputFormat, setOutputFormat] = useState<ExportFormat>("image/jpeg");
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
  const [verifiedClean, setVerifiedClean] = useState<boolean | null>(null);

  async function handleFileSelected(files: File[]) {
    const candidate = files[0];
    if (!candidate) return;
    setError(null);
    setResultUrl(null);
    setVerifiedClean(null);
    const bytes = new Uint8Array(await candidate.arrayBuffer());
    const detection = detectImageMetadata(bytes, candidate.type);
    setFile(candidate);
    setFindings(detection.findings);
    setFullyParsed(detection.fullyParsed);
    setOutputFormat(candidate.type === "image/png" ? "image/png" : "image/jpeg");
  }

  function reset() {
    setFile(null);
    setFindings(null);
    setError(null);
    setResultUrl(null);
    setResultBytes(null);
    setVerifiedClean(null);
  }

  async function handleClean() {
    if (!file) return;
    setIsProcessing(true);
    setError(null);
    try {
      const loadResult = await loadImageFromFile(file);
      if (!loadResult.ok || !loadResult.loaded) {
        setError(loadResult.error?.message ?? "No se pudo leer esta imagen.");
        return;
      }
      // Redecoding through Canvas is the actual removal mechanism (spec
      // section 18: "redecodificación segura") — a freshly exported
      // PNG/JPEG/WebP blob never carries over the source file's EXIF/XMP/ICC
      // byte segments, because Canvas only ever encodes pixel data.
      const canvas = drawImageToCanvas(loadResult.loaded.image, loadResult.loaded.width, loadResult.loaded.height);
      const blob = await canvasToBlob(canvas, outputFormat, 0.92);
      const cleanedBytes = new Uint8Array(await blob.arrayBuffer());

      const verification = detectImageMetadata(cleanedBytes, outputFormat);
      setVerifiedClean(verification.findings.length === 0);

      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      setResultBytes(cleanedBytes);
    } catch {
      setError("No se pudo procesar la imagen.");
    } finally {
      setIsProcessing(false);
    }
  }

  function download() {
    if (!resultBytes) return;
    downloadBlob(`imagen-sin-metadatos.${extensionForFormat(outputFormat)}`, resultBytes, outputFormat);
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

      {file && findings ? (
        <div className="space-y-4">
          <div aria-live="polite" className="rounded-lg border p-3 text-sm">
            {findings.length === 0 ? (
              <p className="text-muted-foreground">No se detectaron metadatos compatibles en este archivo.</p>
            ) : (
              <>
                <p className="mb-2 font-medium">Metadatos detectados:</p>
                <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                  {findings.map((finding) => (
                    <li key={finding.category}>
                      {finding.label}
                      {finding.detail ? <span className="block text-xs">{finding.detail}</span> : null}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {!fullyParsed ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Para este formato solo se comprueba la presencia de bloques de metadatos conocidos, no un análisis completo byte a byte.
              </p>
            ) : null}
          </div>

          <div className="max-w-xs">
            <Label htmlFor="strip-format" className="mb-1">
              Formato de salida
            </Label>
            <Select value={outputFormat} onValueChange={(v) => setOutputFormat(v as ExportFormat)}>
              <SelectTrigger id="strip-format" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="image/jpeg">JPEG</SelectItem>
                <SelectItem value="image/png">PNG</SelectItem>
                <SelectItem value="image/webp">WebP</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={handleClean} disabled={isProcessing}>
              <ShieldOff className="size-3.5" /> {isProcessing ? "Procesando..." : "Crear copia sin metadatos"}
            </Button>
            <ResetButton onReset={reset} />
          </div>
        </div>
      ) : null}

      {resultUrl ? (
        <div aria-live="polite" className="space-y-2 rounded-lg border bg-muted/30 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={resultUrl} alt="Copia sin metadatos" className="max-h-64 rounded border" />
          <p className="text-sm">
            {verifiedClean
              ? "Se eliminaron los metadatos compatibles detectados y se creó una nueva copia. Se verificó que la copia ya no contiene esos metadatos."
              : "Se eliminaron los metadatos compatibles detectados y se creó una nueva copia."}
          </p>
          <Button type="button" size="sm" onClick={download}>
            Descargar
          </Button>
        </div>
      ) : null}
    </div>
  );
}
