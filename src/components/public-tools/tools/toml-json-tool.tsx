"use client";

import { useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LabeledSelect } from "@/components/ui/select";
import { CopyButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import { downloadTextFile } from "@/lib/public-tools/csv-export";
import { formatJson } from "@/lib/public-tools/utilities/json-tool";
import type { TomlToJsonResult } from "@/lib/public-tools/data-formats/toml";
import type { DataFormatsWorkerRequest, DataFormatsWorkerResponse } from "@/lib/public-tools/data-formats/worker-protocol";

const WORKER_TIMEOUT_MS = 8000;
const SAMPLE_TOML = 'title = "Ejemplo"\nversion = 1\n\n[owner]\nname = "Ana"\ncreated = 1979-05-27T07:32:00Z\n\n[[servers]]\nhost = "alpha"\n\n[[servers]]\nhost = "beta"\n';

type Mode = "toml-to-json" | "json-to-toml" | "format";

function useDataFormatsWorker() {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    workerRef.current?.terminate();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  function run(job: DataFormatsWorkerRequest["job"]): Promise<{ ok: true; result: unknown } | { ok: false; error: "timeout" }> {
    return new Promise((resolve) => {
      workerRef.current?.terminate();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      const requestId = ++requestIdRef.current;
      const worker = new Worker(new URL("../../../lib/public-tools/data-formats/data-formats-worker.ts", import.meta.url));
      workerRef.current = worker;
      timeoutRef.current = setTimeout(() => {
        worker.terminate();
        resolve({ ok: false, error: "timeout" });
      }, WORKER_TIMEOUT_MS);
      worker.onmessage = (event: MessageEvent<DataFormatsWorkerResponse>) => {
        if (event.data.requestId !== requestId) return;
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        resolve({ ok: true, result: event.data.result });
        worker.terminate();
      };
      worker.postMessage({ requestId, job } satisfies DataFormatsWorkerRequest);
    });
  }
  function cancel() {
    workerRef.current?.terminate();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }
  return { run, cancel };
}

export function TomlJsonTool() {
  const { run, cancel } = useDataFormatsWorker();
  const [mode, setMode] = useState<Mode>("toml-to-json");
  const [input, setInput] = useState(SAMPLE_TOML);
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [largeIntegerStrategy, setLargeIntegerStrategy] = useState<"string" | "reject">("string");
  const [dateNote, setDateNote] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function handleRun() {
    setError(null);
    setOutput("");
    setDateNote(null);
    setRunning(true);

    if (mode === "toml-to-json" || mode === "format") {
      const response = mode === "format" ? await run({ kind: "format-toml", text: input }) : await run({ kind: "toml-to-json", text: input, options: { largeIntegerStrategy } });
      setRunning(false);
      if (!response.ok) return setError("La conversión tardó demasiado y se canceló (Worker terminado).");
      if (mode === "format") {
        const result = response.result as { ok: boolean; error?: { message: string }; formatted?: string };
        if (!result.ok) return setError(result.error?.message ?? "No se pudo formatear el TOML.");
        setOutput(result.formatted ?? "");
        return;
      }
      const result = response.result as TomlToJsonResult;
      if (!result.ok) return setError(result.error?.message ?? "No se pudo convertir el TOML.");
      setOutput(formatJson(result.value, "2"));
      setDateNote(result.dateStrategyNote);
      return;
    }

    let value: unknown;
    try {
      value = JSON.parse(input);
    } catch (err) {
      setRunning(false);
      setError(`El JSON de entrada no es válido: ${err instanceof Error ? err.message : "error de análisis"}.`);
      return;
    }
    const response = await run({ kind: "json-to-toml", value });
    setRunning(false);
    if (!response.ok) return setError("La conversión tardó demasiado y se canceló (Worker terminado).");
    const result = response.result as { ok: boolean; error?: string; toml?: string };
    if (!result.ok) return setError(result.error ?? "No se pudo convertir el JSON a TOML.");
    setOutput(result.toml ?? "");
  }

  function handleImportFile(files: File[]) {
    const file = files[0];
    if (!file) return;
    file.text().then((text) => {
      setInput(text);
      setError(null);
      setMode(/\.json$/i.test(file.name) ? "json-to-toml" : "toml-to-json");
    });
  }

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">Los datos se procesan en tu dispositivo y no se envían al servidor.</p>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant={mode === "toml-to-json" ? "default" : "outline"} size="sm" onClick={() => setMode("toml-to-json")}>
          TOML → JSON
        </Button>
        <Button type="button" variant={mode === "json-to-toml" ? "default" : "outline"} size="sm" onClick={() => setMode("json-to-toml")}>
          JSON → TOML
        </Button>
        <Button type="button" variant={mode === "format" ? "default" : "outline"} size="sm" onClick={() => setMode("format")}>
          Formatear TOML
        </Button>
      </div>

      {mode === "toml-to-json" ? (
        <div className="max-w-xs">
          <Label htmlFor="toml-large-int" className="mb-1">
            Enteros fuera de rango seguro
          </Label>
          <LabeledSelect id="toml-large-int" value={largeIntegerStrategy} onValueChange={(v) => setLargeIntegerStrategy(v as "string" | "reject")} options={[{ value: "string", label: "Preservar como texto" }, { value: "reject", label: "Rechazar" }]} className="w-full" />
        </div>
      ) : null}

      <div>
        <Label htmlFor="toml-input" className="mb-1">
          {mode === "json-to-toml" ? "JSON de entrada" : "TOML de entrada"}
        </Label>
        <Textarea id="toml-input" value={input} onChange={(e) => setInput(e.target.value)} rows={14} className="font-mono text-sm" spellCheck={false} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={handleRun} disabled={running}>
          {running ? "Procesando…" : "Ejecutar"}
        </Button>
        {running ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              cancel();
              setRunning(false);
              setError("Proceso cancelado.");
            }}
          >
            Cancelar
          </Button>
        ) : null}
        <FileUploadZone accept=".toml,.json,application/toml,application/json" onFilesSelected={handleImportFile} label="o carga un archivo .toml o .json" hint="" />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {dateNote ? <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">{dateNote}</p> : null}

      {output ? (
        <div>
          <Label htmlFor="toml-output" className="mb-1">
            Resultado
          </Label>
          <Textarea id="toml-output" value={output} readOnly rows={14} className="font-mono text-sm" spellCheck={false} />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <CopyButton text={output} label="Copiar resultado" />
        <Button type="button" variant="outline" disabled={!output} onClick={() => downloadTextFile(mode === "toml-to-json" ? "resultado.json" : "resultado.toml", output, mode === "toml-to-json" ? "application/json;charset=utf-8" : "application/toml;charset=utf-8")}>
          Descargar
        </Button>
        <ResetButton
          onReset={() => {
            cancel();
            setInput("");
            setOutput("");
            setError(null);
            setDateNote(null);
          }}
        />
      </div>
    </div>
  );
}
