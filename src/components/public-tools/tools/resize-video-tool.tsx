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
import { buildMediaFilename } from "@/lib/public-tools/media/filenames";
import { ObjectUrlRegistry } from "@/lib/public-tools/media/object-urls";
import { validateVideoFile, validateResolution } from "@/lib/public-tools/media/validation";
import { readVideoMetadata } from "@/lib/public-tools/media/metadata";
import { STATIC_CAPABILITY_MATRIX } from "@/lib/public-tools/media/capabilities";
import { onFfmpegProgress, cancelFfmpegJob, terminateFfmpeg } from "@/lib/public-tools/media/ffmpeg-client";
import { performMediaCleanup } from "@/lib/public-tools/media/cleanup";
import type { ProcessingStep } from "@/lib/public-tools/media/ffmpeg-progress";
import type { ResizeFit, VideoFormatId } from "@/lib/public-tools/media/ffmpeg-commands";

const VIDEO_FORMATS = STATIC_CAPABILITY_MATRIX.filter((f) => f.kind === "video");

const PRESETS: { name: string; ratio: [number, number] | null }[] = [
  { name: "Original", ratio: null },
  { name: "16:9", ratio: [16, 9] },
  { name: "9:16", ratio: [9, 16] },
  { name: "1:1", ratio: [1, 1] },
  { name: "4:5", ratio: [4, 5] },
  { name: "4:3", ratio: [4, 3] },
];

export function ResizeVideoTool() {
  const registryRef = useRef(new ObjectUrlRegistry());
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [originalWidth, setOriginalWidth] = useState(0);
  const [originalHeight, setOriginalHeight] = useState(0);
  const [preset, setPreset] = useState("Original");
  const [width, setWidth] = useState(1280);
  const [height, setHeight] = useState(720);
  const [fit, setFit] = useState<ResizeFit>("contain");
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
      setOriginalWidth(meta.width);
      setOriginalHeight(meta.height);
      setWidth(meta.width);
      setHeight(meta.height);
    } catch {
      setError("No se pudo leer la información del video.");
    }
  }

  function applyPreset(name: string) {
    setPreset(name);
    const found = PRESETS.find((p) => p.name === name);
    if (!found || !found.ratio || originalWidth === 0) return;
    const [rw, rh] = found.ratio;
    const w = originalWidth;
    const h = Math.round((w * rh) / rw);
    setWidth(w % 2 === 0 ? w : w + 1);
    setHeight(h % 2 === 0 ? h : h + 1);
  }

  async function handleProcess() {
    if (!file) return;
    setError(null);
    const resCheck = validateResolution(width, height);
    if (!resCheck.ok) {
      setError(resCheck.error?.message ?? "Resolución inválida.");
      return;
    }
    const extension = file.name.split(".").pop() ?? "mp4";
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { resizeVideo } = await import("@/lib/public-tools/media/video");
    const result = await resizeVideo({ bytes, extension, width, height, fit, formatId });
    setStep(null);
    if (!result.ok || !result.bytes) {
      setError(result.error?.message ?? "No se pudo redimensionar el video.");
      return;
    }
    const format = VIDEO_FORMATS.find((f) => f.id === formatId);
    const blob = new Blob([result.bytes as BlobPart], { type: format?.mimeType ?? "video/mp4" });
    const url = registryRef.current.create(blob);
    setResultUrl(url);
    setResultFilename(buildMediaFilename("video-redimensionado", format?.extension ?? "mp4"));
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
            Original: {originalWidth}×{originalHeight}
          </p>

          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <Button key={p.name} type="button" variant={preset === p.name ? "default" : "outline"} size="sm" onClick={() => applyPreset(p.name)}>
                {p.name}
              </Button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="resize-width" className="mb-1">
                Ancho (px)
              </Label>
              <Input id="resize-width" type="number" min={2} max={7680} value={width} onChange={(e) => setWidth(Number(e.target.value))} />
            </div>
            <div>
              <Label htmlFor="resize-height" className="mb-1">
                Alto (px)
              </Label>
              <Input id="resize-height" type="number" min={2} max={4320} value={height} onChange={(e) => setHeight(Number(e.target.value))} />
            </div>
          </div>

          <div>
            <Label htmlFor="resize-fit" className="mb-1">
              Ajuste
            </Label>
            <Select value={fit} onValueChange={(v) => setFit(v as ResizeFit)}>
              <SelectTrigger id="resize-fit" className="w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contain">Contener (con bordes)</SelectItem>
                <SelectItem value="cover">Cubrir (recorta el sobrante)</SelectItem>
                <SelectItem value="crop">Recortar (sin escalar)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">El video nunca se deforma: el ajuste elegido siempre escala de forma uniforme.</p>

          <div className="max-w-xs">
            <Label htmlFor="resize-format" className="mb-1">
              Formato de salida
            </Label>
            <Select value={formatId} onValueChange={(v) => setFormatId(v as VideoFormatId)}>
              <SelectTrigger id="resize-format" className="w-full">
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

          <Button type="button" onClick={handleProcess} disabled={step !== null}>
            Redimensionar video
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
