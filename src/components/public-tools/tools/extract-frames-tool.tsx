"use client";

import { useEffect, useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import { MediaProcessingStatus } from "@/components/public-tools/media-processing-status";
import { ResetButton } from "@/components/public-tools/copy-download-actions";
import { downloadBlob } from "@/lib/public-tools/files/download";
import { buildPaddedFilename } from "@/lib/public-tools/media/filenames";
import { ObjectUrlRegistry } from "@/lib/public-tools/media/object-urls";
import { validateVideoFile } from "@/lib/public-tools/media/validation";
import { readVideoMetadata } from "@/lib/public-tools/media/metadata";
import { parseTimeToMs } from "@/lib/public-tools/media/timeline";
import { MEDIA_LIMITS } from "@/lib/public-tools/media/limits";
import { onFfmpegProgress, cancelFfmpegJob, terminateFfmpeg } from "@/lib/public-tools/media/ffmpeg-client";
import { performMediaCleanup } from "@/lib/public-tools/media/cleanup";
import type { ProcessingStep } from "@/lib/public-tools/media/ffmpeg-progress";
import type { FrameExtractionMode } from "@/lib/public-tools/media/ffmpeg-commands";

const MODE_LABELS: Record<FrameExtractionMode, string> = {
  single: "Un tiempo concreto",
  interval: "Cada N segundos",
  count: "Cantidad uniforme",
  thumbnail: "Miniatura central",
  multiple: "Varios tiempos",
  grid: "Cuadrícula de contacto",
};

export function ExtractFramesTool() {
  const registryRef = useRef(new ObjectUrlRegistry());
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [mode, setMode] = useState<FrameExtractionMode>("thumbnail");
  const [timeText, setTimeText] = useState("00:01.000");
  const [intervalSeconds, setIntervalSeconds] = useState(5);
  const [count, setCount] = useState(6);
  const [format, setFormat] = useState<"png" | "mjpeg" | "webp">("png");
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<ProcessingStep | null>(null);
  const [resultUrls, setResultUrls] = useState<{ name: string; url: string }[]>([]);

  useEffect(() => {
    const unsubscribe = onFfmpegProgress((event) => setStep(event.step));
    return () => {
      unsubscribe();
      performMediaCleanup({ objectUrls: [registryRef.current], terminateFfmpeg });
    };
  }, []);

  async function handleFileSelected(files: File[]) {
    const selected = files[0];
    if (!selected) return;
    setError(null);
    setResultUrls([]);
    const validation = await validateVideoFile(selected);
    if (!validation.ok) {
      setError(validation.error?.message ?? "Archivo no válido.");
      return;
    }
    setFile(selected);
    const url = registryRef.current.create(selected);
    setPreviewUrl(url);
    try {
      const meta = await readVideoMetadata(url);
      setDurationMs(meta.durationMs);
    } catch {
      setError("No se pudo leer la información del video.");
    }
  }

  async function handleProcess() {
    if (!file) return;
    setError(null);

    if ((mode === "count" || mode === "grid") && count > MEDIA_LIMITS.frames.maxCount) {
      setError(`Como máximo ${MEDIA_LIMITS.frames.maxCount} fotogramas por lote.`);
      return;
    }

    let timeMs: number | undefined;
    if (mode === "single") {
      const parsed = parseTimeToMs(timeText);
      if (!parsed.ok || parsed.milliseconds === undefined) {
        setError(parsed.error ?? "Tiempo inválido.");
        return;
      }
      timeMs = parsed.milliseconds;
    }

    const extension = file.name.split(".").pop() ?? "mp4";
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { extractFrames } = await import("@/lib/public-tools/media/video");
    const result = await extractFrames({ bytes, extension, mode, timeMs, intervalSeconds, count, durationMs, format, quality: format === "mjpeg" ? 4 : undefined });
    setStep(null);
    if (!result.ok || !result.frames) {
      setError(result.error?.message ?? "No se pudieron extraer fotogramas.");
      return;
    }
    const ext = format === "mjpeg" ? "jpg" : format;
    const mime = format === "mjpeg" ? "image/jpeg" : format === "webp" ? "image/webp" : "image/png";
    const urls = result.frames.map((frame, i) => {
      const blob = new Blob([frame.bytes as BlobPart], { type: mime });
      const url = registryRef.current.create(blob);
      return { name: buildPaddedFilename("fotograma", i + 1, result.frames!.length, ext), url };
    });
    setResultUrls(urls);
  }

  function handleCancel() {
    cancelFfmpegJob();
    setStep(null);
  }

  async function handleDownloadOne(name: string, url: string) {
    const blob = await (await fetch(url)).blob();
    downloadBlob(name, blob);
  }

  async function handleDownloadAll() {
    if (resultUrls.length === 0) return;
    const { buildZip } = await import("@/lib/public-tools/files/zip");
    const entries = await Promise.all(
      resultUrls.map(async (r) => ({ name: r.name, data: new Uint8Array(await (await fetch(r.url)).arrayBuffer()) }))
    );
    const result = buildZip(entries);
    if (result.ok && result.bytes) downloadBlob("fotogramas.zip", result.bytes, "application/zip");
  }

  function handleReset() {
    performMediaCleanup({ objectUrls: [registryRef.current] });
    registryRef.current = new ObjectUrlRegistry();
    setFile(null);
    setPreviewUrl(null);
    setResultUrls([]);
    setError(null);
  }

  return (
    <div className="space-y-6">
      {!file ? (
        <FileUploadZone accept="video/*" onFilesSelected={handleFileSelected} hint="MP4, WebM, MOV, MKV... hasta 500 MB." />
      ) : (
        <div className="space-y-4">
          {previewUrl ? <video controls src={previewUrl} className="w-full rounded-lg border" /> : null}

          <div>
            <Label htmlFor="frames-mode" className="mb-1">
              Modo
            </Label>
            <Select value={mode} onValueChange={(v) => setMode(v as FrameExtractionMode)}>
              <SelectTrigger id="frames-mode" className="w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="thumbnail">{MODE_LABELS.thumbnail}</SelectItem>
                <SelectItem value="single">{MODE_LABELS.single}</SelectItem>
                <SelectItem value="interval">{MODE_LABELS.interval}</SelectItem>
                <SelectItem value="count">{MODE_LABELS.count}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {mode === "single" ? (
            <div className="max-w-xs">
              <Label htmlFor="frames-time" className="mb-1">
                Tiempo
              </Label>
              <Input id="frames-time" value={timeText} onChange={(e) => setTimeText(e.target.value)} placeholder="00:01.000" />
            </div>
          ) : null}
          {mode === "interval" ? (
            <div className="max-w-xs">
              <Label htmlFor="frames-interval" className="mb-1">
                Intervalo (segundos)
              </Label>
              <Input id="frames-interval" type="number" min={0.5} step={0.5} value={intervalSeconds} onChange={(e) => setIntervalSeconds(Number(e.target.value))} />
            </div>
          ) : null}
          {mode === "count" ? (
            <div className="max-w-xs">
              <Label htmlFor="frames-count" className="mb-1">
                Cantidad de fotogramas
              </Label>
              <Input id="frames-count" type="number" min={1} max={MEDIA_LIMITS.frames.maxCount} value={count} onChange={(e) => setCount(Number(e.target.value))} />
            </div>
          ) : null}

          <div className="max-w-xs">
            <Label htmlFor="frames-format" className="mb-1">
              Formato
            </Label>
            <Select value={format} onValueChange={(v) => setFormat(v as "png" | "mjpeg" | "webp")}>
              <SelectTrigger id="frames-format" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="png">PNG</SelectItem>
                <SelectItem value="mjpeg">JPEG</SelectItem>
                <SelectItem value="webp">WebP</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button type="button" onClick={handleProcess} disabled={step !== null}>
            Extraer fotogramas
          </Button>
        </div>
      )}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <MediaProcessingStatus step={step} percent={null} onCancel={handleCancel} />

      {resultUrls.length > 0 ? (
        <div aria-live="polite" className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {resultUrls.map((r) => (
              // eslint-disable-next-line @next/next/no-img-element -- locally-generated blob: URLs
              <img key={r.name} src={r.url} alt={r.name} className="w-full rounded-lg border" />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {resultUrls.map((r) => (
              <Button key={r.name} type="button" variant="outline" size="sm" onClick={() => handleDownloadOne(r.name, r.url)}>
                {r.name}
              </Button>
            ))}
            <Button type="button" onClick={handleDownloadAll}>
              Descargar todo en ZIP
            </Button>
          </div>
        </div>
      ) : null}

      <ResetButton onReset={handleReset} />
    </div>
  );
}
