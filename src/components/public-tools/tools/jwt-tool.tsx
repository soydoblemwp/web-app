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
import { formatJson } from "@/lib/public-tools/utilities/json-tool";
import { DOCUMENT_LIMITS } from "@/lib/public-tools/documents/limits";
import { verifyJwt, type VerifyJwtResult, type KeyInput } from "@/lib/public-tools/security-web/jwt-verification";
import type { HmacSecretEncoding, PublicKeyInputFormat } from "@/lib/public-tools/security-web/key-import";

const SAMPLE_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

const STATUS_LABELS: Record<string, string> = {
  TOKEN_MALFORMADO: "TOKEN MALFORMADO",
  ALGORITMO_NO_PERMITIDO: "ALGORITMO NO PERMITIDO",
  NO_VERIFICADO: "NO VERIFICADO",
  VERIFICADO: "VERIFICADO",
  FIRMA_INVALIDA: "FIRMA INVÁLIDA",
  TOKEN_EXPIRADO: "TOKEN EXPIRADO",
  TOKEN_AUN_NO_VALIDO: "TOKEN AÚN NO VÁLIDO",
};

function formatEpoch(seconds: number | null): { utc: string; local: string } | null {
  if (seconds === null) return null;
  const date = new Date(seconds * 1000);
  return { utc: date.toISOString(), local: date.toLocaleString("es-ES") };
}

