"use client";

import { useEffect, useMemo, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import { CopyButton, DownloadButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { renderMarkdownToHtml, computeMarkdownStats } from "@/lib/public-tools/development/markdown";

type ViewMode = "split" | "editor" | "preview";

const SAMPLE = "# Título\n\nEscribe **Markdown** aquí y verás la *vista previa* en tiempo real.\n\n- Elemento 1\n- Elemento 2\n\n[Enlace de ejemplo](https://example.com)";

export function MarkdownEditorTool() {
  const [markdown, setMarkdown] = useState("");
  const [debounced, setDebounced] = useState("");
  const [mode, setMode] = useState<ViewMode>("split");
  const [history, setHistory] = useState<string[]>([""]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Debounce the preview render for large documents so every keystroke doesn't re-render the whole tree.
  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(markdown), 150);
    return () => clearTimeout(timeout);
  }, [markdown]);

  const html = useMemo(() => renderMarkdownToHtml(debounced), [debounced]);
  const stats = useMemo(() => computeMarkdownStats(markdown), [markdown]);

  function commitChange(next: string) {
    setMarkdown(next);
    setHistory((prev) => [...prev.slice(0, historyIndex + 1), next]);
    setHistoryIndex((prev) => prev + 1);
  }

  function handleUndo() {
    if (historyIndex === 0) return;
    setHistoryIndex((prev) => prev - 1);
    setMarkdown(history[historyIndex - 1]);
  }
  function handleRedo() {
    if (historyIndex >= history.length - 1) return;
    setHistoryIndex((prev) => prev + 1);
    setMarkdown(history[historyIndex + 1]);
  }

  function handleFileOpen(files: File[]) {
    const file = files[0];
    if (!file) return;
    file.text().then((text) => commitChange(text));
  }

  function handleReset() {
    setMarkdown("");
    setHistory([""]);
    setHistoryIndex(0);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant={mode === "split" ? "default" : "outline"} size="sm" onClick={() => setMode("split")}>
          Dividido
        </Button>
        <Button type="button" variant={mode === "editor" ? "default" : "outline"} size="sm" onClick={() => setMode("editor")}>
          Solo editor
        </Button>
        <Button type="button" variant={mode === "preview" ? "default" : "outline"} size="sm" onClick={() => setMode("preview")}>
          Solo vista previa
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={handleUndo} disabled={historyIndex === 0}>
          Deshacer
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={handleRedo} disabled={historyIndex >= history.length - 1}>
          Rehacer
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => commitChange(SAMPLE)}>
          Cargar ejemplo
        </Button>
      </div>

      <FileUploadZone accept=".md,.txt,text/markdown,text/plain" onFilesSelected={handleFileOpen} label="Arrastra un archivo .md o .txt aquí, o" hint="Se procesa localmente." />

      <div className={mode === "split" ? "grid gap-4 sm:grid-cols-2" : "grid gap-4"}>
        {mode !== "preview" ? (
          <div>
            <label htmlFor="markdown-input" className="sr-only">
              Editor Markdown
            </label>
            <Textarea id="markdown-input" value={markdown} onChange={(e) => commitChange(e.target.value)} rows={18} className="font-mono text-sm" placeholder="Escribe Markdown aquí..." />
          </div>
        ) : null}
        {mode !== "editor" ? (
          <div>
            <p className="mb-1 text-sm font-medium">Vista previa</p>
            <div
              className="prose prose-sm dark:prose-invert max-w-none rounded-lg border p-4"
              style={{ minHeight: "18rem" }}
              // html comes exclusively from renderMarkdownToHtml(), which never passes through raw user HTML — every tag is one of the renderer's own fixed set, and all text content is escaped.
              dangerouslySetInnerHTML={{ __html: html || "<p></p>" }}
            />
          </div>
        ) : null}
      </div>

      <div aria-live="polite" className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span>{stats.words} palabras</span>
        <span>{stats.characters} caracteres</span>
        <span>{stats.headings} encabezados</span>
        <span>{stats.links} enlaces</span>
        <span>{stats.images} imágenes</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <CopyButton text={markdown} label="Copiar Markdown" />
        <CopyButton text={html} label="Copiar HTML" />
        <DownloadButton content={markdown} filename="documento.md" mimeType="text/markdown" label="Descargar .md" />
        <DownloadButton content={html} filename="documento.html" mimeType="text/html" label="Descargar HTML saneado" />
        <ResetButton onReset={handleReset} />
      </div>
    </div>
  );
}
