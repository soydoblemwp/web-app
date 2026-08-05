"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CopyButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { validateFlags, analyzeRedosRisk, isVFlagSupported, REGEX_LIMITS, type RegexMatchResult } from "@/lib/public-tools/development/regex";
import type { RegexWorkerRequest, RegexWorkerResponse } from "@/lib/public-tools/development/regex-worker";

const ALL_FLAGS = ["g", "i", "m", "s", "u", "y", "d"] as const;

type RunState = { status: "idle" } | { status: "running" } | { status: "timeout" } | { status: "error"; message: string } | { status: "match"; matches: RegexMatchResult[]; truncated: boolean; durationMs: number } | { status: "replace"; replaced: string; durationMs: number };

export function RegexTesterTool() {
  const [pattern, setPattern] = useState("");
  const [flags, setFlags] = useState<Set<string>>(new Set(["g"]));
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"match" | "replace">("match");
  const [replacement, setReplacement] = useState("");
  const [timeoutMs, setTimeoutMs] = useState<number>(REGEX_LIMITS.defaultTimeoutMs);
  const [state, setState] = useState<RunState>({ status: "idle" });

  const workerRef = useRef<Worker | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  function toggleFlag(flag: string) {
    setFlags((prev) => {
      const next = new Set(prev);
      if (next.has(flag)) next.delete(flag);
      else next.add(flag);
      return next;
    });
  }

  const flagsString = Array.from(flags).join("");
  const flagCheck = validateFlags(flagsString);
  const redosHint = analyzeRedosRisk(pattern);

  function cleanupRun() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    workerRef.current?.terminate();
    workerRef.current = null;
  }

  function handleCancel() {
    cleanupRun();
    setState({ status: "idle" });
  }

  function handleRun() {
    cleanupRun();
    if (!flagCheck.ok) {
      setState({ status: "error", message: flagCheck.error ?? "Flags inválidos." });
      return;
    }
    if (pattern.length > REGEX_LIMITS.maxPatternLength) {
      setState({ status: "error", message: `El patrón supera el límite de ${REGEX_LIMITS.maxPatternLength} caracteres.` });
      return;
    }
    if (text.length > REGEX_LIMITS.maxTextLength) {
      setState({ status: "error", message: `El texto supera el límite de ${REGEX_LIMITS.maxTextLength.toLocaleString("es-ES")} caracteres.` });
      return;
    }

    const requestId = ++requestIdRef.current;
    setState({ status: "running" });

    // The regex NEVER runs on this main thread — it always executes inside regex-worker.ts, which the
    // browser schedules on its own thread. If the pattern is catastrophically slow, that worker's thread
    // hangs (synchronous JS can't be preempted from inside), so the ONLY way to recover is to terminate
    // it from here after `timeoutMs` — exactly what this setTimeout does.
    const worker = new Worker(new URL("../../../lib/public-tools/development/regex-worker.ts", import.meta.url));
    workerRef.current = worker;

    timeoutRef.current = setTimeout(() => {
      cleanupRun();
      setState({ status: "timeout" });
    }, timeoutMs);

    worker.onmessage = (event: MessageEvent<RegexWorkerResponse>) => {
      if (event.data.requestId !== requestId) return;
      cleanupRun();
      const data = event.data;
      if (!data.ok) {
        setState({ status: "error", message: data.error ?? "Error al ejecutar la expresión." });
        return;
      }
      if (mode === "replace") {
        setState({ status: "replace", replaced: data.replaced ?? "", durationMs: data.durationMs });
      } else {
        setState({ status: "match", matches: data.matches ?? [], truncated: Boolean(data.truncated), durationMs: data.durationMs });
      }
    };

    const request: RegexWorkerRequest = { requestId, pattern, flags: flagsString, text, mode, replacement, maxMatches: REGEX_LIMITS.maxMatches };
    worker.postMessage(request);
  }

  function handleReset() {
    cleanupRun();
    setPattern("");
    setText("");
    setReplacement("");
    setState({ status: "idle" });
  }

  return (
    <div className="space-y-6">
      <div>
        <Label htmlFor="regex-pattern" className="mb-1">
          Patrón
        </Label>
        <Input id="regex-pattern" value={pattern} onChange={(e) => setPattern(e.target.value)} className="font-mono" placeholder="\d+" />
      </div>

      <fieldset className="flex flex-wrap gap-3">
        <legend className="mb-1 w-full text-sm font-medium">Flags</legend>
        {ALL_FLAGS.map((flag) => (
          <label key={flag} className="flex items-center gap-1 text-sm">
            <Checkbox checked={flags.has(flag)} onCheckedChange={() => toggleFlag(flag)} />
            {flag}
          </label>
        ))}
        {isVFlagSupported() ? (
          <label className="flex items-center gap-1 text-sm">
            <Checkbox checked={flags.has("v")} onCheckedChange={() => toggleFlag("v")} />v
          </label>
        ) : null}
      </fieldset>
      {!flagCheck.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {flagCheck.error}
        </p>
      ) : null}

      {redosHint.reasons.length > 0 ? (
        <div role="alert" className="space-y-1 rounded-lg border border-amber-400/40 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          <p className="font-medium">Advertencia heurística de rendimiento</p>
          <ul className="list-disc pl-5">
            {redosHint.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <p className="text-xs">Esta comprobación es heurística; no detecta todas las vulnerabilidades ReDoS posibles.</p>
        </div>
      ) : null}

      <div>
        <Label htmlFor="regex-text" className="mb-1">
          Texto de prueba
        </Label>
        <Textarea id="regex-text" value={text} onChange={(e) => setText(e.target.value)} rows={6} className="font-mono text-sm" />
      </div>

      <div className="flex gap-2">
        <Button type="button" variant={mode === "match" ? "default" : "outline"} size="sm" onClick={() => setMode("match")}>
          Coincidencias
        </Button>
        <Button type="button" variant={mode === "replace" ? "default" : "outline"} size="sm" onClick={() => setMode("replace")}>
          Reemplazar
        </Button>
      </div>
      {mode === "replace" ? (
        <div>
          <Label htmlFor="regex-replacement" className="mb-1">
            Reemplazo (admite $1, $&amp;, $&lt;nombre&gt;)
          </Label>
          <Input id="regex-replacement" value={replacement} onChange={(e) => setReplacement(e.target.value)} className="font-mono" />
        </div>
      ) : null}

      <div>
        <Label htmlFor="regex-timeout" className="mb-1">
          Timeout: {timeoutMs} ms
        </Label>
        <Input
          id="regex-timeout"
          type="range"
          min={REGEX_LIMITS.minTimeoutMs}
          max={REGEX_LIMITS.maxTimeoutMs}
          step={100}
          value={timeoutMs}
          onChange={(e) => setTimeoutMs(Number(e.target.value))}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={handleRun} disabled={state.status === "running" || !pattern}>
          {state.status === "running" ? "Ejecutando..." : "Ejecutar"}
        </Button>
        {state.status === "running" ? (
          <Button type="button" variant="outline" onClick={handleCancel}>
            Cancelar
          </Button>
        ) : null}
      </div>

      <div aria-live="polite">
        {state.status === "timeout" ? (
          <p role="alert" className="text-sm text-destructive">
            TIMEOUT: el patrón tardó demasiado y se terminó el Web Worker. Puede que el patrón sea demasiado costoso; revisa la advertencia heurística anterior. No se ha vuelto a ejecutar automáticamente.
          </p>
        ) : null}
        {state.status === "error" ? (
          <p role="alert" className="text-sm text-destructive">
            {state.message}
          </p>
        ) : null}
        {state.status === "match" ? (
          <div className="space-y-2 rounded-lg border p-4 text-sm">
            <p>
              {state.matches.length} coincidencia(s) en {state.durationMs.toFixed(1)} ms{state.truncated ? " (resultado truncado por el límite)" : ""}
            </p>
            <ul className="max-h-72 space-y-2 overflow-y-auto">
              {state.matches.map((m, i) => (
                <li key={i} className="rounded border p-2">
                  <p>
                    Coincidencia {i + 1} en índice {m.index}: <code className="rounded bg-muted px-1">{m.fullMatch}</code>
                  </p>
                  {m.groups.length > 0 ? (
                    <ul className="pl-4 text-xs text-muted-foreground">
                      {m.groups.map((g, gi) => (
                        <li key={gi}>
                          {g.name ? `$<${g.name}>` : `Grupo ${gi + 1}`}: {g.value ?? "(sin coincidencia)"}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {state.status === "replace" ? (
          <div className="space-y-2">
            <Label htmlFor="regex-replace-output" className="mb-1">
              Resultado ({state.durationMs.toFixed(1)} ms)
            </Label>
            <Textarea id="regex-replace-output" readOnly value={state.replaced} rows={6} className="font-mono text-sm" />
            <CopyButton text={state.replaced} label="Copiar resultado" />
          </div>
        ) : null}
      </div>

      <ResetButton onReset={handleReset} />
    </div>
  );
}
