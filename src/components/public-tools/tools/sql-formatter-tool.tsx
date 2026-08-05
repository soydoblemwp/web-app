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
import { SQL_DIALECTS, type SqlDialect, type KeywordCase, type SqlFormatResult } from "@/lib/public-tools/code-formatting/sql";
import type { CodeFormattingWorkerRequest, CodeFormattingWorkerResponse } from "@/lib/public-tools/code-formatting/diagnostics";

const WORKER_TIMEOUT_MS = 8000;
const SAMPLE_SQL = "SELECT a.id, a.name, b.total FROM accounts a JOIN balances b ON a.id = b.account_id WHERE b.total > 100 ORDER BY b.total DESC;";

export function SqlFormatterTool() {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    workerRef.current?.terminate();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const [sql, setSql] = useState(SAMPLE_SQL);
  const [dialect, setDialect] = useState<SqlDialect>("sql");
  const [tabWidth, setTabWidth] = useState(2);
  const [useTabs, setUseTabs] = useState(false);
  const [keywordCase, setKeywordCase] = useState<KeywordCase>("upper");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [statementCount, setStatementCount] = useState<number | null>(null);
  const [running, setRunning] = useState(false);

  function cancel() {
    workerRef.current?.terminate();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }

  function handleFormat() {
    setError(null);
    setOutput("");
    setStatementCount(null);
    setRunning(true);
    cancel();

    const requestId = ++requestIdRef.current;
    const worker = new Worker(new URL("../../../lib/public-tools/code-formatting/formatting-worker.ts", import.meta.url));
    workerRef.current = worker;
    timeoutRef.current = setTimeout(() => {
      worker.terminate();
      setRunning(false);
      setError("El formateo tardó demasiado y se canceló (Worker terminado).");
    }, WORKER_TIMEOUT_MS);

    worker.onmessage = (event: MessageEvent<CodeFormattingWorkerResponse>) => {
      if (event.data.requestId !== requestId) return;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setRunning(false);
      const result = event.data.result as SqlFormatResult;
      if (!result.ok) {
        setError(result.error ?? "No se pudo formatear el SQL.");
      } else {
        setOutput(result.formatted ?? "");
        setStatementCount(result.statementCount ?? null);
      }
      worker.terminate();
    };
    worker.postMessage({ requestId, job: { kind: "sql", sql, dialect, tabWidth, useTabs, keywordCase } } satisfies CodeFormattingWorkerRequest);
  }

  function handleImportFile(files: File[]) {
    const file = files[0];
    if (!file) return;
    file.text().then((text) => {
      setSql(text);
      setError(null);
    });
  }

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">Los datos se procesan en tu dispositivo y no se envían al servidor.</p>
      <p className="text-xs text-muted-foreground">Solo reformatea el texto: nunca ejecuta la consulta, ni se conecta a ninguna base de datos, ni valida su corrección semántica.</p>

      <div className="grid gap-4 sm:grid-cols-4">
        <div>
          <Label htmlFor="sql-dialect" className="mb-1">
            Dialecto
          </Label>
          <LabeledSelect id="sql-dialect" value={dialect} onValueChange={(v) => setDialect(v as SqlDialect)} options={SQL_DIALECTS.map((d) => ({ value: d.id, label: d.label }))} className="w-full" />
        </div>
        <div>
          <Label htmlFor="sql-case" className="mb-1">
            Mayúsculas/minúsculas de palabras clave
          </Label>
          <LabeledSelect id="sql-case" value={keywordCase} onValueChange={(v) => setKeywordCase(v as KeywordCase)} options={[{ value: "preserve", label: "Conservar" }, { value: "upper", label: "MAYÚSCULAS" }, { value: "lower", label: "minúsculas" }]} className="w-full" />
        </div>
        <div>
          <Label htmlFor="sql-tabwidth" className="mb-1">
            Ancho de indentación
          </Label>
          <LabeledSelect id="sql-tabwidth" value={String(tabWidth)} onValueChange={(v) => setTabWidth(Number(v))} options={[{ value: "2", label: "2" }, { value: "4", label: "4" }]} className="w-full" />
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <Checkbox checked={useTabs} onCheckedChange={(c) => setUseTabs(Boolean(c))} /> Usar tabulaciones
        </label>
      </div>

      <div>
        <Label htmlFor="sql-input" className="mb-1">
          SQL de entrada
        </Label>
        <Textarea id="sql-input" value={sql} onChange={(e) => setSql(e.target.value)} rows={12} className="font-mono text-sm" spellCheck={false} />
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
              setError("Formateo cancelado.");
            }}
          >
            Cancelar
          </Button>
        ) : null}
        <FileUploadZone accept=".sql,text/plain" onFilesSelected={handleImportFile} label="o carga un archivo .sql" hint="" />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {statementCount !== null ? <p className="text-xs text-muted-foreground">Sentencias detectadas: {statementCount}</p> : null}

      {output ? (
        <div>
          <Label htmlFor="sql-output" className="mb-1">
            Resultado
          </Label>
          <Textarea id="sql-output" value={output} readOnly rows={14} className="font-mono text-sm" spellCheck={false} />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <CopyButton text={output} label="Copiar resultado" />
        <Button type="button" variant="outline" disabled={!output} onClick={() => downloadTextFile("resultado.sql", output, "application/sql;charset=utf-8")}>
          Descargar .sql
        </Button>
        <ResetButton
          onReset={() => {
            cancel();
            setSql("");
            setOutput("");
            setError(null);
            setStatementCount(null);
          }}
        />
      </div>
    </div>
  );
}
