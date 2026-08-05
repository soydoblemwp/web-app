"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CopyButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { downloadTextFile, buildCsv } from "@/lib/public-tools/csv-export";
import { buildUtmUrl, UTM_PRESETS, type UtmParams } from "@/lib/public-tools/utm";

const HISTORY_STORAGE_KEY = "public-tools:utm-history";

export function UtmGeneratorTool() {
  const [params, setParams] = useState<UtmParams>({ url: "", source: "", medium: "", campaign: "", term: "", content: "" });
  const [keepHistory, setKeepHistory] = useState(false);
  const [history, setHistory] = useState<string[]>([]);

  const result = useMemo(() => buildUtmUrl(params), [params]);

  function set<K extends keyof UtmParams>(key: K, value: UtmParams[K]) {
    setParams((prev) => ({ ...prev, [key]: value }));
  }

  function applyPreset(presetId: string) {
    const preset = UTM_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setParams((prev) => ({ ...prev, source: preset.source, medium: preset.medium }));
  }

  function handleGenerate() {
    if (!result.ok || !result.finalUrl) return;
    if (keepHistory) {
      const next = [result.finalUrl, ...history].slice(0, 20);
      setHistory(next);
      try {
        window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // localStorage may be unavailable (private mode); history simply won't persist across reloads.
      }
    }
  }

  function exportCsv() {
    const csv = buildCsv(["url"], history.map((url) => [url]));
    downloadTextFile("historial-utm.csv", csv, "text/csv;charset=utf-8");
  }

  function clearHistory() {
    setHistory([]);
    try {
      window.localStorage.removeItem(HISTORY_STORAGE_KEY);
    } catch {
      // no-op
    }
  }

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Presets por plataforma" className="flex flex-wrap gap-2">
        {UTM_PRESETS.map((preset) => (
          <Button key={preset.id} type="button" variant="outline" size="sm" onClick={() => applyPreset(preset.id)}>
            {preset.label}
          </Button>
        ))}
      </div>

      <div>
        <Label htmlFor="utm-url" className="mb-1">
          URL de destino
        </Label>
        <Input id="utm-url" value={params.url} onChange={(e) => set("url", e.target.value)} placeholder="https://ejemplo.com/pagina" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="utm-source" className="mb-1">
            utm_source
          </Label>
          <Input id="utm-source" value={params.source} onChange={(e) => set("source", e.target.value)} placeholder="newsletter" />
        </div>
        <div>
          <Label htmlFor="utm-medium" className="mb-1">
            utm_medium
          </Label>
          <Input id="utm-medium" value={params.medium} onChange={(e) => set("medium", e.target.value)} placeholder="email" />
        </div>
        <div>
          <Label htmlFor="utm-campaign" className="mb-1">
            utm_campaign
          </Label>
          <Input id="utm-campaign" value={params.campaign} onChange={(e) => set("campaign", e.target.value)} placeholder="lanzamiento-otono" />
        </div>
        <div>
          <Label htmlFor="utm-term" className="mb-1">
            utm_term (opcional)
          </Label>
          <Input id="utm-term" value={params.term ?? ""} onChange={(e) => set("term", e.target.value)} />
        </div>
        <div>
          <Label htmlFor="utm-content" className="mb-1">
            utm_content (opcional)
          </Label>
          <Input id="utm-content" value={params.content ?? ""} onChange={(e) => set("content", e.target.value)} />
        </div>
      </div>

      {!result.ok && result.error && (params.url || params.source || params.medium || params.campaign) ? (
        <p role="alert" className="text-sm text-destructive">
          {result.error}
        </p>
      ) : null}

      {result.ok && result.existingUtmParams && result.existingUtmParams.length > 0 ? (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Aviso: la URL ya contenía estos parámetros UTM, que se sobrescribirán: {result.existingUtmParams.join(", ")}.
        </p>
      ) : null}

      {result.ok && result.finalUrl ? (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <p className="break-all text-sm">{result.finalUrl}</p>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={result.finalUrl} label="Copiar enlace" />
            <Button type="button" variant="outline" size="sm" onClick={handleGenerate}>
              Guardar en historial local
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <Checkbox id="utm-keep-history" checked={keepHistory} onCheckedChange={() => setKeepHistory((v) => !v)} />
        <Label htmlFor="utm-keep-history" className="text-sm font-normal">
          Guardar un historial local de enlaces generados en esta sesión (opcional, nunca se envía a ningún servidor)
        </Label>
      </div>

      {history.length > 0 ? (
        <div>
          <h3 className="mb-2 text-sm font-medium">Historial local ({history.length})</h3>
          <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-muted-foreground">
            {history.map((url) => (
              <li key={url} className="truncate">
                {url}
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={exportCsv}>
              Exportar CSV
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={clearHistory}>
              Borrar historial
            </Button>
          </div>
        </div>
      ) : null}

      <ResetButton onReset={() => setParams({ url: "", source: "", medium: "", campaign: "", term: "", content: "" })} />
    </div>
  );
}
