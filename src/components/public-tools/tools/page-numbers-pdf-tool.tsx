"use client";

import { useState } from "react";
import { ListOrdered, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import { ResetButton } from "@/components/public-tools/copy-download-actions";
import { formatBytes } from "@/lib/public-tools/files/format";
import { validatePdfFile } from "@/lib/public-tools/files/validation";
import { FILE_LIMITS } from "@/lib/public-tools/files/limits";
import { loadPdfDocument } from "@/lib/public-tools/pdf/load";
import { applyPageNumbers, type PageNumberFormat, type PageNumberPosition } from "@/lib/public-tools/pdf/page-numbers";
import { downloadBlob } from "@/lib/public-tools/files/download";

const FORMATS: { id: PageNumberFormat; label: string; example: string }[] = [
  { id: "number", label: "1", example: "1" },
  { id: "pagina-number", label: "Página 1", example: "Página 1" },
  { id: "number-de-total", label: "1 de 10", example: "1 de 10" },
  { id: "pagina-number-de-total", label: "Página 1 de 10", example: "Página 1 de 10" },
];

const POSITIONS: { id: PageNumberPosition; label: string }[] = [
  { id: "bottom-center", label: "Abajo centro" },
  { id: "bottom-left", label: "Abajo izquierda" },
  { id: "bottom-right", label: "Abajo derecha" },
  { id: "top-center", label: "Arriba centro" },
  { id: "top-left", label: "Arriba izquierda" },
  { id: "top-right", label: "Arriba derecha" },
];

export function PageNumbersPdfTool() {
  const [file, setFile] = useState<File | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [position, setPosition] = useState<PageNumberPosition>("bottom-center");
  const [startNumber, setStartNumber] = useState(1);
  const [prefix, setPrefix] = useState("");
  const [suffix, setSuffix] = useState("");
  const [format, setFormat] = useState<PageNumberFormat>("number");
  const [fontSize, setFontSize] = useState(11);
  const [excludeCover, setExcludeCover] = useState(false);
  const [excludeLastPage, setExcludeLastPage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);

  async function handleFileSelected(files: File[]) {
    const candidate = files[0];
    if (!candidate) return;
    setError(null);
    setResultBytes(null);
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
    setError(null);
    setResultBytes(null);
  }

  async function handleApply() {
    if (!bytes) return;
    setIsProcessing(true);
    setError(null);
    try {
      const result = await applyPageNumbers(bytes, {
        position,
        startNumber,
        prefix: prefix || undefined,
        suffix: suffix || undefined,
        format,
        fontSize,
        color: { r: 0, g: 0, b: 0 },
        marginPt: 24,
        excludeCover,
        excludeLastPage,
      });
      if (!result.ok || !result.bytes) {
        setError(result.error?.message ?? "No se pudo numerar el PDF.");
        return;
      }
      setResultBytes(result.bytes);
    } catch {
      setError("No se pudo numerar el PDF.");
    } finally {
      setIsProcessing(false);
    }
  }

  function download() {
    if (!resultBytes) return;
    downloadBlob("documento-numerado.pdf", resultBytes, "application/pdf");
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
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <Label htmlFor="page-number-format" className="mb-1">
                Formato
              </Label>
              <Select value={format} onValueChange={(v) => setFormat(v as PageNumberFormat)}>
                <SelectTrigger id="page-number-format" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORMATS.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.example}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="page-number-position" className="mb-1">
                Posición
              </Label>
              <Select value={position} onValueChange={(v) => setPosition(v as PageNumberPosition)}>
                <SelectTrigger id="page-number-position" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POSITIONS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="page-number-start" className="mb-1">
                Número inicial
              </Label>
              <Input id="page-number-start" type="number" min={0} value={startNumber} onChange={(e) => setStartNumber(Number(e.target.value) || 0)} />
            </div>
            <div>
              <Label htmlFor="page-number-size" className="mb-1">
                Tamaño
              </Label>
              <Input id="page-number-size" type="number" min={6} max={48} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value) || 11)} />
            </div>
            <div>
              <Label htmlFor="page-number-prefix" className="mb-1">
                Prefijo (opcional)
              </Label>
              <Input id="page-number-prefix" value={prefix} onChange={(e) => setPrefix(e.target.value)} maxLength={20} />
            </div>
            <div>
              <Label htmlFor="page-number-suffix" className="mb-1">
                Sufijo (opcional)
              </Label>
              <Input id="page-number-suffix" value={suffix} onChange={(e) => setSuffix(e.target.value)} maxLength={20} />
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <Checkbox id="exclude-cover" checked={excludeCover} onCheckedChange={() => setExcludeCover((v) => !v)} />
              <Label htmlFor="exclude-cover" className="text-sm font-normal">
                Excluir portada
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="exclude-last" checked={excludeLastPage} onCheckedChange={() => setExcludeLastPage((v) => !v)} />
              <Label htmlFor="exclude-last" className="text-sm font-normal">
                Excluir última página
              </Label>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={handleApply} disabled={isProcessing}>
              <ListOrdered className="size-3.5" /> {isProcessing ? "Numerando..." : "Numerar páginas"}
            </Button>
            <ResetButton onReset={reset} />
          </div>
        </div>
      ) : null}

      {resultBytes ? (
        <div aria-live="polite" className="space-y-2 rounded-lg border bg-muted/30 p-4">
          <p className="text-sm">PDF numerado correctamente.</p>
          <Button type="button" size="sm" onClick={download}>
            Descargar documento-numerado.pdf
          </Button>
        </div>
      ) : null}
    </div>
  );
}
