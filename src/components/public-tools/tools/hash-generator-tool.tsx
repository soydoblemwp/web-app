"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import { CopyButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { formatBytes } from "@/lib/public-tools/files/format";
import { DIGEST_ALGORITHMS, digestText, digestFile, hashesMatch, type DigestAlgorithm, type DigestResult } from "@/lib/public-tools/utilities/crypto-digest";
import { UTILITY_LIMITS } from "@/lib/public-tools/utilities/limits";

type Mode = "text" | "file";

export function HashGeneratorTool() {
  const [mode, setMode] = useState<Mode>("text");
  const [algorithm, setAlgorithm] = useState<DigestAlgorithm>("SHA-256");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<DigestResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expected, setExpected] = useState("");

  async function handleCompute() {
    setError(null);
    setResult(null);
    try {
      if (mode === "text") {
        if (text.length > UTILITY_LIMITS.hash.maxTextLength) {
          setError(`El texto supera el límite de ${UTILITY_LIMITS.hash.maxTextLength.toLocaleString("es-ES")} caracteres.`);
          return;
        }
        setBusy(true);
        setResult(await digestText(text, algorithm));
      } else {
        if (!file) {
          setError("Selecciona un archivo primero.");
          return;
        }
        if (file.size > UTILITY_LIMITS.hash.maxFileBytes) {
          setError(`El archivo supera el límite de ${formatBytes(UTILITY_LIMITS.hash.maxFileBytes)}.`);
          return;
        }
        setBusy(true);
        setResult(await digestFile(file, algorithm));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo calcular el hash.");
    } finally {
      setBusy(false);
    }
  }

  function handleReset() {
    setText("");
    setFile(null);
    setResult(null);
    setError(null);
    setExpected("");
  }

  const comparison = result && expected.trim() ? hashesMatch(result.hex, expected.trim()) || hashesMatch(result.base64, expected.trim()) : null;

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <Button type="button" variant={mode === "text" ? "default" : "outline"} size="sm" onClick={() => setMode("text")}>
          Texto
        </Button>
        <Button type="button" variant={mode === "file" ? "default" : "outline"} size="sm" onClick={() => setMode("file")}>
          Archivo
        </Button>
      </div>

      <div className="max-w-xs">
        <Label htmlFor="hash-algorithm" className="mb-1">
          Algoritmo
        </Label>
        <Select value={algorithm} onValueChange={(v) => setAlgorithm(v as DigestAlgorithm)}>
          <SelectTrigger id="hash-algorithm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DIGEST_ALGORITHMS.map((alg) => (
              <SelectItem key={alg} value={alg}>
                {alg}
                {alg === "SHA-1" ? " (no recomendado)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {algorithm === "SHA-1" ? <p className="mt-1 text-xs text-destructive">SHA-1 no debe utilizarse para nuevas aplicaciones de seguridad.</p> : null}
      </div>

      {mode === "text" ? (
        <div>
          <Label htmlFor="hash-text" className="mb-1">
            Texto
          </Label>
          <Textarea id="hash-text" value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder="Escribe o pega el texto..." />
        </div>
      ) : (
        <div className="space-y-2">
          <FileUploadZone accept="*/*" onFilesSelected={(files) => setFile(files[0] ?? null)} hint={`Hasta ${formatBytes(UTILITY_LIMITS.hash.maxFileBytes)}. El archivo nunca se sube a ningún servidor.`} />
          {file ? (
            <p className="text-sm text-muted-foreground">
              {file.name} — {formatBytes(file.size)}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">Web Crypto necesita cargar el archivo completo en memoria para calcular el hash; archivos muy grandes pueden tardar o consumir mucha memoria.</p>
        </div>
      )}

      <Button type="button" onClick={handleCompute} disabled={busy}>
        {busy ? "Calculando..." : "Calcular hash"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {result ? (
        <div aria-live="polite" className="space-y-3 rounded-lg border p-4 text-sm">
          <div>
            <p className="font-medium">HEX</p>
            <div className="flex items-center gap-2">
              <code className="break-all">{result.hex}</code>
              <CopyButton text={result.hex} label="Copiar" />
            </div>
          </div>
          <div>
            <p className="font-medium">Base64</p>
            <div className="flex items-center gap-2">
              <code className="break-all">{result.base64}</code>
              <CopyButton text={result.base64} label="Copiar" />
            </div>
          </div>
          <div>
            <Label htmlFor="hash-expected" className="mb-1">
              Comparar con un hash esperado (opcional)
            </Label>
            <Input id="hash-expected" value={expected} onChange={(e) => setExpected(e.target.value)} placeholder="Pega un hash HEX o Base64..." />
            {expected.trim() ? (
              <p className={comparison ? "mt-1 text-emerald-600 dark:text-emerald-400" : "mt-1 text-destructive"}>{comparison ? "✓ Coincide" : "✗ No coincide"}</p>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">Un hash simple no sustituye un algoritmo especializado para almacenar contraseñas.</p>
        </div>
      ) : null}

      <ResetButton onReset={handleReset} />
    </div>
  );
}
