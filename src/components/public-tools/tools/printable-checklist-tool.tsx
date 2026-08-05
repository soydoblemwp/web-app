"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CopyButton, DownloadButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import {
  createDefaultChecklist,
  createChecklistItem,
  createChecklistSection,
  validateChecklist,
  computeChecklistStats,
  checklistToMarkdown,
  checklistToPlainText,
  type ChecklistData,
} from "@/lib/public-tools/organization/checklist";
import { buildChecklistPdf } from "@/lib/public-tools/organization/checklist-pdf";
import { buildDocumentEnvelope, parseDocumentEnvelope } from "@/lib/public-tools/documents/json-schema";
import { downloadBlob } from "@/lib/public-tools/files/download";
import { sanitizeFilename } from "@/lib/public-tools/files/filenames";

const TOOL_ID = "generador-listas-verificacion";

export function PrintableChecklistTool() {
  const [data, setData] = useState<ChecklistData>(createDefaultChecklist());
  const [includeState, setIncludeState] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const validation = validateChecklist(data);
  const stats = computeChecklistStats(data);

  function patch(p: Partial<ChecklistData>) {
    setData((prev) => ({ ...prev, ...p }));
  }
  function updateSection(id: string, patch2: Partial<ChecklistData["sections"][number]>) {
    setData((prev) => ({ ...prev, sections: prev.sections.map((s) => (s.id === id ? { ...s, ...patch2 } : s)) }));
  }
  function updateItem(sectionId: string, itemId: string, patch2: Partial<ChecklistData["sections"][number]["items"][number]>) {
    setData((prev) => ({ ...prev, sections: prev.sections.map((s) => (s.id !== sectionId ? s : { ...s, items: s.items.map((it) => (it.id === itemId ? { ...it, ...patch2 } : it)) })) }));
  }
  function removeItem(sectionId: string, itemId: string) {
    setData((prev) => ({ ...prev, sections: prev.sections.map((s) => (s.id !== sectionId ? s : { ...s, items: s.items.filter((it) => it.id !== itemId) })) }));
  }

  async function handleDownloadPdf() {
    setError(null);
    try {
      const bytes = await buildChecklistPdf(data, includeState);
      downloadBlob(sanitizeFilename(`lista-${data.title || "verificacion"}.pdf`), bytes, "application/pdf");
    } catch {
      setError("No se pudo generar el PDF de la lista.");
    }
  }

  function handleImportJson(files: File[]) {
    const file = files[0];
    if (!file) return;
    file.text().then((text) => {
      const result = parseDocumentEnvelope<ChecklistData>(text, TOOL_ID);
      if (!result.ok || !result.data) {
        setError(result.error ?? "No se pudo importar el archivo.");
        return;
      }
      setError(null);
      setData(result.data);
    });
  }

  function handleReset() {
    setData(createDefaultChecklist());
    setError(null);
  }

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">Los datos se procesan en tu dispositivo y no se envían al servidor.</p>

      <div>
        <Label htmlFor="checklist-title" className="mb-1">
          Título
        </Label>
        <Input id="checklist-title" value={data.title} onChange={(e) => patch({ title: e.target.value })} />
      </div>
      <div>
        <Label htmlFor="checklist-desc" className="mb-1">
          Descripción
        </Label>
        <textarea id="checklist-desc" value={data.description} onChange={(e) => patch({ description: e.target.value })} rows={2} className="w-full rounded-md border p-2 text-sm" />
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={data.showAssignee} onCheckedChange={(c) => patch({ showAssignee: Boolean(c) })} />
          Mostrar responsables
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={data.showDueDate} onCheckedChange={(c) => patch({ showDueDate: Boolean(c) })} />
          Mostrar fechas
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={data.includeSignatureLine} onCheckedChange={(c) => patch({ includeSignatureLine: Boolean(c) })} />
          Incluir línea de firma
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={includeState} onCheckedChange={(c) => setIncludeState(Boolean(c))} />
          Exportar con estado marcado (si no, imprime vacía)
        </label>
      </div>

      <div className="space-y-4">
        {data.sections.map((section) => (
          <div key={section.id} className="space-y-2 rounded-lg border p-3">
            <Input value={section.title} onChange={(e) => updateSection(section.id, { title: e.target.value })} className="max-w-sm font-semibold" aria-label="Título de sección" />
            {section.items.map((item) => (
              <div key={item.id} className="flex items-center gap-2">
                <Checkbox checked={item.done} onCheckedChange={(c) => updateItem(section.id, item.id, { done: Boolean(c) })} aria-label="Marcar elemento" />
                <Input value={item.text} onChange={(e) => updateItem(section.id, item.id, { text: e.target.value })} placeholder="Elemento" className="flex-1" />
                {data.showAssignee ? <Input value={item.assignee} onChange={(e) => updateItem(section.id, item.id, { assignee: e.target.value })} placeholder="Responsable" className="max-w-[10rem]" /> : null}
                {data.showDueDate ? <Input type="date" value={item.dueDate} onChange={(e) => updateItem(section.id, item.id, { dueDate: e.target.value })} className="max-w-[10rem]" /> : null}
                <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(section.id, item.id)}>
                  Eliminar
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => updateSection(section.id, { items: [...section.items, createChecklistItem()] })}>
              Añadir elemento
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setData((prev) => ({ ...prev, sections: [...prev.sections, createChecklistSection(`Sección ${prev.sections.length + 1}`)] }))}>
          Añadir sección
        </Button>
      </div>

      <p aria-live="polite" className="text-sm text-muted-foreground">
        {stats.doneItems} de {stats.totalItems} elementos completados
      </p>

      {validation.errors.length > 0 ? (
        <ul className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {validation.errors.map((e, i) => (
            <li key={i} role="alert">
              {e}
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={handleDownloadPdf} disabled={validation.errors.length > 0}>
          Descargar PDF
        </Button>
        <DownloadButton content={checklistToMarkdown(data, includeState)} filename="lista.md" mimeType="text/markdown;charset=utf-8" label="Descargar Markdown" />
        <DownloadButton content={checklistToPlainText(data, includeState)} filename="lista.txt" mimeType="text/plain;charset=utf-8" label="Descargar TXT" />
        <CopyButton text={checklistToPlainText(data, includeState)} label="Copiar texto" />
        <Button
          type="button"
          variant="outline"
          onClick={() => downloadBlob(sanitizeFilename("lista.json"), new TextEncoder().encode(JSON.stringify(buildDocumentEnvelope(TOOL_ID, data), null, 2)), "application/json")}
        >
          Exportar JSON
        </Button>
        <Button type="button" variant="outline" onClick={() => window.print()}>
          Imprimir
        </Button>
        <ResetButton onReset={handleReset} />
      </div>

      <FileUploadZone accept="application/json" onFilesSelected={handleImportJson} label="Importar una lista guardada previamente" hint="" />
    </div>
  );
}
