"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CopyButton, DownloadButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import {
  encodeUriComponentSafe,
  decodeUriComponentSafe,
  encodeFullUrl,
  decodeFullUrl,
  parseUrlParams,
  buildQueryString,
  isDangerousScheme,
  type QueryParam,
} from "@/lib/public-tools/utilities/url-tool";

type Mode = "component" | "full-url" | "params";

export function UrlEncoderTool() {
  const [mode, setMode] = useState<Mode>("component");
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useState<QueryParam[]>([]);
  const [origin, setOrigin] = useState<string | null>(null);
  const [sortKeys, setSortKeys] = useState(false);

  function handleEncode() {
    setError(null);
    if (mode === "component") {
      setOutput(encodeUriComponentSafe(input));
    } else if (mode === "full-url") {
      const result = encodeFullUrl(input);
      if (!result.ok) setError(result.error ?? "Error al codificar.");
      else setOutput(result.text ?? "");
    }
  }

  function handleDecode() {
    setError(null);
    if (mode === "component") {
      const result = decodeUriComponentSafe(input);
      if (!result.ok) setError(result.error ?? "Error al decodificar.");
      else setOutput(result.text ?? "");
    } else if (mode === "full-url") {
      const result = decodeFullUrl(input);
      if (!result.ok) setError(result.error ?? "Error al decodificar.");
      else setOutput(result.text ?? "");
    }
  }

  function handleAnalyze() {
    setError(null);
    const result = parseUrlParams(input);
    if (!result.ok) {
      setError(result.error ?? "URL inválida.");
      setParams([]);
      setOrigin(null);
      return;
    }
    setParams(result.params ?? []);
    setOrigin(result.origin ?? null);
  }

  function updateParam(index: number, field: "key" | "value", value: string) {
    setParams((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  }
  function removeParam(index: number) {
    setParams((prev) => prev.filter((_, i) => i !== index));
  }
  function addParam() {
    setParams((prev) => [...prev, { key: "", value: "", isDuplicateKey: false }]);
  }

  const queryString = params.length > 0 ? buildQueryString(params, sortKeys) : "";
  const dangerous = mode === "full-url" && input.trim() ? isDangerousScheme(input) : false;

  function handleReset() {
    setInput("");
    setOutput("");
    setError(null);
    setParams([]);
    setOrigin(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["component", "Codificar componente"],
            ["full-url", "URL completa"],
            ["params", "Analizar parámetros"],
          ] as [Mode, string][]
        ).map(([m, label]) => (
          <Button key={m} type="button" variant={mode === m ? "default" : "outline"} size="sm" onClick={() => { setMode(m); setOutput(""); setError(null); }}>
            {label}
          </Button>
        ))}
      </div>

      <div>
        <Label htmlFor="url-input" className="mb-1">
          {mode === "params" ? "URL a analizar (absoluta, con esquema)" : "Texto o URL"}
        </Label>
        <Textarea id="url-input" value={input} onChange={(e) => setInput(e.target.value)} rows={4} className="font-mono text-sm" />
      </div>

      {dangerous ? (
        <p role="alert" className="text-sm text-destructive">
          Este texto empieza con un esquema potencialmente peligroso (javascript:, data:, vbscript:, file:). No se mostrará como enlace navegable.
        </p>
      ) : null}

      {mode === "component" || mode === "full-url" ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={handleEncode}>
            Codificar
          </Button>
          <Button type="button" variant="outline" onClick={handleDecode}>
            Decodificar
          </Button>
        </div>
      ) : (
        <Button type="button" onClick={handleAnalyze}>
          Analizar parámetros
        </Button>
      )}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {output ? (
        <div aria-live="polite" className="space-y-2">
          <Label htmlFor="url-output" className="mb-1">
            Resultado
          </Label>
          <Textarea id="url-output" value={output} readOnly rows={4} className="font-mono text-sm" />
          <div className="flex flex-wrap gap-2">
            <CopyButton text={output} label="Copiar" />
            <DownloadButton content={output} filename="url-resultado.txt" mimeType="text/plain" label="Descargar" />
          </div>
        </div>
      ) : null}

      {mode === "params" && (params.length > 0 || origin) ? (
        <div aria-live="polite" className="space-y-3 rounded-lg border p-4">
          {origin ? (
            <p className="text-sm text-muted-foreground">
              Origen: <code>{origin}</code>
            </p>
          ) : null}
          <div className="space-y-2">
            {params.map((p, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Input aria-label={`Clave del parámetro ${i + 1}`} value={p.key} onChange={(e) => updateParam(i, "key", e.target.value)} className="max-w-[10rem]" />
                <Input aria-label={`Valor del parámetro ${i + 1}`} value={p.value} onChange={(e) => updateParam(i, "value", e.target.value)} className="max-w-[14rem]" />
                {p.isDuplicateKey ? <span className="text-xs text-amber-600 dark:text-amber-400">clave duplicada</span> : null}
                <Button type="button" variant="ghost" size="sm" onClick={() => removeParam(i)}>
                  Eliminar
                </Button>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Button type="button" variant="outline" size="sm" onClick={addParam}>
              Añadir parámetro
            </Button>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={sortKeys} onCheckedChange={(c) => setSortKeys(Boolean(c))} />
              Ordenar parámetros
            </label>
          </div>
          {queryString ? (
            <div className="space-y-1">
              <p className="text-sm font-medium">Query string</p>
              <code className="block break-all rounded bg-muted px-2 py-1 text-sm">{queryString}</code>
              <CopyButton text={queryString} label="Copiar query string" />
            </div>
          ) : null}
        </div>
      ) : null}

      <ResetButton onReset={handleReset} />
    </div>
  );
}
