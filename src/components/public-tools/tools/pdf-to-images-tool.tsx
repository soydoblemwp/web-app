"use client";

import { useRef, useState } from "react";
import { Images, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import { ResetButton } from "@/components/public-tools/copy-download-actions";
import { ProcessingProgress } from "@/components/public-tools/processing-progress";
import { formatBytes } from "@/lib/public-tools/files/format";
import { validatePdfFile } from "@/lib/public-tools/files/validation";
import { FILE_LIMITS } from "@/lib/public-tools/files/limits";
import { loadPdfDocument } from "@/lib/public-tools/pdf/load";
import { parsePageRange } from "@/lib/public-tools/pdf/ranges";
import { buildPaddedFilename } from "@/lib/public-tools/files/filenames";
import { downloadBlob } from "@/lib/public-tools/files/download";
import { buildZip } from "@/lib/public-tools/files/zip";
import { CancellationToken } from "@/lib/public-tools/files/progress";

type OutputFormat = "image/png" | "image/jpeg" | "image/webp";

interface RenderedImage {
  name: string;
  bytes: Uint8Array;
}

export function PdfToImagesTool() {
  const [file, setFile] = useState<File | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [rangeInput, setRangeInput] = useState("");
  const [format, setFormat] = useState<OutputFormat>("image/png");
  const [scale, setScale] = useState(1.5);
  const [quality, setQuality] = useState(0.85);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [results, setResults] = useState<RenderedImage[] | null>(null);
  const tokenRef = useRef(new CancellationToken());

  async function handleFileSelected(files: File[]) {
    const candidate = files[0];
    if (!candidate) return;
    setError(null);
    setResults(null);
    const typeCheck = validatePdfFile(candidate);
    if (!typeCheck.ok) {
      setError(typeCheck.error?.message ?? null);
      return;
    }
    const fileBytes = new Uint8Array(await candidate.arrayBuffer());
    const loadResult = await loadPdfDocument(fileBytes, candidate.name);
    if (!loadResult.ok || !loadResult.pageCount) {
      setError(loadResult.error?.message ?? null);
      return;
    }
    setFile(candidate);
    setBytes(fileBytes);
    setPageCount(loadResult.pageCount);
  }

  function reset() {
    setFile(null);
    setBytes(null);
    setPageCount(null);
    setRangeInput("");
    setError(null);
    setProgress(null);
    setResults(null);
    tokenRef.current.cancel();
    tokenRef.current = new CancellationToken();
  }

  function cancel() {
    tokenRef.current.cancel();
  }

  const extension = format === "image/png" ? "png" : format === "image/jpeg" ? "jpg" : "webp";

  async function handleConvert() {
    if (!bytes || !pageCount) return;
    setError(null);
    setResults(null);
    const token = new CancellationToken();
    tokenRef.current = token;

    const indices = rangeInput.trim()
      ? parsePageRange(rangeInput, pageCount)
      : { ok: true as const, indices: Array.from({ length: pageCount }, (_, i) => i) };
    if (!indices.ok || !indices.indices) {
      setError(indices.error ?? "Rango no válido.");
      return;
    }

    try {
      const { loadPdfForRendering, renderPdfPageToCanvas } = await import("@/lib/public-tools/pdf/render");
      const renderResult = await loadPdfForRendering(bytes);
      if (!renderResult.ok || !renderResult.document) {
        setError(renderResult.error?.message ?? "No se pudo abrir el PDF para renderizar.");
        return;
      }

      const total = indices.indices.length;
      const rendered: RenderedImage[] = [];
      setProgress({ current: 0, total });

      for (let i = 0; i < total; i++) {
        if (token.cancelled) {
          setProgress(null);
          setError("Conversión cancelada.");
          return;
        }
        const pageIndex = indices.indices[i];
        const canvas = document.createElement("canvas");
        await renderPdfPageToCanvas(renderResult.document, pageIndex + 1, scale, canvas);
        const blob: Blob = await new Promise((resolve, reject) =>
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no-blob"))), format, format === "image/png" ? undefined : quality)
        );
        const pageBytes = new Uint8Array(await blob.arrayBuffer());
        rendered.push({ name: buildPaddedFilename("pagina", i + 1, total, extension), bytes: pageBytes });
        setProgress({ current: i + 1, total });
      }

      setResults(rendered);
      setProgress(null);
    } catch {
      setError("No se pudieron renderizar las páginas del PDF.");
      setProgress(null);
    }
  }

  function downloadOne(item: RenderedImage) {
    downloadBlob(item.name, item.bytes, format);
  }

  function downloadAllAsZip() {
    if (!results) return;
    const zipResult = buildZip(results.map((r) => ({ name: r.name, data: r.bytes })));
    if (!zipResult.ok || !zipResult.bytes) {
      setError(zipResult.error?.message ?? "No se pudo crear el ZIP.");
      return;
    }
    downloadBlob("paginas-pdf.zip", zipResult.bytes, "application/zip");
  }

  return (
    <div className="space-y-4">
      {!file ? (
        <FileUploadZone
          accept="application/pdf"
          onFilesSelected={(files) => void handleFileSelected(files)}
          label="Arrastra tu PDF aquí, o"
          hint={`hasta ${Math.round(FILE_LIMITS.pdf.maxFileBytes / (1024 * 1024))} MB`}
        />
      ) : (
        <div className="flex items-center gap-2 text-sm">
          <span className="truncate">{file.name}</span>
          <span className="text-muted-foreground">
            ({formatBytes(file.size)} · {pageCount} páginas)
          </span>
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

      {file && pageCount ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <Label htmlFor="pdf-range" className="mb-1">
              Rango (vacío = todas)
            </Label>
            <Input id="pdf-range" value={rangeInput} onChange={(e) => setRangeInput(e.target.value)} placeholder="1-3,7" />
          </div>
          <div>
            <Label htmlFor="pdf-format" className="mb-1">
              Formato
            </Label>
            <Select value={format} onValueChange={(v) => setFormat(v as OutputFormat)}>
              <SelectTrigger id="pdf-format" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="image/png">PNG</SelectItem>
                <SelectItem value="image/jpeg">JPEG</SelectItem>
                <SelectItem value="image/webp">WebP</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="pdf-scale" className="mb-1">
              Escala ({scale.toFixed(1)}×)
            </Label>
            <input id="pdf-scale" type="range" min={0.5} max={4} step={0.1} value={scale} onChange={(e) => setScale(Number(e.target.value))} className="w-full" />
          </div>
          {format !== "image/png" ? (
            <div>
              <Label htmlFor="pdf-quality" className="mb-1">
                Calidad ({Math.round(quality * 100)}%)
              </Label>
              <input id="pdf-quality" type="range" min={0.1} max={1} step={0.05} value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="w-full" />
            </div>
          ) : null}
        </div>
      ) : null}

      {progress ? <ProcessingProgress step="Convirtiendo página" current={progress.current} total={progress.total} onCancel={cancel} /> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={handleConvert} disabled={!file || !!progress}>
          <Images className="size-3.5" /> Convertir a imágenes
        </Button>
        <ResetButton onReset={reset} />
      </div>

      {results ? (
        <div aria-live="polite" className="space-y-2 rounded-lg border bg-muted/30 p-4">
          <p className="text-sm">{results.length} página(s) convertida(s).</p>
          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {results.map((item) => (
              <li key={item.name} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                <Button type="button" variant="outline" size="sm" onClick={() => downloadOne(item)}>
                  Descargar
                </Button>
              </li>
            ))}
          </ul>
          {results.length > 1 ? (
            <Button type="button" size="sm" onClick={downloadAllAsZip}>
              Descargar todas (ZIP)
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