export function JwtTool() {
  const [token, setToken] = useState(SAMPLE_JWT);
  const [clockTolerance, setClockTolerance] = useState(0);
  const [expectedAudience, setExpectedAudience] = useState("");
  const [expectedIssuer, setExpectedIssuer] = useState("");

  const [keyKind, setKeyKind] = useState<"none" | "hmac" | "public">("none");
  const [hmacSecret, setHmacSecret] = useState("");
  const [hmacEncoding, setHmacEncoding] = useState<HmacSecretEncoding>("text");
  const [showSecret, setShowSecret] = useState(false);
  const [publicKeyText, setPublicKeyText] = useState("");
  const [publicKeyFormat, setPublicKeyFormat] = useState<PublicKeyInputFormat>("pem");

  const [result, setResult] = useState<VerifyJwtResult | null>(null);
  const [running, setRunning] = useState(false);

  async function handleRun() {
    setRunning(true);
    const key: KeyInput | undefined =
      keyKind === "none"
        ? undefined
        : keyKind === "hmac"
          ? { provided: true, kind: "hmac", hmacSecret, hmacEncoding }
          : { provided: true, kind: "public", publicKeyText, publicKeyFormat };

    const r = await verifyJwt(token, {
      nowEpochSeconds: Math.floor(Date.now() / 1000),
      clockToleranceSeconds: clockTolerance,
      expectedAudience: expectedAudience || undefined,
      expectedIssuer: expectedIssuer || undefined,
      maxTokenLength: DOCUMENT_LIMITS.jwt.maxTokenLength,
      key,
    });
    setResult(r);
    setRunning(false);
  }

  function handleImportFile(files: File[]) {
    const file = files[0];
    if (!file) return;
    file.text().then((text) => setToken(text.trim()));
  }
  function handleImportKeyFile(files: File[]) {
    const file = files[0];
    if (!file) return;
    file.text().then((text) => setPublicKeyText(text));
  }

  const decoded = result?.decoded;
  const status = result?.status;

  // Never includes the secret/private key material in the exported report — only public, non-sensitive facts.
  const report = result
    ? [
        `Estado: ${status ? STATUS_LABELS[status] : "-"}`,
        result.error ? `Detalle: ${result.error}` : "",
        result.keyError ? `Error de clave: ${result.keyError}` : "",
        decoded ? `Algoritmo: ${decoded.algClaim ?? "(ausente)"}` : "",
        decoded ? `Header:\n${formatJson(decoded.header, "2")}` : "",
        decoded ? `Payload:\n${formatJson(decoded.payload, "2")}` : "",
      ]
        .filter(Boolean)
        .join("\n\n")
    : "";

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">El token, las claves y los secretos permanecen en tu dispositivo.</p>
      <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">Un JWT decodificado no es necesariamente auténtico. La autenticidad requiere verificar su firma con una clave confiable.</p>

      <div>
        <Label htmlFor="jwt-token" className="mb-1">
          Token JWT
        </Label>
        <Textarea id="jwt-token" value={token} onChange={(e) => setToken(e.target.value)} rows={4} className="font-mono text-xs" spellCheck={false} />
        <FileUploadZone accept="text/plain,.jwt,.txt" onFilesSelected={handleImportFile} label="o carga un archivo con el token" hint="" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="jwt-tolerance" className="mb-1">
            Tolerancia de reloj (segundos)
          </Label>
          <Input id="jwt-tolerance" type="number" min={0} value={clockTolerance} onChange={(e) => setClockTolerance(Math.max(0, Number(e.target.value)))} />
        </div>
        <div>
          <Label htmlFor="jwt-aud" className="mb-1">
            Audiencia esperada (opcional)
          </Label>
          <Input id="jwt-aud" value={expectedAudience} onChange={(e) => setExpectedAudience(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="jwt-iss" className="mb-1">
            Emisor esperado (opcional)
          </Label>
          <Input id="jwt-iss" value={expectedIssuer} onChange={(e) => setExpectedIssuer(e.target.value)} />
        </div>
      </div>

      <div className="space-y-3 rounded-lg border p-3">
        <Label htmlFor="jwt-key-kind" className="mb-1">
          Clave para verificar (opcional — sin ella, el resultado queda como NO_VERIFICADO)
        </Label>
        <LabeledSelect id="jwt-key-kind" value={keyKind} onValueChange={(v) => setKeyKind(v as typeof keyKind)} options={[{ value: "none", label: "Sin clave (solo decodificar)" }, { value: "hmac", label: "Secreto HMAC" }, { value: "public", label: "Clave pública (PEM o JWK)" }]} className="w-full sm:w-80" />

        {keyKind === "hmac" ? (
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <Input type={showSecret ? "text" : "password"} placeholder="Secreto compartido" value={hmacSecret} onChange={(e) => setHmacSecret(e.target.value)} />
            <LabeledSelect value={hmacEncoding} onValueChange={(v) => setHmacEncoding(v as HmacSecretEncoding)} options={[{ value: "text", label: "Texto" }, { value: "hex", label: "Hexadecimal" }, { value: "base64", label: "Base64" }, { value: "base64url", label: "Base64URL" }]} />
            <Button type="button" variant="outline" size="sm" onClick={() => setShowSecret((s) => !s)}>
              {showSecret ? "Ocultar" : "Mostrar"}
            </Button>
          </div>
        ) : null}

        {keyKind === "public" ? (
          <div className="space-y-2">
            <LabeledSelect value={publicKeyFormat} onValueChange={(v) => setPublicKeyFormat(v as PublicKeyInputFormat)} options={[{ value: "pem", label: "PEM (clave pública)" }, { value: "jwk", label: "JWK" }]} className="w-full sm:w-60" />
            <Textarea value={publicKeyText} onChange={(e) => setPublicKeyText(e.target.value)} rows={5} className="font-mono text-xs" placeholder={publicKeyFormat === "pem" ? "-----BEGIN PUBLIC KEY-----" : '{ "kty": "RSA", ... }'} />
            <FileUploadZone accept=".pem,.pub,.jwk,.json,text/plain" onFilesSelected={handleImportKeyFile} label="o carga la clave pública" hint="" />
          </div>
        ) : null}
      </div>

      <Button type="button" onClick={handleRun} disabled={running}>
        {running ? "Procesando…" : "Decodificar / Verificar"}
      </Button>

      {result ? (
        <div aria-live="polite" className="space-y-4 rounded-lg border p-4 text-sm">
          <p>
            Estado: <strong className={status === "VERIFICADO" ? "text-green-700 dark:text-green-400" : status === "FIRMA_INVALIDA" || status === "TOKEN_MALFORMADO" || status === "ALGORITMO_NO_PERMITIDO" ? "text-destructive" : ""}>{status ? STATUS_LABELS[status] : "-"}</strong>
          </p>
          {result.error ? <p className="text-destructive">{result.error}</p> : null}
          {result.keyError ? <p className="text-amber-700 dark:text-amber-400">{result.keyError}</p> : null}

          {decoded ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="mb-1">Header</Label>
                  <Textarea readOnly value={formatJson(decoded.header, "2")} rows={6} className="font-mono text-xs" />
                </div>
                <div>
                  <Label className="mb-1">Payload</Label>
                  <Textarea readOnly value={formatJson(decoded.payload, "2")} rows={6} className="font-mono text-xs" />
                </div>
              </div>

              {result.standardClaims ? (
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full min-w-[420px] text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th scope="col" className="px-3 py-2 text-left">
                          Claim
                        </th>
                        <th scope="col" className="px-3 py-2 text-left">
                          Valor
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(["iss", "sub", "aud", "jti"] as const).map((k) =>
                        result.standardClaims![k] !== undefined ? (
                          <tr key={k} className="border-b last:border-0">
                            <td className="px-3 py-2 font-mono text-xs">{k}</td>
                            <td className="px-3 py-2">{String(result.standardClaims![k])}</td>
                          </tr>
                        ) : null
                      )}
                      {(["exp", "nbf", "iat"] as const).map((k) => {
                        const raw = result.standardClaims![k];
                        if (raw === undefined) return null;
                        const formatted = typeof raw === "number" ? formatEpoch(raw) : null;
                        return (
                          <tr key={k} className="border-b last:border-0">
                            <td className="px-3 py-2 font-mono text-xs">{k}</td>
                            <td className="px-3 py-2">{formatted ? `${formatted.utc} (UTC) / ${formatted.local} (local)` : String(raw)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <CopyButton text={report} label="Copiar informe" />
        <Button type="button" variant="outline" disabled={!report} onClick={() => downloadTextFile("informe-jwt.txt", report)}>
          Descargar informe (sin claves ni secretos)
        </Button>
        <ResetButton
          onReset={() => {
            setToken("");
            setResult(null);
            setHmacSecret("");
            setPublicKeyText("");
          }}
        />
      </div>
    </div>
  );
}
