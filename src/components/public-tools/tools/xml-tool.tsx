"use client";

import { useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CopyButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import { downloadTextFile } from "@/lib/public-tools/csv-export";
import { formatJson } from "@/lib/public-tools/utilities/json-tool";
import type { XmlValidationResult, XmlFormatResult } from "@/lib/public-tools/data-formats/xml";
import type { XmlToJsonResult } from "@/lib/public-tools/data-formats/xml-json";
import type { DataFormatsWorkerRequest, DataFormatsWorkerResponse } from "@/lib/public-tools/data-formats/worker-protocol";

const WORKER_TIMEOUT_MS = 8000;
const SAMPLE_XML = '<?xml version="1.0"?>\n<catalog>\n<book id="1"><title>Ejemplo</title><price>9.99</price></book>\n</catalog>';

type Mode = "format" | "minify" | "validate" | "xml-to-json" | "json-to-xml";

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

export function XmlTool() {
  const { run, cancel } = useDataFormatsWorker();
  const [mode, setMode] = useState<Mode>("format");
  const [input, setInput] = useState(SAMPLE_XML);
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<XmlValidationResult["stats"] | null>(null);
  const [lostFeatures, setLostFeatures] = useState<string[]>([]);
  const [rootName, setRootName] = useState("root");
  const [running, setRunning] = useState(false);

  async function handleRun() {
    setError(null);
    setOutput("");
    setStats(null);
    setLostFeatures([]);
    setRunning(true);

    if (mode === "validate") {
      const response = await run({ kind: "validate-xml", text: input });
      setRunning(false);
      if (!response.ok) return setError("La validación tardó demasiado y se canceló (Worker terminado).");
      const result = response.result as XmlValidationResult;
      if (!result.ok) return setError(result.error?.message ?? "XML inválido.");
      setStats(result.stats ?? null);
      setOutput("El XML está bien formado.");
      return;
    }
    if (mode === "format" || mode === "minify") {
      const response = await run(mode === "format" ? { kind: "format-xml", text: input, indentBy: "  " } : { kind: "minify-xml", text: input });
      setRunning(false);
      if (!response.ok) return setError("El proceso tardó demasiado y se canceló (Worker terminado).");
      const result = response.result as XmlFormatResult;
      if (!result.ok) return setError(result.error?.message ?? "No se pudo procesar el XML.");
      setOutput(result.formatted ?? "");
      return;
    }
    if (mode === "xml-to-json") {
      const response = await run({ kind: "xml-to-json", text: input });
      setRunning(false);
      if (!response.ok) return setError("La conversión tardó demasiado y se canceló (Worker terminado).");
      const result = response.result as XmlToJsonResult;
      if (!result.ok) return setError(result.error?.message ?? "No se pudo convertir el XML a JSON.");
      setOutput(formatJson(result.value, "2"));
      setLostFeatures(result.lostFeatures);
      return;
    }
    // json-to-xml
    let value: unknown;
    try {
      value = JSON.parse(input);
    } catch (err) {
      setRunning(false);
      setError(`El JSON de entrada no es válido: ${err instanceof Error ? err.message : "error de análisis"}.`);
      return;
    }
    const response = await run({ kind: "json-to-xml", value, rootName, indentBy: "  " });
    setRunning(false);
    if (!response.ok) return setError("La conversión tardó demasiado y se canceló (Worker terminado).");
    const result = response.result as { ok: boolean; error?: string; xml?: string };
    if (!result.ok) return setError(result.error ?? "No se pudo convertir el JSON a XML.");
    setOutput(result.xml ?? "");
  }

  function handleImportFile(files: File[]) {
    const file = files[0];
    if (!file) return;
    file.text().then((text) => {
      setInput(text);
      setError(null);
      setMode(/\.json$/i.test(file.name) ? "json-to-xml" : "format");
    });
  }

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">Los datos se procesan en tu dispositivo y no se envían al servidor.</p>
      <p className="text-xs text-muted-foreground">Por seguridad, cualquier &lt;!DOCTYPE&gt; se rechaza por completo: nunca se procesan DTD ni entidades externas.</p>

      <div className="flex flex-wrap gap-2">
        {(["format", "minify", "validate", "xml-to-json", "json-to-xml"] as Mode[]).map((m) => (
          <Button key={m} type="button" variant={mode === m ? "default" : "outline"} size="sm" onClick={() => setMode(m)}>
            {{ format: "Formatear", minify: "Minificar", validate: "Validar", "xml-to-json": "XML → JSON", "json-to-xml": "JSON → XML" }[m]}
          </Button>
        ))}
      </div>

      {mode === "json-to-xml" ? (
        <div className="max-w-xs">
          <Label htmlFor="xml-root-name" className="mb-1">
            Nombre del elemento raíz (si el JSON tiene varias claves)
          </Label>
          <Input id="xml-root-name" value={rootName} onChange={(e) => setRootName(e.target.value)} />
        </div>
      ) : null}

      <div>
        <Label htmlFor="xml-input" className="mb-1">
          {mode === "json-to-xml" ? "JSON de entrada" : "XML de entrada"}
        </Label>
        <Textarea id="xml-input" value={input} onChange={(e) => setInput(e.target.value)} rows={14} className="font-mono text-sm" spellCheck={false} />
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
        <FileUploadZone accept=".xml,.json,application/xml,text/xml,application/json" onFilesSelected={handleImportFile} label="o carga un archivo .xml o .json" hint="" />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {stats ? (
        <div aria-live="polite" className="grid gap-1 rounded-lg border p-3 text-sm sm:grid-cols-2">
          <p>Elementos: {stats.elements}</p>
          <p>Atributos: {stats.attributes}</p>
          <p>Profundidad máxima: {stats.maxDepth}</p>
          <p>Namespaces: {stats.namespacePrefixes.length > 0 ? stats.namespacePrefixes.join(", ") : "ninguno"}</p>
        </div>
      ) : null}

      {lostFeatures.length > 0 ? (
        <div aria-live="polite" className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <p>JSON no conserva: {lostFeatures.join("; ")}.</p>
        </div>
      ) : null}

      {output ? (
        <div>
          <Label htmlFor="xml-output" className="mb-1">
            Resultado
          </Label>
          <Textarea id="xml-output" value={output} readOnly rows={14} className="font-mono text-sm" spellCheck={false} />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <CopyButton text={output} label="Copiar resultado" />
        <Button type="button" variant="outline" disabled={!output} onClick={() => downloadTextFile(mode === "xml-to-json" ? "resultado.json" : "resultado.xml", output, mode === "xml-to-json" ? "application/json;charset=utf-8" : "application/xml;charset=utf-8")}>
          Descargar
        </Button>
        <ResetButton
          onReset={() => {
            cancel();
            setInput("");
            setOutput("");
            setError(null);
            setStats(null);
            setLostFeatures([]);
          }}
        />
      </div>
    </div>
  );
}
