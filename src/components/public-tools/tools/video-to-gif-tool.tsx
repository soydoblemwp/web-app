"use client";

import { useEffect, useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import { MediaTimeRangeEditor } from "@/components/public-tools/media-time-range";
import { MediaProcessingStatus } from "@/components/public-tools/media-processing-status";
import { ResetButton } from "@/components/public-tools/copy-download-actions";
import { downloadBlob } from "@/lib/public-tools/files/download";
import { buildMediaFilename } from "@/lib/public-tools/media/filenames";
import { ObjectUrlRegistry } from "@/lib/public-tools/media/object-urls";
import { validateVideoFile } from "@/lib/public-tools/media/validation";
import { readVideoMetadata } from "@/lib/public-tools/media/metadata";
import { validateTimeRange } from "@/lib/public-tools/media/timeline";
import { MEDIA_LIMITS } from "@/lib/public-tools/media/limits";
import { onFfmpegProgress, cancelFfmpegJob, terminateFfmpeg } from "@/lib/public-tools/media/ffmpeg-client";
import { performMediaCleanup } from "@/lib/public-tools/media/cleanup";
import type { ProcessingStep } from "@/lib/public-tools/media/ffmpeg-progress";

export function VideoToGifTool() {
  const registryRef = useRef(new ObjectUrlRegistry());
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [startMs, setStartMs] = useState(0);
  const [endMs, setEndMs] = useState(0);
  const [fps, setFps] = useState(10);
  const [width, setWidth] = useState(480);
  const [loop, setLoop] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<ProcessingStep | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultFilename, setResultFilename] = useState("");

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
    setResultUrl(null);
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
      const clampedEnd = Math.min(meta.durationMs, MEDIA_LIMITS.gif.maxDurationSeconds * 1000);
      setEndMs(clampedEnd);
    } catch {
      setError("No se pudo leer la información del video.");
    }
  }

  const selectionMs = Math.max(0, endMs - startMs);
  const estimatedFrames = Math.round((selectionMs / 1000) * fps);
  const exceedsLimits = selectionMs / 1000 > MEDIA_LIMITS.gif.maxDurationSeconds || fps > MEDIA_LIMITS.gif.maxFps || width > MEDIA_LIMITS.gif.maxWidth || estimatedFrames > MEDIA_LIMITS.gif.maxEstimatedFrames;

  async function handleProcess() {
    if (!file) return;
    setError(null);
    const rangeCheck = validateTimeRange(startMs, endMs, durationMs);
    if (!rangeCheck.ok) {
      setError(rangeCheck.error ?? "Rango inválido.");
      return;
    }
    if (exceedsLimits) {
      setError("La combinación de duración, FPS y ancho supera los límites de esta herramienta.");
      return;
    }
    const extension = file.name.split(".").pop() ?? "mp4";
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { videoToGif } = await import("@/lib/public-tools/media/video");
    const result = await videoToGif({ bytes, extension, startMs, endMs, fps, width, loop });
    setStep(null);
    if (!result.ok || !result.bytes) {
      setError(result.error?.message ?? "No se pudo generar el GIF.");
      return;
    }
    const blob = new Blob([result.bytes as BlobPart], { type: "image/gif" });
    const url = registryRef.current.create(blob);
    setResultUrl(url);
    setResultFilename(buildMediaFilename("animacion", "gif"));
  }

  function handleCancel() {
    cancelFfmpegJob();
    setStep(null);
  }
  function handleDownload() {
    if (!resultUrl) return;
    fetch(resultUrl).then((r) => r.blob()).then((blob) => downloadBlob(resultFilename, blob));
  }
  function handleReset() {
    performMediaCleanup({ objectUrls: [registryRef.current] });
    registryRef.current = new ObjectUrlRegistry();
    setFile(null);
    setPreviewUrl(null);
    setResultUrl(null);
    setError(null);
  }

  return (
    <div className="space-y-6">
      {!file ? (
        <FileUploadZone accept="video/*" onFilesSelected={handleFileSelected} hint="MP4, WebM, MOV, MKV... hasta 500 MB." />
      ) : (
        <div className="space-y-4">
          {previewUrl ? <video controls src={previewUrl} className="w-full rounded-lg border" /> : null}

          <MediaTimeRangeEditor idPrefix="gif" startMs={startMs} endMs={endMs} durationMs={durationMs} onChange={({ startMs: s, endMs: e }) => { setStartMs(s); setEndMs(e); }} />

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="gif-fps" className="mb-1">
                FPS
              </Label>
              <Input id="gif-fps" type="number" min={1} max={MEDIA_LIMITS.gif.maxFps} value={fps} onChange={(e) => setFps(Number(e.target.value))} />
            </div>
            <div>
              <Label htmlFor="gif-width" className="mb-1">
                Ancho (px)
              </Label>
              <Input id="gif-width" type="number" min={16} max={MEDIA_LIMITS.gif.maxWidth} value={width} onChange={(e) => setWidth(Number(e.target.value))} />
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <Checkbox checked={loop} onCheckedChange={(c) => setLoop(Boolean(c))} />
              Repetir en bucle
            </label>
          </div>

          <div aria-live="polite" className={`rounded-lg border p-3 text-sm ${exceedsLimits ? "border-destructive/40 text-destructive" : "text-muted-foreground"}`}>
            <p>
              Fotogramas estimados: {estimatedFrames} — Dimensiones: {width}×auto — Duración: {(selectionMs / 1000).toFixed(1)}s
            </p>
            {exceedsLimits ? <p>Supera los límites de esta herramienta (máx. {MEDIA_LIMITS.gif.maxDurationSeconds}s, {MEDIA_LIMITS.gif.maxFps} FPS, {MEDIA_LIMITS.gif.maxWidth}px, {MEDIA_LIMITS.gif.maxEstimatedFrames} fotogramas).</p> : null}
          </div>

          <Button type="button" onClick={handleProcess} disabled={step !== null || exceedsLimits}>
            Generar GIF
          </Button>
        </div>
      )}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <MediaProcessingStatus step={step} percent={null} onCancel={handleCancel} />

      {resultUrl ? (
        <div aria-live="polite" className="space-y-2 rounded-lg border p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- a locally-generated blob: URL, not a remote/optimizable image */}
          <img src={resultUrl} alt="GIF generado" className="max-w-full rounded-lg border" />
          <Button type="button" onClick={handleDownload}>
            Descargar {resultFilename}
          </Button>
        </div>
      ) : null}

      <ResetButton onReset={handleReset} />
    </div>
  );
}
