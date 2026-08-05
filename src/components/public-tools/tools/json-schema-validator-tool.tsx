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
import { JSON_SCHEMA_DRAFTS, type JsonSchemaDraft, type JsonSchemaValidationResult, type AdditionalSchema } from "@/lib/public-tools/data-formats/json-schema-validator";
import type { JsonSchemaWorkerRequest, JsonSchemaWorkerResponse } from "@/lib/public-tools/data-formats/json-schema-worker";

const WORKER_TIMEOUT_MS = 8000;
const SAMPLE_SCHEMA = '{\n  "type": "object",\n  "required": ["name"],\n  "properties": {\n    "name": { "type": "string" },\n    "age": { "type": "number", "minimum": 0 }\n  }\n}';
const SAMPLE_INSTANCE = '{\n  "name": "Ada",\n  "age": -1\n}';

export function JsonSchemaValidatorTool() {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    workerRef.current?.terminate();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const [schemaText, setSchemaText] = useState(SAMPLE_SCHEMA);
  const [instanceText, setInstanceText] = useState(SAMPLE_INSTANCE);
  const [draft, setDraft] = useState<JsonSchemaDraft>("2020-12");
  const [additionalSchemas, setAdditionalSchemas] = useState<AdditionalSchema[]>([]);
  const [result, setResult] = useState<JsonSchemaValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [activeErrorIndex, setActiveErrorIndex] = useState(0);

  function cancel() {
    workerRef.current?.terminate();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }

  function handleValidate() {
    setError(null);
    setResult(null);
    setActiveErrorIndex(0);
    setRunning(true);
    cancel();

    const requestId = ++requestIdRef.current;
    const worker = new Worker(new URL("../../../lib/public-tools/data-formats/json-schema-worker.ts", import.meta.url));
    workerRef.current = worker;
    timeoutRef.current = setTimeout(() => {
      worker.terminate();
      setRunning(false);
      setError("La validación tardó demasiado y se canceló (Worker terminado).");
    }, WORKER_TIMEOUT_MS);

    worker.onmessage = (event: MessageEvent<JsonSchemaWorkerResponse>) => {
      if (event.data.requestId !== requestId) return;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setRunning(false);
      const r = event.data.result;
      if (!r.ok) setError(r.error ?? "No se pudo validar.");
      else setResult(r);
      worker.terminate();
    };
    worker.postMessage({ requestId, schemaText, instanceText, draft, additionalSchemas } satisfies JsonSchemaWorkerRequest);
  }

  function handleFormatSchema() {
    try {
      setSchemaText(formatJson(JSON.parse(schemaText), "2"));
    } catch {
      setError("El schema no es JSON válido; no se pudo formatear.");
    }
  }
  function handleFormatInstance() {
    try {
      setInstanceText(formatJson(JSON.parse(instanceText), "2"));
    } catch {
      setError("La instancia no es JSON válida; no se pudo formatear.");
    }
  }

  function handleImportSchema(files: File[]) {
    const file = files[0];
    if (!file) return;
    file.text().then((text) => setSchemaText(text));
  }
  function handleImportInstance(files: File[]) {
    const file = files[0];
    if (!file) return;
    file.text().then((text) => setInstanceText(text));
  }
  function handleAddAdditionalSchemaFile(files: File[]) {
    for (const file of files) {
      file.text().then((text) => setAdditionalSchemas((prev) => [...prev, { id: file.name, text }]));
    }
  }

  const errors = result?.errors ?? [];
  const report = result ? `Válido: ${result.valid ? "sí" : "no"}\n${errors.map((e) => `- [${e.instanceLocation}] ${e.message} (${e.keywordLocation})`).join("\n")}` : "";

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">Los datos se procesan en tu dispositivo y no se envían al servidor.</p>
      <p className="text-xs text-muted-foreground">Los $ref remotos nunca se descargan. Solo se resuelven referencias internas del propio schema o de los schemas adicionales que pegues/cargues aquí.</p>

      <div className="max-w-xs">
        <Label htmlFor="schema-draft" className="mb-1">
          Draft
        </Label>
        <LabeledSelect id="schema-draft" value={draft} onValueChange={(v) => setDraft(v as JsonSchemaDraft)} options={JSON_SCHEMA_DRAFTS.map((d) => ({ value: d.id, label: d.label }))} className="w-full" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <Label htmlFor="schema-text">JSON Schema</Label>
            <Button type="button" variant="ghost" size="sm" onClick={handleFormatSchema}>
              Formatear
            </Button>
          </div>
          <Textarea id="schema-text" value={schemaText} onChange={(e) => setSchemaText(e.target.value)} rows={14} className="font-mono text-sm" spellCheck={false} />
          <FileUploadZone accept="application/json" onFilesSelected={handleImportSchema} label="o carga el schema" hint="" />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <Label htmlFor="instance-text">Instancia JSON</Label>
            <Button type="button" variant="ghost" size="sm" onClick={handleFormatInstance}>
              Formatear
            </Button>
          </div>
          <Textarea id="instance-text" value={instanceText} onChange={(e) => setInstanceText(e.target.value)} rows={14} className="font-mono text-sm" spellCheck={false} />
          <FileUploadZone accept="application/json" onFilesSelected={handleImportInstance} label="o carga la instancia" hint="" />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Schemas adicionales (para $ref locales, nunca remotos)</Label>
        <FileUploadZone accept="application/json" multiple onFilesSelected={handleAddAdditionalSchemaFile} label="Cargar schemas adicionales" hint="" />
        {additionalSchemas.length > 0 ? (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {additionalSchemas.map((s, i) => (
              <li key={s.id} className="flex items-center gap-2">
                {s.id}
                <Button type="button" variant="ghost" size="sm" onClick={() => setAdditionalSchemas((prev) => prev.filter((_, idx) => idx !== i))}>
                  Quitar
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={handleValidate} disabled={running}>
          {running ? "Validando…" : "Validar"}
        </Button>
        {running ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              cancel();
              setRunning(false);
              setError("Validación cancelada.");
            }}
          >
            Cancelar
          </Button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {result ? (
        <div aria-live="polite" className="space-y-3 rounded-lg border p-4 text-sm">
          <p>
            {result.valid ? (
              <strong className="text-green-700 dark:text-green-400">La instancia CUMPLE el schema.</strong>
            ) : (
              <strong className="text-destructive">La instancia NO cumple el schema ({errors.length} error{errors.length === 1 ? "" : "es"}{result.truncated ? `, mostrando los primeros ${errors.length}` : ""}).</strong>
            )}
          </p>
          {errors.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" disabled={activeErrorIndex === 0} onClick={() => setActiveErrorIndex((i) => Math.max(0, i - 1))}>
                  Anterior
                </Button>
                <span className="text-xs text-muted-foreground">
                  Error {activeErrorIndex + 1} de {errors.length}
                </span>
                <Button type="button" variant="outline" size="sm" disabled={activeErrorIndex >= errors.length - 1} onClick={() => setActiveErrorIndex((i) => Math.min(errors.length - 1, i + 1))}>
                  Siguiente
                </Button>
              </div>
              <div className="rounded-md border p-3">
                <p>{errors[activeErrorIndex].message}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Ubicación en la instancia: <code>{errors[activeErrorIndex].instanceLocation || "#"}</code>
                </p>
                <p className="text-xs text-muted-foreground">
                  Palabra clave del schema: <code>{errors[activeErrorIndex].keywordLocation}</code>
                </p>
              </div>
              <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
                {errors.map((e, i) => (
                  <li key={i}>
                    <button type="button" className={`text-left underline-offset-2 hover:underline ${i === activeErrorIndex ? "font-semibold" : ""}`} onClick={() => setActiveErrorIndex(i)}>
                      [{e.instanceLocation || "#"}] {e.message}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <CopyButton text={report} label="Copiar informe" />
        <Button type="button" variant="outline" disabled={!report} onClick={() => downloadTextFile("informe-json-schema.txt", report)}>
          Descargar TXT
        </Button>
        <Button type="button" variant="outline" disabled={!result} onClick={() => downloadTextFile("informe-json-schema.json", JSON.stringify(result, null, 2), "application/json;charset=utf-8")}>
          Descargar JSON
        </Button>
        <ResetButton
          onReset={() => {
            cancel();
            setSchemaText("");
            setInstanceText("");
            setResult(null);
            setError(null);
            setAdditionalSchemas([]);
            setActiveErrorIndex(0);
          }}
        />
      </div>
    </div>
  );
}
