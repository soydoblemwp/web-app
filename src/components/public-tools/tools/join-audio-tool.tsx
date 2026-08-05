"use client";

import { useEffect, useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import { MediaProcessingStatus } from "@/components/public-tools/media-processing-status";
import { ResetButton } from "@/components/public-tools/copy-download-actions";
import { downloadBlob } from "@/lib/public-tools/files/download";
import { buildMediaFilename } from "@/lib/public-tools/media/filenames";
import { ObjectUrlRegistry } from "@/lib/public-tools/media/object-urls";
import { validateAudioFile } from "@/lib/public-tools/media/validation";
import { readAudioMetadata } from "@/lib/public-tools/media/metadata";
import { formatMsToTimecode } from "@/lib/public-tools/media/timeline";
import { STATIC_CAPABILITY_MATRIX } from "@/lib/public-tools/media/capabilities";
import { MEDIA_LIMITS } from "@/lib/public-tools/media/limits";
import { onFfmpegProgress, cancelFfmpegJob, terminateFfmpeg } from "@/lib/public-tools/media/ffmpeg-client";
import { performMediaCleanup } from "@/lib/public-tools/media/cleanup";
import type { ProcessingStep } from "@/lib/public-tools/media/ffmpeg-progress";
import type { AudioFormatId } from "@/lib/public-tools/media/ffmpeg-commands";

const AUDIO_FORMATS = STATIC_CAPABILITY_MATRIX.filter((f) => f.kind === "audio");

interface QueuedFile {
  id: string;
  file: File;
  durationMs: number | null;
}

export function JoinAudioTool() {
  const registryRef = useRef(new ObjectUrlRegistry());
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [silenceMs, setSilenceMs] = useState(0);
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

  async function handleFilesSelected(selected: File[]) {
    setError(null);
    if (files.length + selected.length > MEDIA_LIMITS.audio.maxFilesToJoin) {
      setError(`Puedes unir como máximo ${MEDIA_LIMITS.audio.maxFilesToJoin} archivos.`);
      return;
    }
    for (const file of selected) {
      const validation = await validateAudioFile(file);
      if (!validation.ok) {
        setError(validation.error?.message ?? "Uno de los archivos no es válido.");
        continue;
      }
      const id = `f-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setFiles((prev) => [...prev, { id, file, durationMs: null }]);
      const url = registryRef.current.create(file);
      readAudioMetadata(url)
        .then((meta) => setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, durationMs: meta.durationMs } : f))))
        .catch(() => {});
    }
  }

  function moveFile(index: number, direction: -1 | 1) {
    setFiles((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }
  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  const totalDurationMs = files.reduce((sum, f) => sum + (f.durationMs ?? 0), 0) + Math.max(0, files.length - 1) * silenceMs;

  async function handleProcess() {
    setError(null);
    if (files.length < 2) {
      setError("Selecciona al menos 2 archivos para unir.");
      return;
    }
    const inputs = await Promise.all(
      files.map(async (f) => ({ bytes: new Uint8Array(await f.file.arrayBuffer()), extension: f.file.name.split(".").pop() ?? "mp3" }))
    );
    const { joinAudios } = await import("@/lib/public-tools/media/audio");
    const result = await joinAudios({ files: inputs, formatId });
    setStep(null);
    if (!result.ok || !result.bytes) {
      setError(result.error?.message ?? "No se pudieron unir los audios.");
      return;
    }
    const format = AUDIO_FORMATS.find((f) => f.id === formatId);
    const blob = new Blob([result.bytes as BlobPart], { type: format?.mimeType ?? "audio/mpeg" });
    const url = registryRef.current.create(blob);
    setResultUrl(url);
    setResultFilename(buildMediaFilename("audios-unidos", format?.extension ?? "mp3"));
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
    setFiles([]);
    setError(null);
    setResultUrl(null);
  }

  return (
    <div className="space-y-6">
      <FileUploadZone accept="audio/*" multiple onFilesSelected={handleFilesSelected} hint={`Hasta ${MEDIA_LIMITS.audio.maxFilesToJoin} archivos, ${Math.round(MEDIA_LIMITS.audio.maxTotalBytes / (1024 * 1024))} MB en total.`} />

      {files.length > 0 ? (
        <div className="space-y-2">
          {files.map((f, index) => (
            <div key={f.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
              <span className="w-6 text-center text-muted-foreground">{index + 1}</span>
              <span className="flex-1 truncate">{f.file.name}</span>
              <span className="text-xs text-muted-foreground">{f.durationMs !== null ? formatMsToTimecode(f.durationMs, false) : "…"}</span>
              <span className="text-xs text-muted-foreground">{(f.file.size / (1024 * 1024)).toFixed(1)} MB</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => moveFile(index, -1)} disabled={index === 0} aria-label="Subir">
                ↑
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => moveFile(index, 1)} disabled={index === files.length - 1} aria-label="Bajar">
                ↓
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => removeFile(f.id)}>
                ✕
              </Button>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Duración estimada final: {formatMsToTimecode(totalDurationMs, false)}</p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="join-silence" className="mb-1">
            Silencio entre pistas (ms)
          </Label>
          <input id="join-silence" type="number" min={0} max={5000} value={silenceMs} onChange={(e) => setSilenceMs(Number(e.target.value))} className="h-9 w-full rounded-md border px-3 text-sm" />
        </div>
        <div>
          <Label htmlFor="join-format" className="mb-1">
            Formato de salida
          </Label>
          <Select value={formatId} onValueChange={(v) => setFormatId(v as AudioFormatId)}>
            <SelectTrigger id="join-format" className="w-full">
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
      </div>

      <Button type="button" onClick={handleProcess} disabled={step !== null || files.length < 2}>
        Unir audios
      </Button>

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
