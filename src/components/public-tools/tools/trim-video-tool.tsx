"use client";

import { useEffect, useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { STATIC_CAPABILITY_MATRIX } from "@/lib/public-tools/media/capabilities";
import { onFfmpegProgress, cancelFfmpegJob, terminateFfmpeg } from "@/lib/public-tools/media/ffmpeg-client";
import { performMediaCleanup } from "@/lib/public-tools/media/cleanup";
import type { ProcessingStep } from "@/lib/public-tools/media/ffmpeg-progress";
import type { VideoFormatId } from "@/lib/public-tools/media/ffmpeg-commands";

const VIDEO_FORMATS = STATIC_CAPABILITY_MATRIX.filter((f) => f.kind === "video");

export function TrimVideoTool() {
  const registryRef = useRef(new ObjectUrlRegistry());
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [startMs, setStartMs] = useState(0);
  const [endMs, setEndMs] = useState(0);
  const [mode, setMode] = useState<"fast" | "precise">("fast");
  const [keepAudio, setKeepAudio] = useState(true);
  const [formatId, setFormatId] = useState<VideoFormatId>("mp4-h264");
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
      setEndMs(meta.durationMs);
    } catch {
      setError("No se pudo leer la información del video.");
    }
  }

  async function handleProcess() {
    if (!file) return;
    setError(null);
    const rangeCheck = validateTimeRange(startMs, endMs, durationMs);
    if (!rangeCheck.ok) {
      setError(rangeCheck.error ?? "Rango inválido.");
      return;
    }
    const extension = file.name.split(".").pop() ?? "mp4";
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { trimVideo } = await import("@/lib/public-tools/media/video");
    const result = await trimVideo({ bytes, extension, startMs, endMs, mode, keepAudio, formatId });
    setStep(null);
    if (!result.ok || !result.bytes) {
      setError(result.error?.message ?? "No se pudo recortar el video.");
      return;
    }
    const format = VIDEO_FORMATS.find((f) => f.id === formatId);
    const mime = mode === "fast" ? file.type || "video/mp4" : format?.mimeType ?? "video/mp4";
    const ext = mode === "fast" ? extension : format?.extension ?? "mp4";
    const blob = new Blob([result.bytes as BlobPart], { type: mime });
    const url = registryRef.current.create(blob);
    setResultUrl(url);
    setResultFilename(buildMediaFilename("video-recortado", ext));
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

          <MediaTimeRangeEditor idPrefix="trim-video" startMs={startMs} endMs={endMs} durationMs={durationMs} onChange={({ startMs: s, endMs: e }) => { setStartMs(s); setEndMs(e); }} />

          <div className="flex gap-2">
            <Button type="button" variant={mode === "fast" ? "default" : "outline"} size="sm" onClick={() => setMode("fast")}>
              Corte rápido
            </Button>
            <Button type="button" variant={mode === "precise" ? "default" : "outline"} size="sm" onClick={() => setMode("precise")}>
              Corte preciso
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {mode === "fast"
              ? "Copia los streams sin recodificar: casi instantáneo, pero el inicio puede ajustarse al keyframe más cercano (no garantiza precisión de fotograma)."
              : "Recodifica el video para cortar exactamente en el fotograma elegido; tarda más."}
          </p>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={keepAudio} onCheckedChange={(c) => setKeepAudio(Boolean(c))} />
              Conservar audio
            </label>
            {mode === "precise" ? (
              <div className="max-w-xs">
                <Label htmlFor="trim-video-format" className="mb-1">
                  Formato de salida
                </Label>
                <Select value={formatId} onValueChange={(v) => setFormatId(v as VideoFormatId)}>
                  <SelectTrigger id="trim-video-format" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VIDEO_FORMATS.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>

          <Button type="button" onClick={handleProcess} disabled={step !== null}>
            Recortar video
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
          <video controls src={resultUrl} className="w-full rounded-lg border" />
          <Button type="button" onClick={handleDownload}>
            Descargar {resultFilename}
          </Button>
        </div>
      ) : null}

      <ResetButton onReset={handleReset} />
    </div>
  );
}
