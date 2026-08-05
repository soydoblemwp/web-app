"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import { CopyButton, DownloadButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { validateJson, formatJson, minifyJson, sortJsonKeysDeep, computeJsonStats, type JsonIndent } from "@/lib/public-tools/utilities/json-tool";

export function JsonFormatterTool() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [indent, setIndent] = useState<JsonIndent>("2");
  const [sortKeys, setSortKeys] = useState(false);
  const [error, setError] = useState<{ message: string; line: number | null; column: number | null; snippet: string | null } | null>(null);
  const [stats, setStats] = useState<ReturnType<typeof computeJsonStats> | null>(null);

  function runValidation(): unknown | null {
    const result = validateJson(input);
    if (!result.ok) {
      setError(result.error ?? { message: "JSON inválido.", line: null, column: null, snippet: null });
      setStats(null);
      setOutput("");
      return null;
    }
    setError(null);
    setStats(computeJsonStats(result.value));
    return result.value;
  }

  function apply(transform: (value: unknown) => string) {
    const value = runValidation();
    if (value === null) return;
    const finalValue = sortKeys ? sortJsonKeysDeep(value) : value;
    setOutput(transform(finalValue));
  }

  function handleValidate() {
    runValidation();
  }
  function handleFormat() {
    apply((v) => formatJson(v, indent));
  }
  function handleMinify() {
    apply((v) => minifyJson(v));
  }

  function handleFileLoad(files: File[]) {
    const f = files[0];
    if (!f) return;
    f.text().then(setInput);
  }

  function handleReset() {
    setInput("");
    setOutput("");
    setError(null);
    setStats(null);
  }

  return (
    <div className="space-y-6">
      <div>
        <Label htmlFor="json-input" className="mb-1">
          JSON de entrada
        </Label>
        <Textarea id="json-input" value={input} onChange={(e) => setInput(e.target.value)} rows={10} placeholder='{"ejemplo": true}' spellCheck={false} className="font-mono text-sm" />
        <div className="mt-2">
          <FileUploadZone accept="application/json,.json" onFilesSelected={handleFileLoad} label="Arrastra un archivo .json aquí, o" hint="Se lee localmente; no se sube a ningún servidor." />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <Label htmlFor="json-indent" className="mb-1">
            Indentación
          </Label>
          <Select value={indent} onValueChange={(v) => setIndent(v as JsonIndent)}>
            <SelectTrigger id="json-indent" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2">2 espacios</SelectItem>
              <SelectItem value="4">4 espacios</SelectItem>
              <SelectItem value="tab">Tabulación</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <Checkbox checked={sortKeys} onCheckedChange={(c) => setSortKeys(Boolean(c))} />
          Ordenar claves alfabéticamente
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={handleValidate}>
          Validar
        </Button>
        <Button type="button" onClick={handleFormat}>
          Formatear
        </Button>
        <Button type="button" variant="outline" onClick={handleMinify}>
          Minificar
        </Button>
      </div>

      {error ? (
        <div role="alert" className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <p className="font-medium text-destructive">{error.message}</p>
          {error.line !== null ? (
            <p className="text-muted-foreground">
              Línea {error.line}, columna {error.column}
            </p>
          ) : null}
          {error.snippet ? <code className="block overflow-x-auto text-xs text-muted-foreground">…{error.snippet}…</code> : null}
        </div>
      ) : null}

      {stats && !error ? (
        <div aria-live="polite" className="grid grid-cols-2 gap-2 rounded-lg border p-4 text-sm sm:grid-cols-3">
          <p>Objetos: {stats.objects}</p>
          <p>Arrays: {stats.arrays}</p>
          <p>Claves: {stats.keys}</p>
          <p>Valores: {stats.values}</p>
          <p>Profundidad: {stats.maxDepth}</p>
          <p>Tamaño: ~{stats.approxBytes.toLocaleString("es-ES")} bytes</p>
          {stats.depthExceeded ? <p className="col-span-full text-amber-600 dark:text-amber-400">Profundidad máxima analizada alcanzada; hay niveles adicionales sin contar.</p> : null}
        </div>
      ) : null}

      {output ? (
        <div className="space-y-2">
          <Label htmlFor="json-output" className="mb-1">
            Resultado
          </Label>
          <Textarea id="json-output" value={output} readOnly rows={10} className="font-mono text-sm" />
          <div className="flex flex-wrap gap-2">
            <CopyButton text={output} label="Copiar" />
            <DownloadButton content={output} filename="datos.json" mimeType="application/json" label="Descargar .json" />
          </div>
        </div>
      ) : null}

      <ResetButton onReset={handleReset} />
    </div>
  );
}
