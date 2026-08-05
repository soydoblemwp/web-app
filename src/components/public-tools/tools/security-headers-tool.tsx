"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LabeledSelect } from "@/components/ui/select";
import { CopyButton, DownloadButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import { parseRawHeaders, analyzeHeaders, type HeaderAnalysisRow } from "@/lib/public-tools/security-web/security-headers";
import { generateHeaderProfile, formatHeaders, type SecurityHeaderProfile, type HeaderOutputFormat } from "@/lib/public-tools/security-web/security-header-analysis";

type Mode = "analyze" | "generate";

const SAMPLE_HEADERS = "HTTP/1.1 200 OK\nContent-Type: text/html\nX-Content-Type-Options: nosniff\nX-Frame-Options: SAMEORIGIN\n";

export function SecurityHeadersTool() {
  const [mode, setMode] = useState<Mode>("analyze");

  const [headerText, setHeaderText] = useState(SAMPLE_HEADERS);
  const [analysisRows, setAnalysisRows] = useState<HeaderAnalysisRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [profile, setProfile] = useState<SecurityHeaderProfile>("webapp");
  const [outputFormat, setOutputFormat] = useState<HeaderOutputFormat>("raw");

  function handleAnalyze() {
    setError(null);
    const parsed = parseRawHeaders(headerText);
    if (!parsed.ok) {
      setError(parsed.error ?? "No se pudieron analizar las cabeceras.");
      setAnalysisRows(null);
      return;
    }
    setAnalysisRows(analyzeHeaders(parsed));
  }

  function handleImportFile(files: File[]) {
    const file = files[0];
    if (!file) return;
    file.text().then((text) => setHeaderText(text));
  }

  const generated = generateHeaderProfile(profile);
  const generatedText = formatHeaders(generated, outputFormat);

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">Los datos se procesan en tu dispositivo y no se envían al servidor. Esta herramienta nunca realiza una petición HTTP.</p>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant={mode === "analyze" ? "default" : "outline"} size="sm" onClick={() => setMode("analyze")}>
          Analizar cabeceras pegadas
        </Button>
        <Button type="button" variant={mode === "generate" ? "default" : "outline"} size="sm" onClick={() => setMode("generate")}>
          Generar configuración
        </Button>
      </div>

      {mode === "analyze" ? (
        <div className="space-y-4">
          <div>
            <Label htmlFor="headers-input" className="mb-1">
              Pega las cabeceras HTTP (una por línea, &quot;Nombre: valor&quot;)
            </Label>
            <Textarea id="headers-input" value={headerText} onChange={(e) => setHeaderText(e.target.value)} rows={10} className="font-mono text-xs" spellCheck={false} />
            <FileUploadZone accept=".txt,text/plain" onFilesSelected={handleImportFile} label="o carga un archivo .txt con las cabeceras" hint="" />
          </div>
          <Button type="button" onClick={handleAnalyze}>
            Analizar
          </Button>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {analysisRows ? (
            <div aria-live="polite" className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th scope="col" className="px-3 py-2 text-left">
                      Cabecera
                    </th>
                    <th scope="col" className="px-3 py-2 text-left">
                      Presencia
                    </th>
                    <th scope="col" className="px-3 py-2 text-left">
                      Valor
                    </th>
                    <th scope="col" className="px-3 py-2 text-left">
                      Nota
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {analysisRows.map((row) => (
                    <tr key={row.name} className="border-b last:border-0 align-top">
                      <td className="px-3 py-2 font-mono text-xs">{row.name}</td>
                      <td className="px-3 py-2">{row.presence === "present" ? "Presente" : "Ausente"}</td>
                      <td className="px-3 py-2 font-mono text-xs">{row.values.join(" / ") || "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{row.advice ?? row.purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {analysisRows ? (
            <div className="flex flex-wrap gap-2">
              <CopyButton text={analysisRows.map((r) => `${r.name}: ${r.presence}${r.advice ? ` — ${r.advice}` : ""}`).join("\n")} label="Copiar informe" />
              <DownloadButton content={analysisRows.map((r) => `${r.name}: ${r.presence}${r.advice ? ` — ${r.advice}` : ""}`).join("\n")} filename="analisis-cabeceras.txt" label="Descargar" />
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="headers-profile" className="mb-1">
                Perfil
              </Label>
              <LabeledSelect id="headers-profile" value={profile} onValueChange={(v) => setProfile(v as SecurityHeaderProfile)} options={[{ value: "static", label: "Sitio estático" }, { value: "webapp", label: "Aplicación web" }, { value: "api", label: "API JSON" }, { value: "custom", label: "Personalizado (mínimo)" }]} className="w-full" />
            </div>
            <div>
              <Label htmlFor="headers-format" className="mb-1">
                Formato
              </Label>
              <LabeledSelect id="headers-format" value={outputFormat} onValueChange={(v) => setOutputFormat(v as HeaderOutputFormat)} options={[{ value: "raw", label: "Cabeceras planas" }, { value: "nextjs", label: "Next.js" }, { value: "nginx", label: "Nginx" }, { value: "apache", label: "Apache" }]} className="w-full" />
            </div>
          </div>

          {generated.some((h) => h.warning) ? (
            <div className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              {generated
                .filter((h) => h.warning)
                .map((h) => (
                  <p key={h.name}>
                    <strong>{h.name}:</strong> {h.warning}
                  </p>
                ))}
            </div>
          ) : null}

          <Textarea readOnly value={generatedText} rows={10} className="font-mono text-xs" />
          <div className="flex flex-wrap gap-2">
            <CopyButton text={generatedText} label="Copiar" />
            <DownloadButton content={generatedText} filename={`cabeceras-seguridad.${outputFormat === "raw" ? "txt" : outputFormat === "nextjs" ? "ts" : "conf"}`} label="Descargar" />
          </div>
        </div>
      )}

      <ResetButton
        onReset={() => {
          setHeaderText("");
          setAnalysisRows(null);
          setError(null);
        }}
      />
    </div>
  );
}
