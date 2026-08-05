"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import { CopyButton, DownloadButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { downloadBlob } from "@/lib/public-tools/files/download";
import {
  parseUrlList,
  validateSitemapEntries,
  findDuplicateUrls,
  buildSitemapXml,
  buildSitemapIndexXml,
  splitSitemapEntries,
  type SitemapUrlEntry,
} from "@/lib/public-tools/web/sitemap-builder";

const MAX_PER_FILE = 500;

function emptyEntry(): SitemapUrlEntry {
  return { url: "", lastmod: "", changefreq: "", priority: "" };
}

export function SitemapGeneratorTool() {
  const [entries, setEntries] = useState<SitemapUrlEntry[]>([emptyEntry()]);
  const [pasteText, setPasteText] = useState("");
  const [hostname, setHostname] = useState("");
  const [busy, setBusy] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);

  function updateEntry(index: number, field: keyof SitemapUrlEntry, value: string) {
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, [field]: value } : e)));
  }
  function removeEntry(index: number) {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  }
  function addEntry() {
    setEntries((prev) => [...prev, emptyEntry()]);
  }
  function handleImportUrls() {
    const urls = parseUrlList(pasteText);
    setEntries((prev) => [...prev.filter((e) => e.url.trim()), ...urls.map((url) => ({ url, lastmod: "", changefreq: "", priority: "" }))]);
    setPasteText("");
  }
  function handleFileImport(files: File[]) {
    const file = files[0];
    if (!file) return;
    file.text().then((text) => setPasteText((prev) => (prev ? `${prev}\n${text}` : text)));
  }
  function removeDuplicates() {
    const duplicates = findDuplicateUrls(entries);
    setEntries((prev) => prev.filter((_, i) => !duplicates.has(i)));
  }

  const duplicates = useMemo(() => findDuplicateUrls(entries), [entries]);
  const findings = useMemo(() => validateSitemapEntries(entries, hostname.trim() || null), [entries, hostname]);
  const validEntries = useMemo(() => entries.filter((e) => e.url.trim()), [entries]);
  const xml = useMemo(() => buildSitemapXml(validEntries), [validEntries]);
  const needsSplit = validEntries.length > MAX_PER_FILE;
  const errorCount = findings.filter((f) => f.severity === "ERROR").length;

  async function handleDownloadZip() {
    setZipError(null);
    setBusy(true);
    try {
      const { buildZip } = await import("@/lib/public-tools/files/zip");
      const chunks = splitSitemapEntries(validEntries, MAX_PER_FILE);
      const sitemapFilenames = chunks.map((_, i) => `sitemap-${i + 1}.xml`);
      const entries2 = chunks.map((chunk, i) => ({ name: sitemapFilenames[i], data: new TextEncoder().encode(buildSitemapXml(chunk)) }));
      const indexUrls = sitemapFilenames.map((name) => (hostname ? `https://${hostname}/${name}` : name));
      entries2.push({ name: "sitemap-index.xml", data: new TextEncoder().encode(buildSitemapIndexXml(indexUrls)) });
      const result = buildZip(entries2);
      if (!result.ok || !result.bytes) {
        setZipError(result.error?.message ?? "No se pudo generar el ZIP.");
        return;
      }
      downloadBlob("sitemaps.zip", result.bytes, "application/zip");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Label htmlFor="sitemap-hostname" className="mb-1">
          Hostname principal (opcional, para detectar URLs externas)
        </Label>
        <Input id="sitemap-hostname" value={hostname} onChange={(e) => setHostname(e.target.value)} placeholder="ejemplo.com" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="sitemap-paste" className="mb-1">
          Pegar lista de URLs (una por línea) o importar TXT/CSV
        </Label>
        <Textarea id="sitemap-paste" value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={4} placeholder="https://ejemplo.com/pagina-1&#10;https://ejemplo.com/pagina-2" />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleImportUrls}>
            Añadir URLs
          </Button>
          <FileUploadZone accept=".txt,.csv,text/plain,text/csv" multiple={false} onFilesSelected={handleFileImport} label="o importa un archivo" hint="" />
        </div>
      </div>

      <div className="space-y-2">
        {entries.map((entry, index) => (
          <div key={index} className="grid grid-cols-2 gap-2 rounded-lg border p-3 sm:grid-cols-5">
            <Input className="sm:col-span-2" aria-label={`URL ${index + 1}`} placeholder="https://ejemplo.com/pagina" value={entry.url} onChange={(e) => updateEntry(index, "url", e.target.value)} />
            <Input aria-label={`lastmod ${index + 1}`} placeholder="lastmod (AAAA-MM-DD)" value={entry.lastmod} onChange={(e) => updateEntry(index, "lastmod", e.target.value)} />
            <Input aria-label={`changefreq ${index + 1}`} placeholder="changefreq" value={entry.changefreq} onChange={(e) => updateEntry(index, "changefreq", e.target.value)} />
            <div className="flex gap-1">
              <Input aria-label={`priority ${index + 1}`} placeholder="priority" value={entry.priority} onChange={(e) => updateEntry(index, "priority", e.target.value)} />
              <Button type="button" variant="ghost" size="sm" onClick={() => removeEntry(index)}>
                ✕
              </Button>
            </div>
            {duplicates.has(index) ? <p className="col-span-full text-xs text-amber-600 dark:text-amber-400">URL duplicada</p> : null}
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={addEntry}>
            Añadir URL
          </Button>
          {duplicates.size > 0 ? (
            <Button type="button" variant="outline" size="sm" onClick={removeDuplicates}>
              Eliminar duplicados ({duplicates.size})
            </Button>
          ) : null}
        </div>
      </div>

      {findings.length > 0 ? (
        <div aria-live="polite" className="max-h-48 space-y-1 overflow-y-auto rounded-lg border p-3 text-sm">
          {findings.map((f, i) => (
            <p key={i} className={f.severity === "ERROR" ? "text-destructive" : f.severity === "WARNING" ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}>
              Fila {f.index + 1} ({f.field}): {f.message}
            </p>
          ))}
        </div>
      ) : null}

      <p className="text-sm text-muted-foreground">
        {validEntries.length} URL(s) válidas de {entries.length}. {errorCount > 0 ? `${errorCount} error(es) deben corregirse antes de descargar.` : ""}
      </p>

      {!needsSplit ? (
        <div className="space-y-2">
          <Textarea readOnly value={xml} rows={8} className="font-mono text-xs" aria-label="XML del sitemap generado" />
          <div className="flex flex-wrap gap-2">
            <CopyButton text={xml} label="Copiar XML" />
            <DownloadButton content={xml} filename="sitemap.xml" mimeType="application/xml" label="Descargar sitemap.xml" />
          </div>
        </div>
      ) : (
        <div className="space-y-2 rounded-lg border border-dashed p-4 text-sm">
          <p>
            El total supera el límite de {MAX_PER_FILE} URLs por archivo. Se dividirá en {Math.ceil(validEntries.length / MAX_PER_FILE)} archivos con un sitemap index.
          </p>
          <Button type="button" onClick={handleDownloadZip} disabled={busy || errorCount > 0}>
            {busy ? "Generando..." : "Descargar ZIP (sitemaps + index)"}
          </Button>
          {zipError ? (
            <p role="alert" className="text-destructive">
              {zipError}
            </p>
          ) : null}
        </div>
      )}

      <ResetButton onReset={() => setEntries([emptyEntry()])} />

      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
        Un sitemap ayuda a comunicar URLs importantes, pero no garantiza que sean rastreadas o indexadas. Algunos motores pueden ignorar changefreq o priority.
      </p>
    </div>
  );
}
