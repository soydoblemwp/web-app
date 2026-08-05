"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LabeledSelect } from "@/components/ui/select";
import { CopyButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import { downloadTextFile } from "@/lib/public-tools/csv-export";
import { HMAC_ALGORITHMS, computeHmac, verifyHmac, type HmacAlgorithm, type HmacOutputEncoding } from "@/lib/public-tools/security-web/hmac";
import type { HmacSecretEncoding } from "@/lib/public-tools/security-web/key-import";

type Mode = "generate" | "verify";

export function HmacTool() {
  const [mode, setMode] = useState<Mode>("generate");
  const [message, setMessage] = useState("mensaje de ejemplo");
  const [file, setFile] = useState<File | null>(null);
  const [secret, setSecret] = useState("clave-compartida");
  const [secretEncoding, setSecretEncoding] = useState<HmacSecretEncoding>("text");
  const [showSecret, setShowSecret] = useState(false);
  const [algorithm, setAlgorithm] = useState<HmacAlgorithm>("SHA-256");
  const [outputEncoding, setOutputEncoding] = useState<HmacOutputEncoding>("hex");
  const [expected, setExpected] = useState("");
  const [expectedEncoding, setExpectedEncoding] = useState<HmacOutputEncoding>("hex");

  const [result, setResult] = useState<{ hex?: string; base64?: string; base64url?: string; error?: string } | null>(null);
  const [verifyResult, setVerifyResult] = useState<{ matches?: boolean; error?: string } | null>(null);
  const [running, setRunning] = useState(false);

  async function getMessageBytes(): Promise<Uint8Array> {
    if (file) return new Uint8Array(await file.arrayBuffer());
    return new TextEncoder().encode(message);
  }

  async function handleGenerate() {
    setRunning(true);
    setResult(null);
    const bytes = await getMessageBytes();
    const r = await computeHmac(bytes, secret, secretEncoding, algorithm);
    setResult(r.ok ? { hex: r.hex, base64: r.base64, base64url: r.base64url } : { error: r.error });
    setRunning(false);
  }

  async function handleVerify() {
    setRunning(true);
    setVerifyResult(null);
    const bytes = await getMessageBytes();
    const r = await verifyHmac(bytes, secret, secretEncoding, algorithm, expected, expectedEncoding);
    setVerifyResult(r.ok ? { matches: r.matches } : { error: r.error });
    setRunning(false);
  }

  function handleFile(files: File[]) {
    setFile(files[0] ?? null);
  }

  const outputValue = result ? (outputEncoding === "hex" ? result.hex : outputEncoding === "base64" ? result.base64 : result.base64url) : "";

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">El mensaje, el secreto y el resultado permanecen en tu dispositivo.</p>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant={mode === "generate" ? "default" : "outline"} size="sm" onClick={() => setMode("generate")}>
          Generar
        </Button>
        <Button type="button" variant={mode === "verify" ? "default" : "outline"} size="sm" onClick={() => setMode("verify")}>
          Verificar
        </Button>
      </div>

      <div>
        <Label htmlFor="hmac-message" className="mb-1">
          Mensaje de texto {file ? <span className="text-muted-foreground">(se ignora; hay un archivo cargado)</span> : null}
        </Label>
        <Textarea id="hmac-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={4} className="font-mono text-sm" disabled={!!file} />
        <FileUploadZone accept="*/*" onFilesSelected={handleFile} label="o usa un archivo local" hint="" />
        {file ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setFile(null)}>
            Quitar archivo
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <div>
            <Label htmlFor="hmac-secret" className="mb-1">
              Secreto
            </Label>
            <Input id="hmac-secret" type={showSecret ? "text" : "password"} value={secret} onChange={(e) => setSecret(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1">Encoding</Label>
            <LabeledSelect value={secretEncoding} onValueChange={(v) => setSecretEncoding(v as HmacSecretEncoding)} options={[{ value: "text", label: "Texto" }, { value: "hex", label: "Hex" }, { value: "base64", label: "Base64" }, { value: "base64url", label: "Base64URL" }]} />
          </div>
          <Button type="button" variant="outline" size="sm" className="self-end" onClick={() => setShowSecret((s) => !s)}>
            {showSecret ? "Ocultar" : "Mostrar"}
          </Button>
        </div>
        <div>
          <Label htmlFor="hmac-algo" className="mb-1">
            Algoritmo
          </Label>
          <LabeledSelect id="hmac-algo" value={algorithm} onValueChange={(v) => setAlgorithm(v as HmacAlgorithm)} options={HMAC_ALGORITHMS.map((a) => ({ value: a, label: `HMAC-${a}` }))} className="w-full" />
        </div>
      </div>

      {mode === "generate" ? (
        <div className="space-y-3">
          <div className="max-w-xs">
            <Label htmlFor="hmac-out-enc" className="mb-1">
              Codificación de salida
            </Label>
            <LabeledSelect id="hmac-out-enc" value={outputEncoding} onValueChange={(v) => setOutputEncoding(v as HmacOutputEncoding)} options={[{ value: "hex", label: "Hexadecimal" }, { value: "base64", label: "Base64" }, { value: "base64url", label: "Base64URL" }]} className="w-full" />
          </div>
          <Button type="button" onClick={handleGenerate} disabled={running}>
            {running ? "Calculando…" : "Generar HMAC"}
          </Button>
          {result?.error ? (
            <p role="alert" className="text-sm text-destructive">
              {result.error}
            </p>
          ) : null}
          {outputValue ? (
            <div aria-live="polite" className="space-y-1 rounded-lg border p-3 text-sm">
              <p className="font-mono break-all">{outputValue}</p>
              <div className="flex flex-wrap gap-2 pt-2">
                <CopyButton text={outputValue} label="Copiar" />
                <Button type="button" variant="outline" size="sm" onClick={() => downloadTextFile("hmac.txt", outputValue)}>
                  Descargar
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <div>
              <Label htmlFor="hmac-expected" className="mb-1">
                Valor esperado
              </Label>
              <Input id="hmac-expected" className="font-mono text-sm" value={expected} onChange={(e) => setExpected(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1">Encoding</Label>
              <LabeledSelect value={expectedEncoding} onValueChange={(v) => setExpectedEncoding(v as HmacOutputEncoding)} options={[{ value: "hex", label: "Hexadecimal" }, { value: "base64", label: "Base64" }, { value: "base64url", label: "Base64URL" }]} />
            </div>
          </div>
          <Button type="button" onClick={handleVerify} disabled={running}>
            {running ? "Comprobando…" : "Verificar"}
          </Button>
          {verifyResult?.error ? (
            <p role="alert" className="text-sm text-destructive">
              {verifyResult.error}
            </p>
          ) : null}
          {verifyResult && verifyResult.matches !== undefined ? (
            <p aria-live="polite" className={`text-sm font-semibold ${verifyResult.matches ? "text-green-700 dark:text-green-400" : "text-destructive"}`}>
              {verifyResult.matches ? "Coincide" : "No coincide"}
            </p>
          ) : null}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <ResetButton
          onReset={() => {
            setMessage("");
            setFile(null);
            setSecret("");
            setExpected("");
            setResult(null);
            setVerifyResult(null);
          }}
        />
      </div>
    </div>
  );
}
