"use client";

import { useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { LabeledSelect } from "@/components/ui/select";
import { CopyButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import { downloadTextFile } from "@/lib/public-tools/csv-export";
import { formatJson, minifyJson, sortJsonKeysDeep, type JsonIndent } from "@/lib/public-tools/utilities/json-tool";
import type { YamlToJsonResult } from "@/lib/public-tools/data-formats/yaml";
import type { DataFormatsWorkerRequest, DataFormatsWorkerResponse } from "@/lib/public-tools/data-formats/worker-protocol";

const WORKER_TIMEOUT_MS = 8000;

type Mode = "yaml-to-json" | "json-to-yaml";

function useDataFormatsWorker() {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
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

export function YamlJsonTool() {
  const { run, cancel } = useDataFormatsWorker();
  const [mode, setMode] = useState<Mode>("yaml-to-json");
  const [input, setInput] = useState("name: Ejemplo\nversion: 1\ntags:\n  - alpha\n  - beta\nactive: true\n");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [lostFeatures, setLostFeatures] = useState<string[]>([]);
  const [largeIntegers, setLargeIntegers] = useState<{ path: string; raw: string }[]>([]);
  const [running, setRunning] = useState(false);
  const [indent, setIndent] = useState<JsonIndent>("2");
  const [minify, setMinify] = useState(false);
  const [sortKeys, setSortKeys] = useState(false);
  const [allowMultipleDocuments, setAllowMultipleDocuments] = useState(false);
  const [largeIntegerStrategy, setLargeIntegerStrategy] = useState<"string" | "reject">("string");

  async function handleConvert() {
    setError(null);
    setWarnings([]);
    setLostFeatures([]);
    setLargeIntegers([]);
    setOutput("");
    setRunning(true);

    if (mode === "yaml-to-json") {
      const response = await run({ kind: "yaml-to-json", text: input, options: { allowMultipleDocuments, largeIntegerStrategy } });
      setRunning(false);
      if (!response.ok) {
        setError("La conversión tardó demasiado y se canceló (Worker terminado).");
        return;
      }
      const result = response.result as YamlToJsonResult;
      if (!result.ok) {
        setError(result.error?.message ?? "No se pudo convertir el YAML.");
        return;
      }
      setWarnings(result.warnings);
      setLostFeatures(result.lostFeatures);
      setLargeIntegers(result.largeIntegers);
      const value = result.documents ?? result.value;
      const sorted = sortKeys ? sortJsonKeysDeep(value) : value;
      setOutput(minify ? minifyJson(sorted) : formatJson(sorted, indent));
    } else {
      let value: unknown;
      try {
        value = JSON.parse(input);
      } catch (err) {
        setRunning(false);
        setError(`El JSON de entrada no es válido: ${err instanceof Error ? err.message : "error de análisis"}.`);
        return;
      }
      const response = await run({ kind: "json-to-yaml", value, indent: indent === "tab" ? 2 : Number(indent) });
      setRunning(false);
      if (!response.ok) {
        setError("La conversión tardó demasiado y se canceló (Worker terminado).");
        return;
      }
      const result = response.result as { ok: boolean; error?: string; yaml?: string };
      if (!result.ok) {
        setError(result.error ?? "No se pudo convertir a YAML.");
        return;
      }
      setOutput(result.yaml ?? "");
    }
  }

  function handleImportFile(files: File[]) {
    const file = files[0];
    if (!file) return;
    file.text().then((text) => {
      setInput(text);
      setError(null);
      if (/\.json$/i.test(file.name)) setMode("json-to-yaml");
      else setMode("yaml-to-json");
    });
  }

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">Los datos se procesan en tu dispositivo y no se envían al servidor.</p>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant={mode === "yaml-to-json" ? "default" : "outline"} size="sm" onClick={() => setMode("yaml-to-json")}>
          YAML → JSON
        </Button>
        <Button type="button" variant={mode === "json-to-yaml" ? "default" : "outline"} size="sm" onClick={() => setMode("json-to-yaml")}>
          JSON → YAML
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="yaml-indent" className="mb-1">
            Indentación (JSON)
          </Label>
          <LabeledSelect id="yaml-indent" value={indent} onValueChange={(v) => setIndent(v as JsonIndent)} options={[{ value: "2", label: "2 espacios" }, { value: "4", label: "4 espacios" }, { value: "tab", label: "Tabulación" }]} className="w-full" />
        </div>
        {mode === "yaml-to-json" ? (
          <div>
            <Label htmlFor="yaml-large-int" className="mb-1">
              Enteros fuera de rango seguro
            </Label>
            <LabeledSelect id="yaml-large-int" value={largeIntegerStrategy} onValueChange={(v) => setLargeIntegerStrategy(v as "string" | "reject")} options={[{ value: "string", label: "Preservar como texto" }, { value: "reject", label: "Rechazar" }]} className="w-full" />
          </div>
        ) : null}
      </div>

      {mode === "yaml-to-json" ? (
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={minify} onCheckedChange={(c) => setMinify(Boolean(c))} /> Minificar JSON de salida
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={sortKeys} onCheckedChange={(c) => setSortKeys(Boolean(c))} /> Ordenar claves alfabéticamente
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={allowMultipleDocuments} onCheckedChange={(c) => setAllowMultipleDocuments(Boolean(c))} /> Permitir varios documentos YAML (separados por &quot;---&quot;)
          </label>
        </div>
      ) : null}

      <div>
        <Label htmlFor="yaml-input" className="mb-1">
          {mode === "yaml-to-json" ? "YAML de entrada" : "JSON de entrada"}
        </Label>
        <Textarea id="yaml-input" value={input} onChange={(e) => setInput(e.target.value)} rows={14} className="font-mono text-sm" spellCheck={false} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={handleConvert} disabled={running}>
          {running ? "Procesando…" : "Convertir"}
        </Button>
        {running ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              cancel();
              setRunning(false);
              setError("Conversión cancelada.");
            }}
          >
            Cancelar
          </Button>
        ) : null}
        <FileUploadZone accept=".yaml,.yml,.json,text/yaml,application/json" onFilesSelected={handleImportFile} label="o carga un archivo .yaml, .yml o .json" hint="" />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {warnings.length > 0 || lostFeatures.length > 0 || largeIntegers.length > 0 ? (
        <div aria-live="polite" className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          {warnings.map((w, i) => (
            <p key={`w-${i}`}>{w}</p>
          ))}
          {lostFeatures.length > 0 ? <p>JSON no puede representar: {lostFeatures.join(", ")}. No es un round trip perfecto.</p> : null}
          {largeIntegers.length > 0 ? <p>Enteros fuera del rango seguro de JSON preservados como texto: {largeIntegers.map((l) => `${l.path}=${l.raw}`).join(", ")}.</p> : null}
        </div>
      ) : null}

      {output ? (
        <div>
          <Label htmlFor="yaml-output" className="mb-1">
            Resultado
          </Label>
          <Textarea id="yaml-output" value={output} readOnly rows={14} className="font-mono text-sm" spellCheck={false} />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <CopyButton text={output} label="Copiar resultado" />
        <Button type="button" variant="outline" disabled={!output} onClick={() => downloadTextFile(mode === "yaml-to-json" ? "resultado.json" : "resultado.yaml", output, mode === "yaml-to-json" ? "application/json;charset=utf-8" : "text/yaml;charset=utf-8")}>
          Descargar
        </Button>
        <ResetButton
          onReset={() => {
            cancel();
            setInput("");
            setOutput("");
            setError(null);
            setWarnings([]);
            setLostFeatures([]);
            setLargeIntegers([]);
          }}
        />
      </div>
    </div>
  );
}
