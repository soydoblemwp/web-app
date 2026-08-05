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
import { validateAudioFile } from "@/lib/public-tools/media/validation";
import { readAudioMetadata } from "@/lib/public-tools/media/metadata";
import { formatMsToTimecode } from "@/lib/public-tools/media/timeline";
import { STATIC_CAPABILITY_MATRIX } from "@/lib/public-tools/media/capabilities";
import { onFfmpegProgress, cancelFfmpegJob, terminateFfmpeg } from "@/lib/public-tools/media/ffmpeg-client";
import { performMediaCleanup } from "@/lib/public-tools/media/cleanup";
import type { ProcessingStep } from "@/lib/public-tools/media/ffmpeg-progress";
import type { AudioFormatId } from "@/lib/public-tools/media/ffmpeg-commands";

const AUDIO_FORMATS = STATIC_CAPABILITY_MATRIX.filter((f) => f.kind === "audio");
const BITRATES = [96, 128, 160, 192, 256, 320];
const SAMPLE_RATES = [22050, 44100, 48000];

export function ConvertAudioTool() {
  const registryRef = useRef(new ObjectUrlRegistry());
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [formatId, setFormatId] = useState<AudioFormatId>("mp3");
  const [bitrate, setBitrate] = useState(192);
  const [sampleRate, setSampleRate] = useState(44100);
  const [mono, setMono] = useState(false);
  const [stripMetadata, setStripMetadata] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<ProcessingStep | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultFilename, setResultFilename] = useState("");
  const [resultSize, setResultSize] = useState<number | null>(null);

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
    const validation = await validateAudioFile(selected);
    if (!validation.ok) {
      setError(validation.error?.message ?? "Archivo no válido.");
      return;
    }
    setFile(selected);
    const url = registryRef.current.create(selected);
    setPreviewUrl(url);
    readAudioMetadata(url).then((meta) => setDurationMs(meta.durationMs)).catch(() => {});
  }

  async function handleProcess() {
    if (!file) return;
    setError(null);
    const extension = file.name.split(".").pop() ?? "mp3";
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { convertAudio } = await import("@/lib/public-tools/media/audio");
    const result = await convertAudio({ bytes, extension, formatId, bitrateKbps: bitrate, sampleRate, channels: mono ? 1 : 2, stripMetadata });
    setStep(null);
    if (!result.ok || !result.bytes) {
      setError(result.error?.message ?? "No se pudo convertir el audio.");
      return;
    }
    const format = AUDIO_FORMATS.find((f) => f.id === formatId);
    const blob = new Blob([result.bytes as BlobPart], { type: format?.mimeType ?? "audio/mpeg" });
    const url = registryRef.current.create(blob);
    setResultUrl(url);
    setResultSize(result.bytes.length);
    setResultFilename(buildMediaFilename("audio-convertido", format?.extension ?? "mp3"));
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

  const selectedFormat = AUDIO_FORMATS.find((f) => f.id === formatId);

  return (
    <div className="space-y-6">
      {!file ? (
        <FileUploadZone accept="audio/*" onFilesSelected={handleFileSelected} hint="MP3, WAV, M4A, OGG, FLAC... hasta 100 MB." />
      ) : (
        <div className="space-y-4">
          {previewUrl ? <audio controls src={previewUrl} className="w-full" /> : null}
          <p className="text-sm text-muted-foreground">
            {file.name} — {formatBytes(file.size)} — {formatMsToTimecode(durationMs, false)}
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="convert-audio-format" className="mb-1">
                Formato de salida
              </Label>
              <Select value={formatId} onValueChange={(v) => setFormatId(v as AudioFormatId)}>
                <SelectTrigger id="convert-audio-format" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUDIO_FORMATS.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.label} {f.lossless ? "(sin pérdida)" : "(con pérdida)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="convert-audio-bitrate" className="mb-1">
                Bitrate (kbps)
              </Label>
              <Select value={String(bitrate)} onValueChange={(v) => setBitrate(Number(v))}>
                <SelectTrigger id="convert-audio-bitrate" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BITRATES.map((b) => (
                    <SelectItem key={b} value={String(b)}>
                      {b} kbps
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="convert-audio-samplerate" className="mb-1">
                Sample rate
              </Label>
              <Select value={String(sampleRate)} onValueChange={(v) => setSampleRate(Number(v))}>
                <SelectTrigger id="convert-audio-samplerate" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SAMPLE_RATES.map((r) => (
                    <SelectItem key={r} value={String(r)}>
                      {r} Hz
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col justify-end gap-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={mono} onCheckedChange={(c) => setMono(Boolean(c))} />
                Mono (en vez de estéreo)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={stripMetadata} onCheckedChange={(c) => setStripMetadata(Boolean(c))} />
                Eliminar metadata
              </label>
            </div>
          </div>

          {selectedFormat && !selectedFormat.lossless ? <p className="text-xs text-muted-foreground">{selectedFormat.label} usa compresión con pérdida; no es una copia bit a bit del original.</p> : null}

          <Button type="button" onClick={handleProcess} disabled={step !== null}>
            Convertir audio
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
          <audio controls src={resultUrl} className="w-full" />
          <p className="text-sm text-muted-foreground">
            Tamaño original: {formatBytes(file?.size ?? 0)} — Tamaño final: {formatBytes(resultSize ?? 0)}
          </p>
          <Button type="button" onClick={handleDownload}>
            Descargar {resultFilename}
          </Button>
        </div>
      ) : null}

      <ResetButton onReset={handleReset} />
    </div>
  );
}
