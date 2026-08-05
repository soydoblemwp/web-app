"use client";

import { useState } from "react";
import { SplitSquareVertical, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import { ResetButton } from "@/components/public-tools/copy-download-actions";
import { formatBytes } from "@/lib/public-tools/files/format";
import { validatePdfFile } from "@/lib/public-tools/files/validation";
import { FILE_LIMITS } from "@/lib/public-tools/files/limits";
import { loadPdfDocument } from "@/lib/public-tools/pdf/load";
import { splitPdf, type SplitMode, type SplitOutputFile } from "@/lib/public-tools/pdf/split";
import { downloadBlob } from "@/lib/public-tools/files/download";
import { buildZip } from "@/lib/public-tools/files/zip";

const MODE_LABELS: { id: SplitMode; label: string }[] = [
  { id: "range", label: "Extraer páginas (rango o individuales)" },
  { id: "each-page", label: "Dividir cada página" },
  { id: "every-n-pages", label: "Dividir cada N páginas" },
  { id: "multiple-ranges", label: "Varios rangos a la vez" },
  { id: "remove-pages", label: "Eliminar páginas y conservar el resto" },
];

export function SplitPdfTool() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<SplitMode>("range");
  const [rangeInput, setRangeInput] = useState("");
  const [n, setN] = useState(2);
  const [multipleRanges, setMultipleRanges] = useState<string[]>([""]);
  const [keepDuplicates, setKeepDuplicates] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<SplitOutputFile[] | null>(null);
  const [duplicatesRemoved, setDuplicatesRemoved] = useState(0);

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
    const bytes = new Uint8Array(await candidate.arrayBuffer());
    const loadResult = await loadPdfDocument(bytes, candidate.name);
    if (!loadResult.ok) {
      setError(loadResult.error?.message ?? null);
      return;
    }
    setFile(candidate);
    setPageCount(loadResult.pageCount ?? null);
  }

  function reset() {
    setFile(null);
    setPageCount(null);
    setError(null);
    setResults(null);
    setRangeInput("");
    setMultipleRanges([""]);
  }

  async function handleSplit() {
    if (!file) return;
    setIsProcessing(true);
    setError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await splitPdf(bytes, {
        mode,
        rangeInput,
        n,
        multipleRanges: multipleRanges.filter((r) => r.trim()),
        keepDuplicates,
      });
      if (!result.ok || !result.files) {
        setError(result.error?.message ?? "No se pudo dividir el PDF.");
        return;
      }
      setResults(result.files);
      setDuplicatesRemoved(result.duplicatesRemoved ?? 0);
    } catch {
      setError("No se pudo dividir el PDF. Comprueba el rango indicado.");
    } finally {
      setIsProcessing(false);
    }
  }

  function downloadOne(item: SplitOutputFile) {
    downloadBlob(item.name, item.bytes, "application/pdf");
  }

  function downloadAllAsZip() {
    if (!results) return;
    const zipResult = buildZip(results.map((r) => ({ name: r.name, data: r.bytes })));
    if (!zipResult.ok || !zipResult.bytes) {
      setError(zipResult.error?.message ?? "No se pudo crear el ZIP.");
      return;
    }
    downloadBlob("documentos-divididos.zip", zipResult.bytes, "application/zip");
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
          <div role="group" aria-label="Modo de división" className="flex flex-wrap gap-2">
            {MODE_LABELS.map((m) => (
              <Button key={m.id} type="button" size="sm" variant={mode === m.id ? "default" : "outline"} aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>
                {m.label}
              </Button>
            ))}
          </div>

          {(mode === "range" || mode === "remove-pages") ? (
            <div>
              <Label htmlFor="split-range" className="mb-1">
                Rango de páginas (documento de {pageCount} páginas)
              </Label>
              <Input id="split-range" value={rangeInput} onChange={(e) => setRangeInput(e.target.value)} placeholder="1-3,7,10-12" />
            </div>
          ) : null}

          {mode === "range" ? (
            <div className="flex items-center gap-2">
              <Checkbox id="keep-duplicates" checked={keepDuplicates} onCheckedChange={() => setKeepDuplicates((v) => !v)} />
              <Label htmlFor="keep-duplicates" className="text-sm font-normal">
                Conservar páginas repetidas si el rango las incluye más de una vez
              </Label>
            </div>
          ) : null}

          {mode === "every-n-pages" ? (
            <div className="max-w-xs">
              <Label htmlFor="split-n" className="mb-1">
                Dividir cada
              </Label>
              <Input id="split-n" type="number" min={1} max={pageCount} value={n} onChange={(e) => setN(Number(e.target.value) || 1)} />
            </div>
          ) : null}

          {mode === "multiple-ranges" ? (
            <div className="space-y-2">
              <Label className="mb-1">Rangos (uno por línea)</Label>
              {multipleRanges.map((range, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={range}
                    onChange={(e) => setMultipleRanges((prev) => prev.map((r, i) => (i === index ? e.target.value : r)))}
                    placeholder={`Rango ${index + 1}, ej. 1-3`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Eliminar rango"
                    onClick={() => setMultipleRanges((prev) => prev.filter((_, i) => i !== index))}
                    disabled={multipleRanges.length === 1}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setMultipleRanges((prev) => [...prev, ""])}>
                <Plus className="size-3.5" /> Añadir rango
              </Button>
            </div>
          ) : null}

          <Button type="button" onClick={handleSplit} disabled={isProcessing}>
            <SplitSquareVertical className="size-3.5" /> {isProcessing ? "Dividiendo..." : "Dividir PDF"}
          </Button>
        </div>
      ) : null}

      <ResetButton onReset={reset} />

      {results ? (
        <div aria-live="polite" className="space-y-2 rounded-lg border bg-muted/30 p-4">
          <p className="text-sm">
            {results.length} archivo{results.length === 1 ? "" : "s"} generado{results.length === 1 ? "" : "s"}.
            {duplicatesRemoved > 0 ? ` Se ignoraron ${duplicatesRemoved} páginas duplicadas.` : ""}
          </p>
          <ul className="space-y-1">
            {results.map((item) => (
              <li key={item.name} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                <span className="text-xs text-muted-foreground">{item.pageCount} pág.</span>
                <Button type="button" variant="outline" size="sm" onClick={() => downloadOne(item)}>
                  Descargar
                </Button>
              </li>
            ))}
          </ul>
          {results.length > 1 ? (
            <Button type="button" size="sm" onClick={downloadAllAsZip}>
              Descargar todos (ZIP)
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
