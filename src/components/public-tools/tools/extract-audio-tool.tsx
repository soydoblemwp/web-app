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
import type { AudioFormatId } from "@/lib/public-tools/media/ffmpeg-commands";

const AUDIO_FORMATS = STATIC_CAPABILITY_MATRIX.filter((f) => f.kind === "audio");

export function ExtractAudioTool() {
  const registryRef = useRef(new ObjectUrlRegistry());
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [hasAudio, setHasAudio] = useState(true);
  const [useRange, setUseRange] = useState(false);
  const [startMs, setStartMs] = useState(0);
  const [endMs, setEndMs] = useState(0);
  const [formatId, setFormatId] = useState<AudioFormatId>("mp3");
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
      setHasAudio(meta.hasAudio);
    } catch {
      setError("No se pudo leer la información del video.");
    }
  }

  async function handleProcess() {
    if (!file) return;
    setError(null);
    if (!hasAudio) {
      setError("Este video no contiene ninguna pista de audio.");
      return;
    }
    if (useRange) {
      const rangeCheck = validateTimeRange(startMs, endMs, durationMs);
      if (!rangeCheck.ok) {
        setError(rangeCheck.error ?? "Rango inválido.");
        return;
      }
    }
    const extension = file.name.split(".").pop() ?? "mp4";
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { extractAudioFromVideo } = await import("@/lib/public-tools/media/video");
    const result = await extractAudioFromVideo({
      bytes,
      extension,
      startMs: useRange ? startMs : undefined,
      endMs: useRange ? endMs : undefined,
      hasAudioTrack: hasAudio,
      copy: false,
      formatId,
    });
    setStep(null);
    if (!result.ok || !result.bytes) {
      setError(result.error?.message ?? "No se pudo extraer el audio.");
      return;
    }
    const format = AUDIO_FORMATS.find((f) => f.id === formatId);
    const blob = new Blob([result.bytes as BlobPart], { type: format?.mimeType ?? "audio/mpeg" });
    const url = registryRef.current.create(blob);
    setResultUrl(url);
    setResultFilename(buildMediaFilename("audio-extraido", format?.extension ?? "mp3"));
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

          {!hasAudio ? (
            <p role="alert" className="text-sm text-destructive">
              Este video no parece tener una pista de audio.
            </p>
          ) : (
            <>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={useRange} onCheckedChange={(c) => setUseRange(Boolean(c))} />
                Extraer solo un rango (en vez de todo el audio)
              </label>
              {useRange ? (
                <MediaTimeRangeEditor idPrefix="extract-audio" startMs={startMs} endMs={endMs} durationMs={durationMs} onChange={({ startMs: s, endMs: e }) => { setStartMs(s); setEndMs(e); }} />
              ) : null}

              <div className="max-w-xs">
                <Label htmlFor="extract-audio-format" className="mb-1">
                  Formato de salida
                </Label>
                <Select value={formatId} onValueChange={(v) => setFormatId(v as AudioFormatId)}>
                  <SelectTrigger id="extract-audio-format" className="w-full">
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

              <Button type="button" onClick={handleProcess} disabled={step !== null}>
                Extraer audio
              </Button>
            </>
          )}
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
          <audio controls src={resultUrl} className="w-full" />
          <Button type="button" onClick={handleDownload}>
            Descargar {resultFilename}
          </Button>
        </div>
      ) : null}

      <ResetButton onReset={handleReset} />
    </div>
  );
}
