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
import { validateAudioFile } from "@/lib/public-tools/media/validation";
import { readAudioMetadata } from "@/lib/public-tools/media/metadata";
import { validateTimeRange } from "@/lib/public-tools/media/timeline";
import { STATIC_CAPABILITY_MATRIX } from "@/lib/public-tools/media/capabilities";
import { onFfmpegProgress, cancelFfmpegJob, terminateFfmpeg } from "@/lib/public-tools/media/ffmpeg-client";
import { computeMediaProgress, type ProcessingStep } from "@/lib/public-tools/media/ffmpeg-progress";
import { performMediaCleanup } from "@/lib/public-tools/media/cleanup";
import type { AudioFormatId } from "@/lib/public-tools/media/ffmpeg-commands";

const AUDIO_FORMATS = STATIC_CAPABILITY_MATRIX.filter((f) => f.kind === "audio");

export function TrimAudioTool() {
  const registryRef = useRef(new ObjectUrlRegistry());
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [startMs, setStartMs] = useState(0);
  const [endMs, setEndMs] = useState(0);
  const [fadeIn, setFadeIn] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const [formatId, setFormatId] = useState<AudioFormatId>("mp3");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
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
    setWarning(null);
    setResultUrl(null);
    const validation = await validateAudioFile(selected);
    if (!validation.ok) {
      setError(validation.error?.message ?? "Archivo no válido.");
      return;
    }
    if (validation.warning) setWarning(validation.warning);
    setFile(selected);
    const url = registryRef.current.create(selected);
    setPreviewUrl(url);
    try {
      const meta = await readAudioMetadata(url);
      setDurationMs(meta.durationMs);
      setEndMs(meta.durationMs);
    } catch {
      setError("No se pudo leer la duración del audio.");
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

    const extension = file.name.split(".").pop() ?? "mp3";
    const bytes = new Uint8Array(await file.arrayBuffer());

    const { trimAudio } = await import("@/lib/public-tools/media/audio");
    const result = await trimAudio({
      bytes,
      extension,
      startMs,
      endMs,
      fadeInMs: fadeIn ? 500 : undefined,
      fadeOutMs: fadeOut ? 500 : undefined,
      formatId,
      useCopyWhenPossible: true,
    });
    setStep(null);

    if (!result.ok || !result.bytes) {
      setError(result.error?.message ?? "No se pudo procesar el audio.");
      return;
    }

    // A fade-free trim may have been a real stream copy that preserved the
    // SOURCE codec instead of transcoding to the requested formatId — label
    // the result from what the bytes actually are, never from the request.
    const actualExtension = result.actualExtension ?? formatId;
    const format = AUDIO_FORMATS.find((f) => f.extension === actualExtension) ?? AUDIO_FORMATS.find((f) => f.id === formatId);
    const blob = new Blob([result.bytes as BlobPart], { type: format?.mimeType ?? "audio/mpeg" });
    const url = registryRef.current.create(blob);
    setResultUrl(url);
    setResultFilename(buildMediaFilename("audio-recortado", format?.extension ?? actualExtension));
  }

  function handleCancel() {
    cancelFfmpegJob();
    setStep(null);
  }

  function handleDownload() {
    if (!resultUrl) return;
    fetch(resultUrl)
      .then((r) => r.blob())
      .then((blob) => downloadBlob(resultFilename, blob));
  }

  function handleReset() {
    performMediaCleanup({ objectUrls: [registryRef.current] });
    registryRef.current = new ObjectUrlRegistry();
    setFile(null);
    setPreviewUrl(null);
    setDurationMs(0);
    setStartMs(0);
    setEndMs(0);
    setError(null);
    setWarning(null);
    setResultUrl(null);
  }

  return (
    <div className="space-y-6">
      {!file ? (
        <FileUploadZone accept="audio/*" onFilesSelected={handleFileSelected} hint="MP3, WAV, M4A, OGG, FLAC... hasta 100 MB." />
      ) : (
        <div className="space-y-4">
          {previewUrl ? <audio controls src={previewUrl} className="w-full" /> : null}
          {warning ? <p className="text-xs text-amber-600 dark:text-amber-400">{warning}</p> : null}

          <MediaTimeRangeEditor idPrefix="trim-audio" startMs={startMs} endMs={endMs} durationMs={durationMs} onChange={({ startMs: s, endMs: e }) => { setStartMs(s); setEndMs(e); }} />

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={fadeIn} onCheckedChange={(c) => setFadeIn(Boolean(c))} />
              Fundido de entrada
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={fadeOut} onCheckedChange={(c) => setFadeOut(Boolean(c))} />
              Fundido de salida
            </label>
          </div>

          <div className="max-w-xs">
            <Label htmlFor="trim-audio-format" className="mb-1">
              Formato de salida
            </Label>
            <Select value={formatId} onValueChange={(v) => setFormatId(v as AudioFormatId)}>
              <SelectTrigger id="trim-audio-format" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUDIO_FORMATS.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!fadeIn && !fadeOut ? <p className="text-xs text-muted-foreground">Sin fundidos, se intentará copiar el segmento sin recodificar para conservar la calidad exacta.</p> : null}

          <Button type="button" onClick={handleProcess} disabled={step !== null}>
            Recortar audio
          </Button>
        </div>
      )}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <MediaProcessingStatus step={step} percent={computeMediaProgress(step ?? "done", 0, null).percent} onCancel={handleCancel} />

      {resultUrl ? (
        <div aria-live="polite" className="space-y-2 rounded-lg border p-4">
          <audio controls src={resultUrl} className="w-full" />
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={handleDownload}>
              Descargar {resultFilename}
            </Button>
          </div>
        </div>
      ) : null}

      <ResetButton onReset={handleReset} />
    </div>
  );
}
