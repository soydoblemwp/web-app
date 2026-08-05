"use client";

import { useState } from "react";
import { ArrowUp, ArrowDown, X, Combine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import { CopyButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { formatBytes } from "@/lib/public-tools/files/format";
import { validatePdfFile, validateFileCount } from "@/lib/public-tools/files/validation";
import { FILE_LIMITS } from "@/lib/public-tools/files/limits";
import { loadPdfDocument } from "@/lib/public-tools/pdf/load";
import { mergePdfs } from "@/lib/public-tools/pdf/merge";
import { downloadBlob } from "@/lib/public-tools/files/download";
import { ObjectUrlRegistry } from "@/lib/public-tools/files/object-url";

interface QueuedFile {
  id: string;
  file: File;
  status: "checking" | "ready" | "error";
  error?: string;
  pageCount?: number;
}

let nextId = 0;

export function MergePdfTool() {
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
  const [resultPageCount, setResultPageCount] = useState<number | null>(null);
  const urlsRef = useState(() => new ObjectUrlRegistry())[0];

  async function addFiles(files: File[]) {
    setMergeError(null);
    setResultUrl(null);
    const countCheck = validateFileCount(queue.length + files.length, FILE_LIMITS.pdf.maxFilesToMerge);
    if (!countCheck.ok) {
      setMergeError(countCheck.error?.message ?? null);
      return;
    }

    const entries: QueuedFile[] = files.map((file) => ({ id: String(nextId++), file, status: "checking" }));
    setQueue((prev) => [...prev, ...entries]);

    for (const entry of entries) {
      const typeCheck = validatePdfFile(entry.file);
      if (!typeCheck.ok) {
        setQueue((prev) => prev.map((q) => (q.id === entry.id ? { ...q, status: "error", error: typeCheck.error?.message } : q)));
        continue;
      }
      const bytes = new Uint8Array(await entry.file.arrayBuffer());
      const loadResult = await loadPdfDocument(bytes, entry.file.name);
      setQueue((prev) =>
        prev.map((q) =>
          q.id === entry.id
            ? loadResult.ok
              ? { ...q, status: "ready", pageCount: loadResult.pageCount }
              : { ...q, status: "error", error: loadResult.error?.message }
            : q
        )
      );
    }
  }

  function removeFile(id: string) {
    setQueue((prev) => prev.filter((q) => q.id !== id));
  }

  function moveFile(id: string, direction: -1 | 1) {
    setQueue((prev) => {
      const index = prev.findIndex((q) => q.id === id);
      const targetIndex = index + direction;
      if (index === -1 || targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  }

  function reset() {
    urlsRef.revokeAll();
    setQueue([]);
    setMergeError(null);
    setResultUrl(null);
    setResultBytes(null);
    setResultPageCount(null);
  }

  const readyFiles = queue.filter((q) => q.status === "ready");
  const canMerge = readyFiles.length >= 2 && queue.every((q) => q.status !== "checking");

  async function handleMerge() {
    setIsMerging(true);
    setMergeError(null);
    try {
      const inputs = await Promise.all(
        readyFiles.map(async (entry) => ({ name: entry.file.name, bytes: new Uint8Array(await entry.file.arrayBuffer()) }))
      );
      const result = await mergePdfs(inputs);
      if (!result.ok || !result.bytes) {
        setMergeError(result.error?.message ?? "No se pudo unir el PDF.");
        return;
      }
      urlsRef.revoke(resultUrl);
      const url = urlsRef.create(new Blob([new Uint8Array(result.bytes)], { type: "application/pdf" }));
      setResultUrl(url);
      setResultBytes(result.bytes);
      setResultPageCount(result.totalPages ?? null);
    } catch {
      setMergeError("No se pudo unir el PDF. Comprueba que los archivos sean válidos.");
    } finally {
      setIsMerging(false);
    }
  }

  function download() {
    if (!resultBytes) return;
    downloadBlob("documento-unido.pdf", resultBytes, "application/pdf");
  }

  return (
    <div className="space-y-4">
      <FileUploadZone
        accept="application/pdf"
        multiple
        onFilesSelected={(files) => void addFiles(files)}
        label="Arrastra tus PDF aquí, o"
        hint={`hasta ${FILE_LIMITS.pdf.maxFilesToMerge} archivos, ${Math.round(FILE_LIMITS.pdf.maxFileBytes / (1024 * 1024))} MB por archivo`}
      />

      {mergeError ? (
        <p role="alert" className="text-sm text-destructive">
          {mergeError}
        </p>
      ) : null}

      {queue.length > 0 ? (
        <ul className="space-y-2">
          {queue.map((entry, index) => (
            <li key={entry.id} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
              <span className="w-6 text-center text-xs text-muted-foreground">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate">{entry.file.name}</span>
              <span className="text-xs text-muted-foreground">{formatBytes(entry.file.size)}</span>
              {entry.status === "checking" ? <span className="text-xs text-muted-foreground">Comprobando…</span> : null}
              {entry.status === "ready" ? <span className="text-xs text-muted-foreground">{entry.pageCount} pág.</span> : null}
              {entry.status === "error" ? (
                <span role="alert" className="text-xs text-destructive">
                  {entry.error}
                </span>
              ) : null}
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Subir en la lista" disabled={index === 0} onClick={() => moveFile(entry.id, -1)}>
                <ArrowUp className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Bajar en la lista"
                disabled={index === queue.length - 1}
                onClick={() => moveFile(entry.id, 1)}
              >
                <ArrowDown className="size-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Eliminar ${entry.file.name}`} onClick={() => removeFile(entry.id)}>
                <X className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={handleMerge} disabled={!canMerge || isMerging}>
          <Combine className="size-3.5" /> {isMerging ? "Uniendo..." : "Unir PDF"}
        </Button>
        <ResetButton onReset={reset} />
      </div>

      {resultUrl && resultBytes ? (
        <div aria-live="polite" className="space-y-2 rounded-lg border bg-muted/30 p-4">
          <p className="text-sm">
            PDF unido correctamente: {resultPageCount} páginas, {formatBytes(resultBytes.byteLength)}.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={download}>
              Descargar documento-unido.pdf
            </Button>
            <CopyButton text="documento-unido.pdf" label="Copiar nombre" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
