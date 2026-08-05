"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw as RotateLeft, RotateCw, Copy, Trash2, ArrowUp, ArrowDown, LayoutGrid, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import { ResetButton } from "@/components/public-tools/copy-download-actions";
import { formatBytes } from "@/lib/public-tools/files/format";
import { validatePdfFile } from "@/lib/public-tools/files/validation";
import { FILE_LIMITS } from "@/lib/public-tools/files/limits";
import { loadPdfDocument } from "@/lib/public-tools/pdf/load";
import { organizePdf, buildIdentityPlan, type OrganizePageEntry } from "@/lib/public-tools/pdf/organize";
import { downloadBlob } from "@/lib/public-tools/files/download";

interface PlanItem extends OrganizePageEntry {
  key: string;
}

let nextKey = 0;

function toPlanItems(entries: OrganizePageEntry[]): PlanItem[] {
  return entries.map((e) => ({ ...e, key: String(nextKey++) }));
}

export function OrganizePdfTool() {
  const [file, setFile] = useState<File | null>(null);
  const [sourceBytes, setSourceBytes] = useState<Uint8Array | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [plan, setPlan] = useState<PlanItem[]>([]);
  const [history, setHistory] = useState<PlanItem[][]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
  const renderTokenRef = useRef(0);

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
    const bytes = new Uint8Array(await candidate.arrayBuffer());
    const loadResult = await loadPdfDocument(bytes, candidate.name);
    if (!loadResult.ok || !loadResult.pageCount) {
      setError(loadResult.error?.message ?? null);
      return;
    }
    setFile(candidate);
    setSourceBytes(bytes);
    setPageCount(loadResult.pageCount);
    const identity = toPlanItems(buildIdentityPlan(loadResult.pageCount));
    setPlan(identity);
    setHistory([]);
    setThumbnails(new Map());
  }

  // Progressive thumbnail rendering, capped at FILE_LIMITS.pdf.maxPagesRenderedAtOnce concurrent renders (spec section 12).
  useEffect(() => {
    if (!sourceBytes || !pageCount) return;
    const token = ++renderTokenRef.current;
    let cancelled = false;

    async function renderThumbnails() {
      const { loadPdfForRendering, renderPdfPageToCanvas } = await import("@/lib/public-tools/pdf/render");
      const renderResult = await loadPdfForRendering(sourceBytes!);
      if (!renderResult.ok || !renderResult.document || cancelled || renderTokenRef.current !== token) return;

      const concurrency = FILE_LIMITS.pdf.maxPagesRenderedAtOnce;
      const indices = Array.from({ length: pageCount! }, (_, i) => i);

      for (let start = 0; start < indices.length; start += concurrency) {
        if (cancelled || renderTokenRef.current !== token) return;
        const batch = indices.slice(start, start + concurrency);
        await Promise.all(
          batch.map(async (index) => {
            const canvas = document.createElement("canvas");
            try {
              await renderPdfPageToCanvas(renderResult.document!, index + 1, 0.3, canvas);
              if (cancelled || renderTokenRef.current !== token) return;
              const dataUrl = canvas.toDataURL("image/png");
              setThumbnails((prev) => new Map(prev).set(index, dataUrl));
            } catch {
              // A single page failing to render as a thumbnail shouldn't block the others — the final export still uses the real page data via pdf-lib.
            }
          })
        );
      }
    }

    void renderThumbnails();
    return () => {
      cancelled = true;
    };
  }, [sourceBytes, pageCount]);

  function pushHistory() {
    setHistory((prev) => [...prev, plan]);
  }

  function reset() {
    setFile(null);
    setSourceBytes(null);
    setPageCount(null);
    setPlan([]);
    setHistory([]);
    setSelected(new Set());
    setThumbnails(new Map());
    setError(null);
    setResultBytes(null);
    renderTokenRef.current++;
  }

  function undo() {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setPlan(last);
      return prev.slice(0, -1);
    });
  }

  function moveItem(key: string, direction: -1 | 1) {
    pushHistory();
    setPlan((prev) => {
      const index = prev.findIndex((p) => p.key === key);
      const targetIndex = index + direction;
      if (index === -1 || targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  }

  function rotateItem(key: string, delta: number) {
    pushHistory();
    setPlan((prev) => prev.map((p) => (p.key === key ? { ...p, rotationDelta: ((p.rotationDelta + delta) % 360 + 360) % 360 } : p)));
  }

  function duplicateItem(key: string) {
    pushHistory();
    setPlan((prev) => {
      const index = prev.findIndex((p) => p.key === key);
      if (index === -1) return prev;
      const copy: PlanItem = { ...prev[index], key: String(nextKey++) };
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
  }

  function deleteItem(key: string) {
    pushHistory();
    setPlan((prev) => prev.filter((p) => p.key !== key));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  function toggleSelected(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function bulkDeleteSelected() {
    if (selected.size === 0) return;
    pushHistory();
    setPlan((prev) => prev.filter((p) => !selected.has(p.key)));
    setSelected(new Set());
  }

  function bulkRotateSelected(delta: number) {
    if (selected.size === 0) return;
    pushHistory();
    setPlan((prev) => prev.map((p) => (selected.has(p.key) ? { ...p, rotationDelta: ((p.rotationDelta + delta) % 360 + 360) % 360 } : p)));
  }

  async function handleExport() {
    if (!sourceBytes || plan.length === 0) return;
    setIsProcessing(true);
    setError(null);
    try {
      const result = await organizePdf(sourceBytes, plan.map(({ originalIndex, rotationDelta }) => ({ originalIndex, rotationDelta })));
      if (!result.ok || !result.bytes) {
        setError(result.error?.message ?? "No se pudo generar el PDF organizado.");
        return;
      }
      setResultBytes(result.bytes);
    } catch {
      setError("No se pudo generar el PDF organizado.");
    } finally {
      setIsProcessing(false);
    }
  }

  function download() {
    if (!resultBytes) return;
    downloadBlob("documento-organizado.pdf", resultBytes, "application/pdf");
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

      {plan.length > 0 ? (
        <>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={undo} disabled={history.length === 0}>
              Deshacer
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={selected.size === 0} onClick={() => bulkRotateSelected(90)}>
              Rotar seleccionadas 90°
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={selected.size === 0} onClick={bulkDeleteSelected}>
              Eliminar seleccionadas
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {plan.map((item, index) => (
              <div key={item.key} className="space-y-2 rounded-lg border p-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Checkbox
                      checked={selected.has(item.key)}
                      onCheckedChange={() => toggleSelected(item.key)}
                      aria-label={`Seleccionar página ${index + 1}`}
                    />
                    <span className="text-xs text-muted-foreground">#{index + 1}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">pág. original {item.originalIndex + 1}</span>
                </div>
                <div
                  className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded border bg-muted/30"
                  style={{ transform: `rotate(${item.rotationDelta}deg)` }}
                >
                  {thumbnails.has(item.originalIndex) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbnails.get(item.originalIndex)} alt={`Miniatura de la página ${item.originalIndex + 1}`} className="max-h-full max-w-full" />
                  ) : (
                    <span className="text-xs text-muted-foreground">Cargando…</span>
                  )}
                </div>
                <div className="flex flex-wrap justify-center gap-1">
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Rotar a la izquierda" onClick={() => rotateItem(item.key, -90)}>
                    <RotateLeft className="size-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Rotar a la derecha" onClick={() => rotateItem(item.key, 90)}>
                    <RotateCw className="size-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Duplicar página" onClick={() => duplicateItem(item.key)}>
                    <Copy className="size-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Eliminar página" onClick={() => deleteItem(item.key)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Mover antes" disabled={index === 0} onClick={() => moveItem(item.key, -1)}>
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Mover después"
                    disabled={index === plan.length - 1}
                    onClick={() => moveItem(item.key, 1)}
                  >
                    <ArrowDown className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={handleExport} disabled={isProcessing || plan.length === 0}>
              <LayoutGrid className="size-3.5" /> {isProcessing ? "Generando..." : "Generar PDF organizado"}
            </Button>
            <ResetButton onReset={reset} />
          </div>
        </>
      ) : null}

      {resultBytes ? (
        <div aria-live="polite" className="space-y-2 rounded-lg border bg-muted/30 p-4">
          <p className="text-sm">PDF organizado listo ({plan.length} páginas).</p>
          <Button type="button" size="sm" onClick={download}>
            Descargar documento-organizado.pdf
          </Button>
        </div>
      ) : null}
    </div>
  );
}
