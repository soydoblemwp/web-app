"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { MediaProcessingStatus } from "@/components/public-tools/media-processing-status";
import { ResetButton } from "@/components/public-tools/copy-download-actions";
import { downloadBlob } from "@/lib/public-tools/files/download";
import { buildMediaFilename } from "@/lib/public-tools/media/filenames";
import { ObjectUrlRegistry } from "@/lib/public-tools/media/object-urls";
import { isMediaRecorderSupported, pickSupportedMimeType, extensionForRecordingMime, computeAudioLevel, AUDIO_RECORDING_MIME_PREFERENCE } from "@/lib/public-tools/media/media-recorder";
import { formatRecordingDuration } from "@/lib/public-tools/media/recording";
import { stopAllTracks, performMediaCleanup } from "@/lib/public-tools/media/cleanup";
import { STATIC_CAPABILITY_MATRIX } from "@/lib/public-tools/media/capabilities";
import { onFfmpegProgress, cancelFfmpegJob, terminateFfmpeg } from "@/lib/public-tools/media/ffmpeg-client";
import type { ProcessingStep } from "@/lib/public-tools/media/ffmpeg-progress";
import type { AudioFormatId } from "@/lib/public-tools/media/ffmpeg-commands";

type RecorderStatus = "idle" | "recording" | "paused" | "stopped" | "unsupported" | "permission-denied";
const AUDIO_FORMATS = STATIC_CAPABILITY_MATRIX.filter((f) => f.kind === "audio");
const neverSubscribe = () => () => {};

