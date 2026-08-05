"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import { CopyButton, DownloadButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { downloadBlob } from "@/lib/public-tools/files/download";
import { sanitizeFilename } from "@/lib/public-tools/files/filenames";
import { formatBytes } from "@/lib/public-tools/files/format";
import { bytesToBase64, base64ToBytes, textToBase64, base64ToText } from "@/lib/public-tools/utilities/encoding";
import { UTILITY_LIMITS } from "@/lib/public-tools/utilities/limits";

type Mode = "text-to-b64" | "b64-to-text" | "file-to-b64" | "b64-to-file";

export function Base64Tool() {
  const [mode, setMode] = useState<Mode>("text-to-b64");
  const [urlSafe, setUrlSafe] = useState(false);
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [decodedFileBytes, setDecodedFileBytes] = useState<Uint8Array | null>(null);

  function handleReset() {
    setInput("");
    setOutput("");
    setError(null);
    setFile(null);
    setDecodedFileBytes(null);
  }

  function handleConvert() {
    setError(null);
    setOutput("");
    setDecodedFileBytes(null);

    if (mode === "text-to-b64") {
      if (input.length > UTILITY_LIMITS.base64.maxTextLength) {
        setError(`El texto supera el límite de ${UTILITY_LIMITS.base64.maxTextLength.toLocaleString("es-ES")} caracteres.`);
        return;
      }
      setOutput(textToBase64(input, urlSafe));
      return;
    }

    if (mode === "b64-to-text") {
      const decoded = base64ToText(input);
      if (!decoded.ok) {
        setError(decoded.error ?? "Base64 inválido.");
        return;
      }
      setOutput(decoded.text ?? "");
      return;
    }

    if (mode === "b64-to-file") {
      const decoded = base64ToBytes(input);
      if (!decoded.ok || !decoded.bytes) {
        setError(decoded.error ?? "Base64 inválido.");
        return;
      }
      setDecodedFileBytes(decoded.bytes);
      return;
    }
  }

  async function handleFileToBase64(files: File[]) {
    const f = files[0];
    if (!f) return;
    if (f.size > UTILITY_LIMITS.base64.maxFileBytes) {
      setError(`El archivo supera el límite de ${formatBytes(UTILITY_LIMITS.base64.maxFileBytes)}.`);
      return;
    }
    setFile(f);
    setError(null);
    const buffer = new Uint8Array(await f.arrayBuffer());
    setOutput(bytesToBase64(buffer, urlSafe));
  }

  function handleDownloadDecodedFile() {
    if (!decodedFileBytes) return;
    const filename = sanitizeFilename("archivo-decodificado.bin");
    downloadBlob(filename, decodedFileBytes, "application/octet-stream");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["text-to-b64", "Texto → Base64"],
            ["b64-to-text", "Base64 → Texto"],
            ["file-to-b64", "Archivo → Base64"],
            ["b64-to-file", "Base64 → Archivo"],
          ] as [Mode, string][]
        ).map(([m, label]) => (
          <Button key={m} type="button" variant={mode === m ? "default" : "outline"} size="sm" onClick={() => { setMode(m); setOutput(""); setError(null); }}>
            {label}
          </Button>
        ))}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={urlSafe} onCheckedChange={(c) => setUrlSafe(Boolean(c))} />
        Base64 URL-safe (usa - y _ en lugar de + y /)
      </label>

      {mode === "text-to-b64" || mode === "b64-to-text" ? (
        <div>
          <Label htmlFor="base64-input" className="mb-1">
            {mode === "text-to-b64" ? "Texto" : "Base64"}
          </Label>
          <Textarea id="base64-input" value={input} onChange={(e) => setInput(e.target.value)} rows={6} className="font-mono text-sm" />
          <p className="mt-1 text-xs text-muted-foreground">Entrada: {new TextEncoder().encode(input).length} bytes</p>
        </div>
      ) : null}

      {mode === "file-to-b64" ? (
        <div className="space-y-2">
          <FileUploadZone accept="*/*" onFilesSelected={handleFileToBase64} hint={`Hasta ${formatBytes(UTILITY_LIMITS.base64.maxFileBytes)}.`} />
          {file ? (
            <p className="text-sm text-muted-foreground">
              {file.name} — {formatBytes(file.size)}
            </p>
          ) : null}
        </div>
      ) : null}

      {mode === "b64-to-file" ? (
        <div>
          <Label htmlFor="base64-file-input" className="mb-1">
            Base64 a decodificar
          </Label>
          <Textarea id="base64-file-input" value={input} onChange={(e) => setInput(e.target.value)} rows={6} className="font-mono text-sm" />
        </div>
      ) : null}

      {mode === "text-to-b64" || mode === "b64-to-text" || mode === "b64-to-file" ? (
        <Button type="button" onClick={handleConvert}>
          Convertir
        </Button>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {output ? (
        <div aria-live="polite" className="space-y-2">
          <Label htmlFor="base64-output" className="mb-1">
            Resultado
          </Label>
          <Textarea id="base64-output" value={output} readOnly rows={6} className="font-mono text-sm" />
          <p className="text-xs text-muted-foreground">Salida: {new TextEncoder().encode(output).length} bytes</p>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={output} label="Copiar" />
            <DownloadButton content={output} filename="resultado-base64.txt" mimeType="text/plain" label="Descargar" />
          </div>
        </div>
      ) : null}

      {decodedFileBytes ? (
        <div aria-live="polite" className="space-y-2 rounded-lg border p-4 text-sm">
          <p>Archivo decodificado: {formatBytes(decodedFileBytes.length)}</p>
          <Button type="button" variant="outline" size="sm" onClick={handleDownloadDecodedFile}>
            Descargar archivo
          </Button>
        </div>
      ) : null}

      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">Base64 es una codificación, no un método de cifrado.</p>

      <ResetButton onReset={handleReset} />
    </div>
  );
}
