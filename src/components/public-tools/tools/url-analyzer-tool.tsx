"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CopyButton, DownloadButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { parseAbsoluteUrl, parseRelativeUrl, buildUrlFromComponents, applyQueryParamOperation, paramsToSearchString, normalizeUrl, type ParseUrlResult, type UrlQueryParam } from "@/lib/public-tools/network/url-parser";

const DANGEROUS_SCHEMES = new Set(["javascript", "vbscript"]);

export function UrlAnalyzerTool() {
  const [inputUrl, setInputUrl] = useState("https://user@ejemplo.com:8080/ruta/pagina?buscar=hola&buscar=mundo&id=42#seccion");
  const [useBase, setUseBase] = useState(false);
  const [baseUrl, setBaseUrl] = useState("https://ejemplo.com/");
  const [result, setResult] = useState<ParseUrlResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useState<UrlQueryParam[]>([]);
  const [sortParams, setSortParams] = useState(false);
  const [normOptions, setNormOptions] = useState({ lowercaseHost: false, removeDefaultPort: false, removeTrailingSlash: false, removeFragment: false, sortQueryParams: false });
  const [normalizedHref, setNormalizedHref] = useState<string | null>(null);

  function handleAnalyze() {
    setError(null);
    setNormalizedHref(null);
    const r = useBase ? parseRelativeUrl(inputUrl, baseUrl) : parseAbsoluteUrl(inputUrl);
    if (!r.ok) {
      setError(r.error ?? "URL inválida.");
      setResult(null);
      setParams([]);
      return;
    }
    setResult(r);
    setParams(r.queryParams ?? []);
  }

  function handleRebuild() {
    if (!result?.components) return;
    const search = paramsToSearchString(params, sortParams);
    const built = buildUrlFromComponents({
      scheme: result.components.scheme,
      username: result.components.username,
      password: result.components.password,
      hostname: result.components.hostnameAscii,
      port: result.components.port,
      pathname: result.components.pathname,
      search,
      hash: result.components.hash,
    });
    if (!built.ok) {
      setError(built.error ?? "No se pudo reconstruir la URL.");
      return;
    }
    setResult({ ...result, components: { ...result.components, href: built.href!, search } });
  }

  function handleNormalize() {
    if (!result?.components) return;
    const r = normalizeUrl(result.components.href, normOptions);
    if (!r.ok) return setError(r.error ?? "No se pudo normalizar.");
    setNormalizedHref(r.href ?? null);
  }

  const isDangerous = result?.components ? DANGEROUS_SCHEMES.has(result.components.scheme.toLowerCase()) : false;

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">Los datos se procesan en tu dispositivo y no se envían al servidor. Esta herramienta nunca navega a la URL, ni hace fetch, ni resuelve DNS.</p>

      <div>
        <Label htmlFor="url-input" className="mb-1">
          URL a analizar
        </Label>
        <Input id="url-input" value={inputUrl} onChange={(e) => setInputUrl(e.target.value)} className="font-mono text-sm" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={useBase} onCheckedChange={(c) => setUseBase(Boolean(c))} /> Es una URL relativa (usar una URL base)
      </label>
      {useBase ? (
        <div>
          <Label htmlFor="url-base" className="mb-1">
            URL base
          </Label>
          <Input id="url-base" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="font-mono text-sm" />
        </div>
      ) : null}

      <Button type="button" onClick={handleAnalyze}>
        Analizar
      </Button>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {result?.components ? (
        <div aria-live="polite" className="space-y-4">
          {isDangerous ? (
            <p role="alert" className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              Esquema peligroso detectado (&quot;{result.components.scheme}:&quot;). Esta herramienta lo muestra como texto, nunca como un enlace pulsable.
            </p>
          ) : null}

          {(result.warnings ?? []).length > 0 ? (
            <div className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              {(result.warnings ?? []).map((w, i) => (
                <p key={i}>
                  [{w.severity === "danger" ? "peligro" : "aviso"}] {w.message}
                </p>
              ))}
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[420px] text-sm">
              <tbody>
                {[
                  ["scheme", result.components.scheme],
                  ["username", result.components.username || "—"],
                  ["password", result.components.password ? "•••• (presente)" : "—"],
                  ["hostname (ASCII/punycode)", result.components.hostnameAscii],
                  ["hostname (Unicode, como se escribió)", result.components.hostnameUnicode],
                  ["port", result.components.port || "(por defecto)"],
                  ["pathname", result.components.pathname],
                  ["search", result.components.search || "—"],
                  ["hash", result.components.hash || "—"],
                  ["origin", result.components.origin],
                  ["host", result.components.host],
                  ["href", result.components.href],
                ].map(([k, v]) => (
                  <tr key={k} className="border-b last:border-0">
                    <th scope="row" className="px-3 py-2 text-left font-normal text-muted-foreground">
                      {k}
                    </th>
                    <td className="px-3 py-2 font-mono text-xs break-all">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Parámetros de consulta</Label>
              <label className="flex items-center gap-2 text-xs">
                <Checkbox checked={sortParams} onCheckedChange={(c) => setSortParams(Boolean(c))} /> Ordenar alfabéticamente
              </label>
            </div>
            {(result.duplicateParamKeys ?? []).length > 0 ? <p className="text-xs text-amber-700 dark:text-amber-400">Claves duplicadas: {(result.duplicateParamKeys ?? []).join(", ")}</p> : null}
            <div className="space-y-2">
              {params.map((p, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <Input aria-label={`Clave del parámetro ${i + 1}`} value={p.key} onChange={(e) => setParams((prev) => applyQueryParamOperation(prev, { kind: "rename", index: i, newKey: e.target.value }))} className="font-mono text-xs" />
                  <Input aria-label={`Valor del parámetro ${i + 1}`} value={p.value} onChange={(e) => setParams((prev) => applyQueryParamOperation(prev, { kind: "update", index: i, value: e.target.value }))} className="font-mono text-xs" />
                  <Button type="button" variant="ghost" size="sm" onClick={() => setParams((prev) => applyQueryParamOperation(prev, { kind: "remove", index: i }))}>
                    Eliminar
                  </Button>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setParams((prev) => applyQueryParamOperation(prev, { kind: "add", key: "", value: "" }))}>
              Añadir parámetro
            </Button>
          </div>

          <Button type="button" onClick={handleRebuild}>
            Reconstruir URL
          </Button>

          <div className="space-y-2 rounded-lg border p-3">
            <Label>Normalización (opcional — nunca automática)</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["lowercaseHost", "Minúsculas en el host"],
                  ["removeDefaultPort", "Quitar puerto por defecto"],
                  ["removeTrailingSlash", "Quitar barra final"],
                  ["removeFragment", "Quitar fragmento (#...)"],
                  ["sortQueryParams", "Ordenar parámetros"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-xs">
                  <Checkbox checked={normOptions[key]} onCheckedChange={(c) => setNormOptions((prev) => ({ ...prev, [key]: Boolean(c) }))} /> {label}
                </label>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={handleNormalize}>
              Normalizar
            </Button>
            {normalizedHref ? (
              <p className="font-mono text-xs break-all">
                {normalizedHref}
                <br />
                <span className="text-muted-foreground">No se afirma que sea semánticamente equivalente a la original — solo aplica las transformaciones marcadas.</span>
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <CopyButton text={result?.components?.href ?? ""} label="Copiar URL" />
        <DownloadButton content={result?.components?.href ?? ""} filename="url.txt" label="Descargar" />
        <ResetButton
          onReset={() => {
            setInputUrl("");
            setResult(null);
            setError(null);
            setParams([]);
            setNormalizedHref(null);
          }}
        />
      </div>
    </div>
  );
}
