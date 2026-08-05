"use client";

import { useEffect, useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import { MediaProcessingStatus } from "@/components/public-tools/media-processing-status";
import { ResetButton } from "@/components/public-tools/copy-download-actions";
import { downloadBlob } from "@/lib/public-tools/files/download";
import { formatBytes } from "@/lib/public-tools/files/format";
import { buildMediaFilename } from "@/lib/public-tools/media/filenames";
import { ObjectUrlRegistry } from "@/lib/public-tools/media/object-urls";
import { validateVideoFile } from "@/lib/public-tools/media/validation";
import { readVideoMetadata } from "@/lib/public-tools/media/metadata";
import { formatMsToTimecode } from "@/lib/public-tools/media/timeline";
import { STATIC_CAPABILITY_MATRIX } from "@/lib/public-tools/media/capabilities";
import { onFfmpegProgress, cancelFfmpegJob, terminateFfmpeg } from "@/lib/public-tools/media/ffmpeg-client";
import { performMediaCleanup } from "@/lib/public-tools/media/cleanup";
import type { ProcessingStep } from "@/lib/public-tools/media/ffmpeg-progress";
import type { QualityPreset, VideoFormatId } from "@/lib/public-tools/media/ffmpeg-commands";

const VIDEO_FORMATS = STATIC_CAPABILITY_MATRIX.filter((f) => f.kind === "video");
const WIDTH_PRESETS = [null, 1920, 1280, 854, 640];

export function CompressVideoTool() {
  const registryRef = useRef(new ObjectUrlRegistry());
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [originalWidth, setOriginalWidth] = useState(0);
  const [originalHeight, setOriginalHeight] = useState(0);
  const [quality, setQuality] = useState<QualityPreset>("balanced");
  const [formatId, setFormatId] = useState<VideoFormatId>("mp4-h264");
  const [maxWidth, setMaxWidth] = useState<number | null>(null);
  const [fps, setFps] = useState<number | null>(null);
  const [removeAudio, setRemoveAudio] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<ProcessingStep | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultFilename, setResultFilename] = useState("");
  const [resultSize, setResultSize] = useState<number | null>(null);
  const [increased, setIncreased] = useState(false);
  const [reductionPercent, setReductionPercent] = useState<number | null>(null);

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
      setOriginalWidth(meta.width);
      setOriginalHeight(meta.height);
    } catch {
      setError("No se pudo leer la información del video.");
    }
  }

  async function handleProcess() {
    if (!file) return;
    setError(null);
    const extension = file.name.split(".").pop() ?? "mp4";
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { compressVideo } = await import("@/lib/public-tools/media/video");
    const result = await compressVideo({ bytes, extension, quality, formatId, maxWidth: maxWidth ?? undefined, fps: fps ?? undefined, removeAudio, originalSizeBytes: file.size });
    setStep(null);
    if (!result.ok || !result.bytes) {
      setError(result.error?.message ?? "No se pudo comprimir el video.");
      return;
    }
    const format = VIDEO_FORMATS.find((f) => f.id === formatId);
    const blob = new Blob([result.bytes as BlobPart], { type: format?.mimeType ?? "video/mp4" });
    const url = registryRef.current.create(blob);
    setResultUrl(url);
    setResultSize(result.finalSizeBytes ?? result.bytes.length);
    setReductionPercent(result.reductionPercent ?? null);
    setIncreased(Boolean(result.increasedInSize));
    setResultFilename(buildMediaFilename("video-comprimido", format?.extension ?? "mp4"));
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
          <p className="text-sm text-muted-foreground">
            {formatBytes(file.size)} — {originalWidth}×{originalHeight} — {formatMsToTimecode(durationMs, false)}
          </p>

          <div className="flex gap-2">
            {(["high", "balanced", "small"] as QualityPreset[]).map((q) => (
              <Button key={q} type="button" variant={quality === q ? "default" : "outline"} size="sm" onClick={() => setQuality(q)}>
                {q === "high" ? "Calidad alta" : q === "balanced" ? "Equilibrada" : "Archivo pequeño"}
              </Button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="compress-video-format" className="mb-1">
                Formato
              </Label>
              <Select value={formatId} onValueChange={(v) => setFormatId(v as VideoFormatId)}>
                <SelectTrigger id="compress-video-format" className="w-full">
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
            <div>
              <Label htmlFor="compress-video-width" className="mb-1">
                Ancho máximo
              </Label>
              <Select value={String(maxWidth)} onValueChange={(v) => setMaxWidth(v === "null" ? null : Number(v))}>
                <SelectTrigger id="compress-video-width" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WIDTH_PRESETS.map((w) => (
                    <SelectItem key={String(w)} value={String(w)}>
                      {w === null ? "Original" : `${w}px`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="compress-video-fps" className="mb-1">
                FPS máximo
              </Label>
              <Select value={String(fps)} onValueChange={(v) => setFps(v === "null" ? null : Number(v))}>
                <SelectTrigger id="compress-video-fps" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="null">Original</SelectItem>
                  <SelectItem value="30">30</SelectItem>
                  <SelectItem value="24">24</SelectItem>
                  <SelectItem value="15">15</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={removeAudio} onCheckedChange={(c) => setRemoveAudio(Boolean(c))} />
            Eliminar audio
          </label>

          <Button type="button" onClick={handleProcess} disabled={step !== null}>
            Comprimir video
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
          <p className="text-sm">
            Original: {formatBytes(file?.size ?? 0)} → Final: {formatBytes(resultSize ?? 0)}
            {reductionPercent !== null ? ` (${reductionPercent > 0 ? "-" : "+"}${Math.abs(reductionPercent)}%)` : ""}
          </p>
          {increased ? <p className="text-sm text-amber-600 dark:text-amber-400">El resultado es mayor que el original; puedes conservar el archivo original en su lugar.</p> : null}
          <Button type="button" onClick={handleDownload}>
            Descargar {resultFilename}
          </Button>
        </div>
      ) : null}

      <ResetButton onReset={handleReset} />
    </div>
  );
}
