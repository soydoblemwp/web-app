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
import { WEB_CODE_LANGUAGES, guessWebCodeLanguage, type WebCodeLanguage, type WebCodeFormatResult } from "@/lib/public-tools/code-formatting/formatter-types";
import type { CodeFormattingWorkerRequest, CodeFormattingWorkerResponse } from "@/lib/public-tools/code-formatting/diagnostics";

const WORKER_TIMEOUT_MS = 8000;
const SAMPLE_CODE = "function greet(name){if(name){return 'Hola, '+name+'!'} return 'Hola!'}";

export function WebCodeFormatterTool() {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    workerRef.current?.terminate();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const [code, setCode] = useState(SAMPLE_CODE);
  const [language, setLanguage] = useState<WebCodeLanguage>("javascript");
  const [printWidth, setPrintWidth] = useState(80);
  const [useTabs, setUseTabs] = useState(false);
  const [tabWidth, setTabWidth] = useState(2);
  const [semi, setSemi] = useState(true);
  const [singleQuote, setSingleQuote] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState<{ message: string; line: number | null; column: number | null; snippet: string | null } | null>(null);
  const [running, setRunning] = useState(false);
  const suggested = guessWebCodeLanguage(code);

  function cancel() {
    workerRef.current?.terminate();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }

  function handleFormat() {
    setError(null);
    setOutput("");
    setRunning(true);
    cancel();

    const requestId = ++requestIdRef.current;
    const worker = new Worker(new URL("../../../lib/public-tools/code-formatting/formatting-worker.ts", import.meta.url));
    workerRef.current = worker;
    timeoutRef.current = setTimeout(() => {
      worker.terminate();
      setRunning(false);
      setError({ message: "El formateo tardó demasiado y se canceló (Worker terminado).", line: null, column: null, snippet: null });
    }, WORKER_TIMEOUT_MS);

    worker.onmessage = (event: MessageEvent<CodeFormattingWorkerResponse>) => {
      if (event.data.requestId !== requestId) return;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setRunning(false);
      const result = event.data.result as WebCodeFormatResult;
      if (!result.ok) setError(result.error ?? { message: "No se pudo formatear el código.", line: null, column: null, snippet: null });
      else setOutput(result.formatted ?? "");
      worker.terminate();
    };
    worker.postMessage({ requestId, job: { kind: "web-code", code, language, printWidth, useTabs, tabWidth, semi, singleQuote } } satisfies CodeFormattingWorkerRequest);
  }

  function handleImportFile(files: File[]) {
    const file = files[0];
    if (!file) return;
    file.text().then((text) => {
      setCode(text);
      setError(null);
      const ext = file.name.split(".").pop()?.toLowerCase();
      const byExt: Record<string, WebCodeLanguage> = { html: "html", css: "css", js: "javascript", mjs: "javascript", jsx: "jsx", ts: "typescript", tsx: "tsx" };
      if (ext && byExt[ext]) setLanguage(byExt[ext]);
    });
  }

  const extension = WEB_CODE_LANGUAGES.find((l) => l.id === language)?.extension ?? "txt";

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">Los datos se procesan en tu dispositivo y no se envían al servidor.</p>
      <p className="text-xs text-muted-foreground">Solo reformatea: nunca ejecuta el código, ni renderiza el HTML, ni evalúa expresiones.</p>

      <div className="grid gap-4 sm:grid-cols-4">
        <div>
          <Label htmlFor="webcode-lang" className="mb-1">
            Lenguaje {suggested !== language ? <span className="text-muted-foreground">(sugerido: {WEB_CODE_LANGUAGES.find((l) => l.id === suggested)?.label})</span> : null}
          </Label>
          <LabeledSelect id="webcode-lang" value={language} onValueChange={(v) => setLanguage(v as WebCodeLanguage)} options={WEB_CODE_LANGUAGES.map((l) => ({ value: l.id, label: l.label }))} className="w-full" />
        </div>
        <div>
          <Label htmlFor="webcode-width" className="mb-1">
            Ancho de línea
          </Label>
          <LabeledSelect id="webcode-width" value={String(printWidth)} onValueChange={(v) => setPrintWidth(Number(v))} options={[{ value: "80", label: "80" }, { value: "100", label: "100" }, { value: "120", label: "120" }]} className="w-full" />
        </div>
        <div>
          <Label htmlFor="webcode-tabwidth" className="mb-1">
            Ancho de indentación
          </Label>
          <LabeledSelect id="webcode-tabwidth" value={String(tabWidth)} onValueChange={(v) => setTabWidth(Number(v))} options={[{ value: "2", label: "2" }, { value: "4", label: "4" }]} className="w-full" />
        </div>
        <div className="flex flex-wrap items-center gap-3 self-end pb-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={useTabs} onCheckedChange={(c) => setUseTabs(Boolean(c))} /> Tabs
          </label>
          {language !== "html" && language !== "css" ? (
            <>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={semi} onCheckedChange={(c) => setSemi(Boolean(c))} /> Punto y coma
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={singleQuote} onCheckedChange={(c) => setSingleQuote(Boolean(c))} /> Comillas simples
              </label>
            </>
          ) : null}
        </div>
      </div>

      <div>
        <Label htmlFor="webcode-input" className="mb-1">
          Código de entrada
        </Label>
        <Textarea id="webcode-input" value={code} onChange={(e) => setCode(e.target.value)} rows={14} className="font-mono text-sm" spellCheck={false} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={handleFormat} disabled={running}>
          {running ? "Formateando…" : "Formatear"}
        </Button>
        {running ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              cancel();
              setRunning(false);
              setError({ message: "Formateo cancelado.", line: null, column: null, snippet: null });
            }}
          >
            Cancelar
          </Button>
        ) : null}
        <FileUploadZone accept=".html,.css,.js,.jsx,.ts,.tsx,text/plain" onFilesSelected={handleImportFile} label="o carga un archivo de código" hint="" />
      </div>

      {error ? (
        <div role="alert" className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <p>{error.message}</p>
          {error.line !== null ? (
            <p className="text-xs">
              Línea {error.line}
              {error.column !== null ? `, columna ${error.column}` : ""}
            </p>
          ) : null}
          {error.snippet ? <pre className="overflow-x-auto rounded bg-destructive/10 p-2 text-xs">{error.snippet}</pre> : null}
        </div>
      ) : null}

      {output ? (
        <div>
          <Label htmlFor="webcode-output" className="mb-1">
            Resultado
          </Label>
          <Textarea id="webcode-output" value={output} readOnly rows={16} className="font-mono text-sm" spellCheck={false} />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <CopyButton text={output} label="Copiar resultado" />
        <Button type="button" variant="outline" disabled={!output} onClick={() => downloadTextFile(`resultado.${extension}`, output)}>
          Descargar .{extension}
        </Button>
        <ResetButton
          onReset={() => {
            cancel();
            setCode("");
            setOutput("");
            setError(null);
          }}
        />
      </div>
    </div>
  );
}