export function VoiceRecorderTool() {
  const registryRef = useRef(new ObjectUrlRegistry());
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // useSyncExternalStore — not a useEffect+setState — is the React-sanctioned way to read a
  // browser-only value that must stay consistent between server and client during hydration: the
  // server snapshot always reports "supported" (matching the "idle" UI the server renders, since
  // there is no real check possible without `window`), and the real client value takes over
  // immediately after hydration with no extra render pass. Real bug found via Fase 45 browser
  // correction: the previous approach (evaluating isMediaRecorderSupported() directly in the
  // useState initializer) produced a different first-render result on the server vs. client,
  // which Chromium reported as a real React hydration error (#418), not just a cosmetic warning.
  const isRecorderSupported = useSyncExternalStore(neverSubscribe, isMediaRecorderSupported, () => true);
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [level, setLevel] = useState(0);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [convertFormat, setConvertFormat] = useState<AudioFormatId>("mp3");
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<ProcessingStep | null>(null);
  const [convertedUrl, setConvertedUrl] = useState<string | null>(null);
  const [convertedFilename, setConvertedFilename] = useState("");

  useEffect(() => {
    const unsubscribe = onFfmpegProgress((event) => setStep(event.step));
    return () => {
      unsubscribe();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      performMediaCleanup({ streams: [streamRef.current], objectUrls: [registryRef.current], mediaRecorder: recorderRef.current, terminateFfmpeg });
      audioContextRef.current?.close().catch(() => {});
    };
  }, []);

  function trackLevel() {
    if (!analyserRef.current) return;
    const data = new Uint8Array(analyserRef.current.fftSize);
    analyserRef.current.getByteTimeDomainData(data);
    setLevel(computeAudioLevel(data));
    rafRef.current = requestAnimationFrame(trackLevel);
  }

  async function handleStart() {
    setError(null);
    const chosenMime = pickSupportedMimeType(AUDIO_RECORDING_MIME_PREFERENCE);
    if (!chosenMime) {
      setStatus("unsupported");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;
      trackLevel();

      const recorder = new MediaRecorder(stream, { mimeType: chosenMime });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: chosenMime });
        const url = registryRef.current.create(blob);
        setResultUrl(url);
        setMimeType(chosenMime);
        setStatus("stopped");
      };
      recorder.start(250);
      recorderRef.current = recorder;
      setStatus("recording");
      setElapsedMs(0);
      timerRef.current = setInterval(() => setElapsedMs((prev) => prev + 200), 200);
    } catch {
      setStatus("permission-denied");
    }
  }

  function handlePause() {
    recorderRef.current?.pause();
    setStatus("paused");
    if (timerRef.current) clearInterval(timerRef.current);
  }
  function handleResume() {
    recorderRef.current?.resume();
    setStatus("recording");
    timerRef.current = setInterval(() => setElapsedMs((prev) => prev + 200), 200);
  }
  function handleStop() {
    recorderRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    stopAllTracks(streamRef.current);
    audioContextRef.current?.close().catch(() => {});
  }

  function handleDownload() {
    if (!resultUrl || !mimeType) return;
    fetch(resultUrl)
      .then((r) => r.blob())
      .then((blob) => downloadBlob(buildMediaFilename("grabacion-voz", extensionForRecordingMime(mimeType)), blob));
  }

  async function handleConvert() {
    if (!resultUrl) return;
    setError(null);
    const blob = await (await fetch(resultUrl)).blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const extension = mimeType ? extensionForRecordingMime(mimeType) : "webm";
    const { convertAudio } = await import("@/lib/public-tools/media/audio");
    const result = await convertAudio({ bytes, extension, formatId: convertFormat, stripMetadata: true });
    setStep(null);
    if (!result.ok || !result.bytes) {
      setError(result.error?.message ?? "No se pudo convertir la grabación.");
      return;
    }
    const format = AUDIO_FORMATS.find((f) => f.id === convertFormat);
    const outBlob = new Blob([result.bytes as BlobPart], { type: format?.mimeType ?? "audio/mpeg" });
    const url = registryRef.current.create(outBlob);
    setConvertedUrl(url);
    setConvertedFilename(buildMediaFilename("grabacion-voz-convertida", format?.extension ?? "mp3"));
  }

  function handleReset() {
    handleStop();
    performMediaCleanup({ objectUrls: [registryRef.current] });
    registryRef.current = new ObjectUrlRegistry();
    setStatus("idle");
    setElapsedMs(0);
    setResultUrl(null);
    setConvertedUrl(null);
    setError(null);
  }

  if (!isRecorderSupported || status === "unsupported") {
    return <p role="alert" className="text-sm text-destructive">Tu navegador no soporta la grabación de audio (MediaRecorder no está disponible).</p>;
  }

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">El permiso del micrófono solo se solicita al pulsar &quot;Grabar&quot;.</p>

      <div aria-live="polite" className="space-y-2 rounded-lg border p-4 text-center">
        <p className="text-2xl font-mono">{formatRecordingDuration(elapsedMs)}</p>
        {status === "recording" || status === "paused" ? (
          <div className="mx-auto flex items-center justify-center gap-2">
            <span aria-hidden="true" className={`inline-block size-3 rounded-full ${status === "recording" ? "bg-red-500" : "bg-amber-500"}`} />
            <span className="text-sm">{status === "recording" ? "Grabando" : "En pausa"}</span>
          </div>
        ) : null}
        {status === "recording" ? (
          <div className="mx-auto h-2 max-w-xs overflow-hidden rounded-full bg-muted" role="img" aria-label={`Nivel de audio: ${Math.round(level * 100)}%`}>
            <div className="h-full bg-primary transition-all" style={{ width: `${Math.round(level * 100)}%` }} />
          </div>
        ) : null}
      </div>

      {status === "permission-denied" ? (
        <p role="alert" className="text-sm text-destructive">
          No se concedió permiso para usar el micrófono.
        </p>
      ) : null}

      <div className="flex flex-wrap justify-center gap-2">
        {status === "idle" ? (
          <Button type="button" onClick={handleStart}>
            Grabar
          </Button>
        ) : null}
        {status === "recording" ? (
          <>
            <Button type="button" variant="outline" onClick={handlePause}>
              Pausar
            </Button>
            <Button type="button" variant="destructive" onClick={handleStop}>
              Detener
            </Button>
          </>
        ) : null}
        {status === "paused" ? (
          <>
            <Button type="button" onClick={handleResume}>
              Continuar
            </Button>
            <Button type="button" variant="destructive" onClick={handleStop}>
              Detener
            </Button>
          </>
        ) : null}
      </div>

      {status === "stopped" && resultUrl ? (
        <div aria-live="polite" className="space-y-3 rounded-lg border p-4">
          <audio controls src={resultUrl} className="w-full" />
          <p className="text-xs text-muted-foreground">Formato real generado por tu navegador: {mimeType}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={handleDownload}>
              Descargar
            </Button>
          </div>

          <div className="flex flex-wrap items-end gap-2 border-t pt-3">
            <div>
              <Label htmlFor="voice-convert-format" className="mb-1">
                Convertir a
              </Label>
              <Select value={convertFormat} onValueChange={(v) => setConvertFormat(v as AudioFormatId)}>
                <SelectTrigger id="voice-convert-format" className="w-40">
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
            <Button type="button" variant="outline" onClick={handleConvert} disabled={step !== null}>
              Convertir
            </Button>
          </div>
          <MediaProcessingStatus step={step} percent={null} onCancel={() => { cancelFfmpegJob(); setStep(null); }} />
          {convertedUrl ? (
            <div className="space-y-2">
              <audio controls src={convertedUrl} className="w-full" />
              <Button type="button" onClick={() => fetch(convertedUrl).then((r) => r.blob()).then((blob) => downloadBlob(convertedFilename, blob))}>
                Descargar {convertedFilename}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <ResetButton onReset={handleReset} />
    </div>
  );
}
