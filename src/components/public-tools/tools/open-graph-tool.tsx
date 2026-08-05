"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CopyButton, DownloadButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { validateOpenGraph, buildOpenGraphTags, buildOpenGraphJson, type OpenGraphInput } from "@/lib/public-tools/web/open-graph";

const EMPTY: OpenGraphInput = {
  title: "",
  description: "",
  url: "",
  type: "website",
  siteName: "",
  imageUrl: "",
  imageWidth: null,
  imageHeight: null,
  imageAlt: "",
  locale: "es_ES",
  author: "",
  twitterCard: "summary_large_image",
  twitterSite: "",
  twitterCreator: "",
};

const SEVERITY_STYLE: Record<string, string> = {
  ERROR: "text-destructive",
  WARNING: "text-amber-600 dark:text-amber-400",
  INFO: "text-muted-foreground",
};

export function OpenGraphTool() {
  const [input, setInput] = useState<OpenGraphInput>(EMPTY);

  function update<K extends keyof OpenGraphInput>(key: K, value: OpenGraphInput[K]) {
    setInput((prev) => ({ ...prev, [key]: value }));
  }

  const findings = useMemo(() => validateOpenGraph(input), [input]);
  const tags = useMemo(() => buildOpenGraphTags(input), [input]);
  const json = useMemo(() => buildOpenGraphJson(input), [input]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <div>
            <Label htmlFor="og-title" className="mb-1">
              Título
            </Label>
            <Input id="og-title" value={input.title} onChange={(e) => update("title", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="og-description" className="mb-1">
              Descripción
            </Label>
            <Textarea id="og-description" value={input.description} onChange={(e) => update("description", e.target.value)} rows={3} />
          </div>
          <div>
            <Label htmlFor="og-url" className="mb-1">
              URL canónica
            </Label>
            <Input id="og-url" value={input.url} onChange={(e) => update("url", e.target.value)} placeholder="https://ejemplo.com/pagina" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="og-type" className="mb-1">
                Tipo
              </Label>
              <Input id="og-type" value={input.type} onChange={(e) => update("type", e.target.value)} placeholder="website, article..." />
            </div>
            <div>
              <Label htmlFor="og-sitename" className="mb-1">
                Nombre del sitio
              </Label>
              <Input id="og-sitename" value={input.siteName} onChange={(e) => update("siteName", e.target.value)} />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div>
            <Label htmlFor="og-image" className="mb-1">
              URL de la imagen
            </Label>
            <Input id="og-image" value={input.imageUrl} onChange={(e) => update("imageUrl", e.target.value)} placeholder="https://ejemplo.com/imagen.jpg" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input aria-label="Ancho de la imagen" type="number" placeholder="Ancho (px)" value={input.imageWidth ?? ""} onChange={(e) => update("imageWidth", e.target.value ? Number(e.target.value) : null)} />
            <Input aria-label="Alto de la imagen" type="number" placeholder="Alto (px)" value={input.imageHeight ?? ""} onChange={(e) => update("imageHeight", e.target.value ? Number(e.target.value) : null)} />
          </div>
          <Input aria-label="Texto alternativo de la imagen" placeholder="Texto alternativo de la imagen" value={input.imageAlt} onChange={(e) => update("imageAlt", e.target.value)} />
          <Input aria-label="Locale" placeholder="Locale (ej. es_ES)" value={input.locale} onChange={(e) => update("locale", e.target.value)} />
          <Input aria-label="Autor" placeholder="Autor (opcional)" value={input.author} onChange={(e) => update("author", e.target.value)} />
          <div>
            <Label htmlFor="og-twcard" className="mb-1">
              Twitter card
            </Label>
            <Select value={input.twitterCard} onValueChange={(v) => update("twitterCard", v as OpenGraphInput["twitterCard"])}>
              <SelectTrigger id="og-twcard" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="summary">summary</SelectItem>
                <SelectItem value="summary_large_image">summary_large_image</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input aria-label="Twitter site" placeholder="@sitio" value={input.twitterSite} onChange={(e) => update("twitterSite", e.target.value)} />
            <Input aria-label="Twitter creator" placeholder="@autor" value={input.twitterCreator} onChange={(e) => update("twitterCreator", e.target.value)} />
          </div>
        </div>
      </div>

      {findings.length > 0 ? (
        <ul aria-live="polite" className="space-y-1 rounded-lg border p-3 text-sm">
          {findings.map((f, i) => (
            <li key={i} className={SEVERITY_STYLE[f.severity]}>
              [{f.severity}] {f.message}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="space-y-2 rounded-lg border p-4">
        <p className="text-sm font-medium">Vista previa aproximada</p>
        <p className="text-xs text-muted-foreground">
          Aproximación general — no es idéntica a X, LinkedIn ni a ninguna aplicación de mensajería específica.
        </p>
        <div className="max-w-sm overflow-hidden rounded-lg border">
          {input.imageUrl ? (
            <div className="flex h-32 items-center justify-center bg-muted text-xs text-muted-foreground">Imagen: {input.imageUrl}</div>
          ) : null}
          <div className="space-y-1 p-3">
            <p className="line-clamp-2 text-sm font-medium">{input.title || "Título de ejemplo"}</p>
            <p className="line-clamp-2 text-xs text-muted-foreground">{input.description || "Descripción de ejemplo"}</p>
            <p className="text-xs uppercase text-muted-foreground">{input.siteName || (input.url ? new URL(safeUrl(input.url)).hostname : "ejemplo.com")}</p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="og-output" className="mb-1">
          Etiquetas generadas
        </Label>
        <Textarea id="og-output" readOnly value={tags} rows={10} className="font-mono text-xs" />
        <div className="flex flex-wrap gap-2">
          <CopyButton text={tags} label="Copiar etiquetas" />
          <DownloadButton content={tags} filename="open-graph.html" mimeType="text/html" label="Descargar .html" />
          <DownloadButton content={json} filename="open-graph.json" mimeType="application/json" label="Descargar JSON" />
          <ResetButton onReset={() => setInput(EMPTY)} />
        </div>
      </div>
    </div>
  );
}

function safeUrl(raw: string): string {
  try {
    return new URL(raw).toString();
  } catch {
    return "https://ejemplo.com";
  }
}
