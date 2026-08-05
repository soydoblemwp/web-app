"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ResetButton } from "@/components/public-tools/copy-download-actions";
import { downloadBlob } from "@/lib/public-tools/files/download";
import { buildMediaFilename } from "@/lib/public-tools/media/filenames";
import { ObjectUrlRegistry } from "@/lib/public-tools/media/object-urls";
import { isMediaRecorderSupported, pickSupportedMimeType, extensionForRecordingMime, VIDEO_RECORDING_MIME_PREFERENCE } from "@/lib/public-tools/media/media-recorder";
import { formatRecordingDuration } from "@/lib/public-tools/media/recording";
import { stopAllTracks, performMediaCleanup } from "@/lib/public-tools/media/cleanup";

type RecorderStatus = "idle" | "recording" | "paused" | "stopped" | "unsupported" | "permission-denied";

function isDisplayMediaSupported(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.mediaDevices !== "undefined" && typeof navigator.mediaDevices.getDisplayMedia === "function";
}
const neverSubscribe = () => () => {};

export function ScreenRecorderTool() {
  const registryRef = useRef(new ObjectUrlRegistry());
  const displayStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // useSyncExternalStore — not a useEffect+setState — is the React-sanctioned way to read a
  // browser-only value that must stay consistent between server and client during hydration: the
  // server snapshot always reports "supported" (matching the "idle" UI the server renders, since
  // neither check is meaningful without `window`), and the real client value takes over
  // immediately after hydration with no extra render pass. Real bug found via Fase 45 browser
  // correction: the previous approach (evaluating both checks directly in the useState
  // initializer) produced a different first-render result on the server vs. client, which
  // Chromium reported as a real React hydration error (#418), not just a cosmetic warning.
  const isRecorderSupported = useSyncExternalStore(neverSubscribe, () => isDisplayMediaSupported() && isMediaRecorderSupported(), () => true);
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [includeMic, setIncludeMic] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      performMediaCleanup({ streams: [displayStreamRef.current, micStreamRef.current], objectUrls: [registryRef.current], mediaRecorder: recorderRef.current });
    };
  }, []);

  async function handleStart() {
    setError(null);
    const chosenMime = pickSupportedMimeType(VIDEO_RECORDING_MIME_PREFERENCE);
    if (!chosenMime) {
      setStatus("unsupported");
      return;
    }
    try {
      // The browser's own native picker — this app never selects a source automatically.
      const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      displayStreamRef.current = displayStream;

      let combinedStream = displayStream;
      if (includeMic) {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          micStreamRef.current = micStream;
          combinedStream = new MediaStream([...displayStream.getTracks(), ...micStream.getTracks()]);
        } catch {
          setError("No se pudo activar el micrófono; continuando solo con el video de pantalla.");
        }
      }

      const recorder = new MediaRecorder(combinedStream, { mimeType: chosenMime });
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

      // If the visitor stops sharing from the browser's own UI (not our Stop button), finish cleanly.
      const [videoTrack] = displayStream.getVideoTracks();
      videoTrack.onended = () => {
        if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
        if (timerRef.current) clearInterval(timerRef.current);
        stopAllTracks(displayStreamRef.current);
        stopAllTracks(micStreamRef.current);
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
    stopAllTracks(displayStreamRef.current);
    stopAllTracks(micStreamRef.current);
  }

  function handleDownload() {
    if (!resultUrl || !mimeType) return;
    fetch(resultUrl)
      .then((r) => r.blob())
      .then((blob) => downloadBlob(buildMediaFilename("grabacion-pantalla", extensionForRecordingMime(mimeType)), blob));
  }

  function handleReset() {
    handleStop();
    performMediaCleanup({ objectUrls: [registryRef.current] });
    registryRef.current = new ObjectUrlRegistry();
    setStatus("idle");
    setElapsedMs(0);
    setResultUrl(null);
    setError(null);
  }

  if (!isRecorderSupported || status === "unsupported") {
    return <p role="alert" className="text-sm text-destructive">Tu navegador no soporta la grabación de pantalla (getDisplayMedia o MediaRecorder no están disponibles).</p>;
  }

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
        Al pulsar &quot;Grabar&quot; tu navegador mostrará su selector nativo de pantalla, ventana o pestaña — esta herramienta nunca elige una fuente automáticamente.
      </p>

      {status === "idle" ? (
        <div className="flex items-center gap-2">
          <Checkbox id="screen-recorder-include-mic" checked={includeMic} onCheckedChange={(c) => setIncludeMic(Boolean(c))} />
          <Label htmlFor="screen-recorder-include-mic" className="text-sm font-normal">
            Incluir micrófono
          </Label>
        </div>
      ) : null}

      <div aria-live="polite" className="space-y-2 rounded-lg border p-4 text-center">
        <p className="text-2xl font-mono">{formatRecordingDuration(elapsedMs)}</p>
        {status === "recording" || status === "paused" ? (
          <div className="mx-auto flex items-center justify-center gap-2">
            <span aria-hidden="true" className={`inline-block size-3 rounded-full ${status === "recording" ? "bg-red-500" : "bg-amber-500"}`} />
            <span className="text-sm">{status === "recording" ? "Grabando pantalla" : "En pausa"}</span>
          </div>
        ) : null}
      </div>

      {status === "permission-denied" ? (
        <p role="alert" className="text-sm text-destructive">
          No se concedió permiso para compartir pantalla.
        </p>
      ) : null}
      {error ? <p className="text-sm text-amber-600 dark:text-amber-400">{error}</p> : null}

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
          <video controls src={resultUrl} className="w-full rounded-lg border" />
          <p className="text-xs text-muted-foreground">Formato real generado por tu navegador: {mimeType}</p>
          <Button type="button" onClick={handleDownload}>
            Descargar
          </Button>
        </div>
      ) : null}

      <ResetButton onReset={handleReset} />
    </div>
  );
}
