"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LabeledSelect } from "@/components/ui/select";
import { CopyButton, DownloadButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { CSP_FETCH_DIRECTIVES, CSP_OTHER_DIRECTIVES, buildCspPolicyText, buildEnforcementHeader, buildReportOnlyHeader, buildMetaTag, buildNextJsSnippet, type CspDirectiveConfig } from "@/lib/public-tools/security-web/csp-generator";
import { analyzeCspWithSummary, type CspFinding } from "@/lib/public-tools/security-web/csp-analysis";

type Mode = "generate" | "analyze";
type OutputFormat = "header" | "report-only" | "meta" | "nextjs";

const DIRECTIVE_LABELS: Record<string, string> = {
  "default-src": "default-src",
  "script-src": "script-src",
  "style-src": "style-src",
  "img-src": "img-src",
  "font-src": "font-src",
  "connect-src": "connect-src",
  "media-src": "media-src",
  "worker-src": "worker-src",
  "frame-src": "frame-src",
  "child-src": "child-src",
  "manifest-src": "manifest-src",
  "object-src": "object-src",
  "base-uri": "base-uri",
  "form-action": "form-action",
  "frame-ancestors": "frame-ancestors",
  "report-to": "report-to",
  "report-uri": "report-uri (legado)",
};

function FindingList({ findings }: { findings: CspFinding[] }) {
  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warning");
  const infos = findings.filter((f) => f.severity === "info");
  return (
    <div className="space-y-3">
      {errors.length > 0 ? (
        <div>
          <p className="text-sm font-semibold text-destructive">Errores ({errors.length})</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-destructive">
            {errors.map((f, i) => (
              <li key={i}>{f.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {warnings.length > 0 ? (
        <div>
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Advertencias ({warnings.length})</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-amber-700 dark:text-amber-400">
            {warnings.map((f, i) => (
              <li key={i}>{f.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {infos.length > 0 ? (
        <div>
          <p className="text-sm font-semibold text-muted-foreground">Información ({infos.length})</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {infos.map((f, i) => (
              <li key={i}>{f.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {findings.length === 0 ? <p className="text-sm text-green-700 dark:text-green-400">Sin observaciones.</p> : null}
    </div>
  );
}

export function CspTool() {
  const [mode, setMode] = useState<Mode>("generate");

  const [directives, setDirectives] = useState<CspDirectiveConfig>({ "default-src": ["'self'"], "object-src": ["'none'"], "base-uri": ["'self'"] });
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("header");
  const [buildError, setBuildError] = useState<string | null>(null);
  const [generatedText, setGeneratedText] = useState("");

  const [analyzeInput, setAnalyzeInput] = useState("default-src *; script-src 'self' unsafe-inline; object-src none;");

  function updateDirective(name: string, value: string) {
    setDirectives((prev) => ({ ...prev, [name]: value.split(/\s+/).filter(Boolean) }));
  }

  function handleGenerate() {
    setBuildError(null);
    const result = buildCspPolicyText({ directives, booleanDirectives: [] });
    if (!result.ok || !result.policyText) {
      setBuildError(result.error ?? "No se pudo generar la política.");
      setGeneratedText("");
      return;
    }
    if (outputFormat === "header") setGeneratedText(buildEnforcementHeader(result.policyText));
    else if (outputFormat === "report-only") setGeneratedText(buildReportOnlyHeader(result.policyText));
    else if (outputFormat === "meta") {
      const { html, omittedDirectives } = buildMetaTag(result.policyText);
      setGeneratedText(omittedDirectives.length > 0 ? `${html}\n\n(Nota: ${omittedDirectives.join(", ")} no son válidas en una etiqueta <meta> y se omitieron.)` : html);
    } else setGeneratedText(buildNextJsSnippet(result.policyText, false));
  }

  const analysis = mode === "analyze" ? analyzeCspWithSummary(analyzeInput) : null;

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">Los datos se procesan en tu dispositivo y no se envían al servidor.</p>
      <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">CSP es una capa adicional y no sustituye el escape, la validación y el saneamiento del contenido.</p>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant={mode === "generate" ? "default" : "outline"} size="sm" onClick={() => setMode("generate")}>
          Generar
        </Button>
        <Button type="button" variant={mode === "analyze" ? "default" : "outline"} size="sm" onClick={() => setMode("analyze")}>
          Analizar
        </Button>
      </div>

      {mode === "generate" ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {[...CSP_FETCH_DIRECTIVES, ...CSP_OTHER_DIRECTIVES].map((name) => (
              <div key={name}>
                <Label htmlFor={`csp-${name}`} className="mb-1 font-mono text-xs">
                  {DIRECTIVE_LABELS[name] ?? name}
                </Label>
                <Input id={`csp-${name}`} value={(directives[name] ?? []).join(" ")} onChange={(e) => updateDirective(name, e.target.value)} placeholder="'self' https://ejemplo.com" className="font-mono text-xs" />
              </div>
            ))}
          </div>

          <div className="max-w-sm">
            <Label htmlFor="csp-output-format" className="mb-1">
              Formato de salida
            </Label>
            <LabeledSelect id="csp-output-format" value={outputFormat} onValueChange={(v) => setOutputFormat(v as OutputFormat)} options={[{ value: "header", label: "Cabecera (enforcement)" }, { value: "report-only", label: "Cabecera Report-Only" }, { value: "meta", label: "Etiqueta <meta>" }, { value: "nextjs", label: "Configuración Next.js" }]} className="w-full" />
          </div>
          <p className="text-xs text-muted-foreground">Report-Only permite observar problemas antes de aplicar la política, pero no bloquea recursos.</p>

          <Button type="button" onClick={handleGenerate}>
            Generar
          </Button>

          {buildError ? (
            <p role="alert" className="text-sm text-destructive">
              {buildError}
            </p>
          ) : null}
          {generatedText ? (
            <div>
              <Textarea readOnly value={generatedText} rows={6} className="font-mono text-xs" />
              <div className="mt-2 flex flex-wrap gap-2">
                <CopyButton text={generatedText} label="Copiar" />
                <DownloadButton content={generatedText} filename="csp.txt" label="Descargar" />
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <Label htmlFor="csp-analyze-input" className="mb-1">
              Política CSP a analizar
            </Label>
            <Textarea id="csp-analyze-input" value={analyzeInput} onChange={(e) => setAnalyzeInput(e.target.value)} rows={5} className="font-mono text-xs" spellCheck={false} />
          </div>
          {analysis ? (
            <div aria-live="polite" className="space-y-3 rounded-lg border p-4">
              <p className="text-sm">
                {analysis.errorCount} error{analysis.errorCount === 1 ? "" : "es"}, {analysis.warningCount} advertencia{analysis.warningCount === 1 ? "" : "s"}, {analysis.infoCount} nota{analysis.infoCount === 1 ? "" : "s"}.
              </p>
              <FindingList findings={analysis.findings} />
              <div className="flex flex-wrap gap-2">
                <CopyButton text={analysis.findings.map((f) => `[${f.severity}] ${f.directive ? `${f.directive}: ` : ""}${f.message}`).join("\n")} label="Copiar informe" />
                <DownloadButton content={analysis.findings.map((f) => `[${f.severity}] ${f.directive ? `${f.directive}: ` : ""}${f.message}`).join("\n")} filename="analisis-csp.txt" label="Descargar" />
              </div>
            </div>
          ) : null}
        </div>
      )}

      <ResetButton
        onReset={() => {
          setDirectives({});
          setGeneratedText("");
          setBuildError(null);
          setAnalyzeInput("");
        }}
      />
    </div>
  );
}
