"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CopyButton, DownloadButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { getSampleText, computeTypingResult, type TypingLanguage, type TypingDifficulty } from "@/lib/public-tools/education/typing-test";

const DURATIONS = [15, 30, 60, 120];

export function TypingSpeedTestTool() {
  const [language, setLanguage] = useState<TypingLanguage>("es");
  const [difficulty, setDifficulty] = useState<TypingDifficulty>("medium");
  const [durationSec, setDurationSec] = useState(30);
  const [customText, setCustomText] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [targetText, setTargetText] = useState(() => getSampleText("es", "medium"));
  const [typed, setTyped] = useState("");
  const [status, setStatus] = useState<"idle" | "running" | "finished">("idle");
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [remainingSec, setRemainingSec] = useState(30);
  const [result, setResult] = useState<ReturnType<typeof computeTypingResult> | null>(null);
  const [historyEntries, setHistoryEntries] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wpmSamplesRef = useRef<number[]>([]);
  // Mirrors `typed` for the interval callback below, whose effect deliberately excludes `typed`
  // from its dependency array (so the interval isn't torn down and recreated on every keystroke) —
  // without this ref, that callback would read `typed` frozen at whatever it was when the effect
  // was created (real bug found by its own browser test: WPM samples and the duration-timeout
  // finish were both scored against a stale, usually near-empty typed length for the whole run).
  const typedRef = useRef(typed);
  useEffect(() => {
    typedRef.current = typed;
  }, [typed]);

  useEffect(() => {
    if (status !== "running" || startedAtMs === null) return;
    const id = setInterval(() => {
      const elapsedSec = (performance.now() - startedAtMs) / 1000;
      const remaining = Math.max(0, durationSec - elapsedSec);
      setRemainingSec(remaining);
      const currentWpm = Math.round(typedRef.current.length / 5 / Math.max(elapsedSec / 60, 1 / 3600));
      wpmSamplesRef.current.push(currentWpm);
      if (remaining <= 0) finish(elapsedSec, typedRef.current);
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, startedAtMs]);

  // Real bug found by its own browser test: when called synchronously right after setTyped(value)
  // (the same event that reaches the end of the target text), the `typed` STATE variable is still
  // one render behind — it doesn't yet include the character that just triggered completion. Every
  // real finish (not just a scripted paste) was silently scored one keystroke short. Accepting the
  // just-typed value explicitly removes the stale-closure read entirely.
  function finish(elapsedSec: number, typedValue: string) {
    setStatus("finished");
    const finalResult = computeTypingResult(targetText, typedValue, elapsedSec, wpmSamplesRef.current);
    setResult(finalResult);
    setHistoryEntries((prev) => [...prev, `${new Date().toLocaleTimeString()}: ${finalResult.wpm} PPM, ${finalResult.accuracyPercent}% precisión`]);
  }

  function handleChange(value: string) {
    if (status === "finished") return;
    if (status === "idle" && value.length > 0) {
      setStatus("running");
      setStartedAtMs(performance.now());
      wpmSamplesRef.current = [];
    }
    setTyped(value);
    if (value.length >= targetText.length) {
      const elapsedSec = startedAtMs !== null ? (performance.now() - startedAtMs) / 1000 : 0;
      finish(elapsedSec, value);
    }
  }

  function handleNewText() {
    const text = useCustom && customText.trim() ? customText.trim() : getSampleText(language, difficulty, Math.floor(Math.random() * 5));
    setTargetText(text);
    setTyped("");
    setStatus("idle");
    setStartedAtMs(null);
    setRemainingSec(durationSec);
    setResult(null);
    textareaRef.current?.focus();
  }

  function handleReset() {
    setTyped("");
    setStatus("idle");
    setStartedAtMs(null);
    setResult(null);
    setRemainingSec(durationSec);
  }

  const summary = result
    ? [`PPM (WPM): ${result.wpm}`, `CPM: ${result.cpm}`, `Precisión: ${result.accuracyPercent}%`, `Consistencia: ${result.consistencyPercent}%`, `Tiempo: ${result.elapsedSeconds.toFixed(1)}s`].join("\n")
    : "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {DURATIONS.map((d) => (
          <Button
            key={d}
            type="button"
            size="sm"
            variant={durationSec === d && !useCustom ? "default" : "outline"}
            onClick={() => {
              setDurationSec(d);
              setUseCustom(false);
              setRemainingSec(d);
            }}
            disabled={status === "running"}
          >
            {d}s
          </Button>
        ))}
        <Button type="button" size="sm" variant={useCustom ? "default" : "outline"} onClick={() => setUseCustom(true)} disabled={status === "running"}>
          Texto personalizado
        </Button>
      </div>

      {useCustom ? (
        <div>
          <Label htmlFor="typing-custom" className="mb-1">
            Texto personalizado
          </Label>
          <textarea id="typing-custom" value={customText} onChange={(e) => setCustomText(e.target.value)} rows={3} className="w-full rounded-md border p-2 text-sm" />
        </div>
      ) : (
        <div className="flex gap-2">
          <Button type="button" size="sm" variant={language === "es" ? "default" : "outline"} onClick={() => setLanguage("es")} disabled={status === "running"}>
            Español
          </Button>
          <Button type="button" size="sm" variant={language === "en" ? "default" : "outline"} onClick={() => setLanguage("en")} disabled={status === "running"}>
            English
          </Button>
          {(["easy", "medium", "hard"] as TypingDifficulty[]).map((d) => (
            <Button key={d} type="button" size="sm" variant={difficulty === d ? "default" : "outline"} onClick={() => setDifficulty(d)} disabled={status === "running"}>
              {d === "easy" ? "Fácil" : d === "medium" ? "Medio" : "Difícil"}
            </Button>
          ))}
        </div>
      )}

      <Button type="button" variant="outline" size="sm" onClick={handleNewText}>
        Nuevo texto
      </Button>

      <div aria-live="polite" className="rounded-lg border bg-muted/30 p-4 font-mono text-lg leading-relaxed">
        {[...targetText].map((ch, i) => {
          const typedCh = typed[i];
          const color = typedCh === undefined ? "text-muted-foreground" : typedCh === ch ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400 underline";
          return (
            <span key={i} className={color}>
              {ch}
            </span>
          );
        })}
      </div>

      <div>
        <Label htmlFor="typing-input" className="sr-only">
          Escribe aquí
        </Label>
        <textarea
          ref={textareaRef}
          id="typing-input"
          value={typed}
          onChange={(e) => handleChange(e.target.value)}
          disabled={status === "finished"}
          rows={3}
          className="w-full rounded-md border p-3 text-lg"
          placeholder="Empieza a escribir aquí..."
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>

      <p aria-live="polite" className="text-center text-2xl font-semibold">
        {status === "running" ? `${Math.ceil(remainingSec)}s` : status === "finished" ? "Terminado" : `${durationSec}s`}
      </p>

      {result ? (
        <div aria-live="polite" className="space-y-3 rounded-lg border p-4">
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <p>
              PPM: <strong>{result.wpm}</strong>
            </p>
            <p>CPM: {result.cpm}</p>
            <p>Precisión: {result.accuracyPercent}%</p>
            <p>Consistencia: {result.consistencyPercent}%</p>
            <p>Caracteres correctos: {result.correctChars}</p>
            <p>Caracteres incorrectos: {result.incorrectChars}</p>
          </div>
          <p className="text-xs text-muted-foreground">PPM = (caracteres correctos ÷ 5) ÷ minutos transcurridos.</p>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={summary} label="Copiar resultado" />
            <DownloadButton content={summary} filename="resultado-mecanografia.txt" label="Descargar resumen" />
          </div>
        </div>
      ) : null}

      {historyEntries.length > 0 ? (
        <div>
          <h2 className="text-sm font-semibold">Historial de esta sesión</h2>
          <ul className="text-sm text-muted-foreground">
            {historyEntries
              .slice()
              .reverse()
              .map((e, i) => (
                <li key={i}>{e}</li>
              ))}
          </ul>
        </div>
      ) : null}

      <ResetButton onReset={handleReset} />
    </div>
  );
}
