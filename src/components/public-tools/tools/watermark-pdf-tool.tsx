"use client";

import { useState } from "react";
import { Stamp, X } from "lucide-react";
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
import { applyWatermark, WATERMARK_PRESETS, type WatermarkPosition } from "@/lib/public-tools/pdf/watermark";
import { parsePageRange } from "@/lib/public-tools/pdf/ranges";
import { downloadBlob } from "@/lib/public-tools/files/download";

const POSITIONS: { id: WatermarkPosition; label: string }[] = [
  { id: "center", label: "Centro" },
  { id: "diagonal", label: "Diagonal" },
  { id: "top-left", label: "Arriba izquierda" },
  { id: "top-right", label: "Arriba derecha" },
  { id: "bottom-left", label: "Abajo izquierda" },
  { id: "bottom-right", label: "Abajo derecha" },
];

export function WatermarkPdfTool() {
  const [file, setFile] = useState<File | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [applyToAll, setApplyToAll] = useState(true);
  const [pagesInput, setPagesInput] = useState("");
  const [position, setPosition] = useState<WatermarkPosition>("diagonal");
  const [rotationDegrees, setRotationDegrees] = useState(0);
  const [fontSize, setFontSize] = useState(48);
  const [opacity, setOpacity] = useState(0.3);
  const [color, setColor] = useState("#ff0000");
  const [repeat, setRepeat] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
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
    setText("");
    setConfirmed(false);
    setError(null);
    setResultBytes(null);
  }

  function hexToRgbFloat(hex: string): { r: number; g: number; b: number } {
    const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!match) return { r: 0, g: 0, b: 0 };
    return { r: parseInt(match[1], 16) / 255, g: parseInt(match[2], 16) / 255, b: parseInt(match[3], 16) / 255 };
  }

  async function handleApply() {
    if (!bytes || !pageCount || !confirmed) return;
    setIsProcessing(true);
    setError(null);
    try {
      let pages: "all" | number[] = "all";
      if (!applyToAll) {
        const parsed = parsePageRange(pagesInput, pageCount);
        if (!parsed.ok || !parsed.indices) {
          setError(parsed.error ?? "Rango no válido.");
          return;
        }
        pages = parsed.indices;
      }

      const result = await applyWatermark(bytes, {
        text,
        pages,
        position,
        rotationDegrees,
        fontSize,
        opacity,
        color: hexToRgbFloat(color),
        repeat,
        marginPt: 40,
      });
      if (!result.ok || !result.bytes) {
        setError(result.error?.message ?? "No se pudo aplicar la marca de agua.");
        return;
      }
      setResultBytes(result.bytes);
    } catch {
      setError("No se pudo aplicar la marca de agua.");
    } finally {
      setIsProcessing(false);
    }
  }

  function download() {
    if (!resultBytes) return;
    downloadBlob("documento-con-marca-de-agua.pdf", resultBytes, "application/pdf");
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
          <div>
            <Label htmlFor="watermark-text" className="mb-1">
              Texto de la marca de agua
            </Label>
            <Input
              id="watermark-text"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setConfirmed(false);
              }}
              maxLength={80}
              placeholder="Escribe un texto o elige un preset"
            />
            <div role="group" aria-label="Presets" className="mt-2 flex flex-wrap gap-2">
              {WATERMARK_PRESETS.map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setText(preset);
                    setConfirmed(false);
                  }}
                >
                  {preset}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id="apply-all" checked={applyToAll} onCheckedChange={() => setApplyToAll((v) => !v)} />
            <Label htmlFor="apply-all" className="text-sm font-normal">
              Aplicar a todas las páginas
            </Label>
          </div>
          {!applyToAll ? (
            <div>
              <Label htmlFor="watermark-pages" className="mb-1">
                Páginas (documento de {pageCount})
              </Label>
              <Input id="watermark-pages" value={pagesInput} onChange={(e) => setPagesInput(e.target.value)} placeholder="1-3,7" />
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <Label htmlFor="watermark-position" className="mb-1">
                Posición
              </Label>
              <Select value={position} onValueChange={(v) => setPosition(v as WatermarkPosition)}>
                <SelectTrigger id="watermark-position" className="w-full">
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
              <Label htmlFor="watermark-rotation" className="mb-1">
                Rotación (°)
              </Label>
              <Input
                id="watermark-rotation"
                type="number"
                min={-180}
                max={180}
                value={rotationDegrees}
                onChange={(e) => setRotationDegrees(Number(e.target.value) || 0)}
                disabled={position === "diagonal"}
              />
            </div>
            <div>
              <Label htmlFor="watermark-size" className="mb-1">
                Tamaño
              </Label>
              <Input id="watermark-size" type="number" min={8} max={144} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value) || 48)} />
            </div>
            <div>
              <Label htmlFor="watermark-color" className="mb-1">
                Color
              </Label>
              <Input id="watermark-color" type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="watermark-opacity" className="mb-1">
                Opacidad ({Math.round(opacity * 100)}%)
              </Label>
              <input id="watermark-opacity" type="range" min={0.05} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} className="w-full" />
            </div>
            <div className="flex items-end gap-2 pb-1.5">
              <Checkbox id="watermark-repeat" checked={repeat} onCheckedChange={() => setRepeat((v) => !v)} />
              <Label htmlFor="watermark-repeat" className="text-sm font-normal">
                Repetir en mosaico
              </Label>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id="watermark-confirm" checked={confirmed} onCheckedChange={() => setConfirmed((v) => !v)} disabled={!text.trim()} />
            <Label htmlFor="watermark-confirm" className="text-sm font-normal">
              Confirmo que quiero añadir esta marca de agua al documento
            </Label>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={handleApply} disabled={!confirmed || isProcessing}>
              <Stamp className="size-3.5" /> {isProcessing ? "Aplicando..." : "Aplicar marca de agua"}
            </Button>
            <ResetButton onReset={reset} />
          </div>
        </div>
      ) : null}

      {resultBytes ? (
        <div aria-live="polite" className="space-y-2 rounded-lg border bg-muted/30 p-4">
          <p className="text-sm">Marca de agua aplicada correctamente.</p>
          <Button type="button" size="sm" onClick={download}>
            Descargar documento-con-marca-de-agua.pdf
          </Button>
        </div>
      ) : null}
    </div>
  );
}
