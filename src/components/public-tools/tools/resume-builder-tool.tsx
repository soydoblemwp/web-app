"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { LabeledSelect } from "@/components/ui/select";
import { CopyButton, DownloadButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import {
  createDefaultResume,
  createResumeSection,
  createResumeEntry,
  validateResume,
  resumeToPlainText,
  estimateResumePages,
  RESUME_SECTION_LABELS,
  RESUME_TEMPLATE_LABELS,
  RESUME_TEMPLATE_DESCRIPTIONS,
  type ResumeData,
  type ResumeSectionKind,
  type ResumeTemplateId,
} from "@/lib/public-tools/employment/resume";
import { buildResumePdf } from "@/lib/public-tools/employment/resume-pdf";
import { renderPdfPageToPngBlob } from "@/lib/public-tools/documents/png-export";
import { buildDocumentEnvelope, parseDocumentEnvelope } from "@/lib/public-tools/documents/json-schema";
import { downloadBlob } from "@/lib/public-tools/files/download";
import { downloadTextFile } from "@/lib/public-tools/csv-export";
import { sanitizeFilename } from "@/lib/public-tools/files/filenames";
import { loadImageFromFile, drawImageToCanvas, canvasToBlob } from "@/lib/public-tools/files/image-io";
import { DOCUMENT_LIMITS } from "@/lib/public-tools/documents/limits";

const TOOL_ID = "crear-curriculum-cv";
const SECTION_KINDS: ResumeSectionKind[] = ["experience", "education", "skills", "languages", "certifications", "projects", "volunteer", "awards", "publications", "references", "custom"];

export function ResumeBuilderTool() {
  const [data, setData] = useState<ResumeData>(createDefaultResume());
  const [error, setError] = useState<string | null>(null);
  const [showTextView, setShowTextView] = useState(false);

  const validation = validateResume(data);
  const plainText = resumeToPlainText(data);
  const pageEstimate = estimateResumePages(data);

  function updateContact(patch: Partial<ResumeData["contact"]>) {
    setData((prev) => ({ ...prev, contact: { ...prev.contact, ...patch } }));
  }
  function addSection(kind: ResumeSectionKind) {
    if (data.sections.length >= DOCUMENT_LIMITS.resume.maxSections) return;
    setData((prev) => ({ ...prev, sections: [...prev.sections, createResumeSection(kind)] }));
  }
  function updateSection(id: string, patch: Partial<ResumeData["sections"][number]>) {
    setData((prev) => ({ ...prev, sections: prev.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  }
  function removeSection(id: string) {
    setData((prev) => ({ ...prev, sections: prev.sections.filter((s) => s.id !== id) }));
  }
  function moveSection(id: string, direction: -1 | 1) {
    setData((prev) => {
      const index = prev.sections.findIndex((s) => s.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= prev.sections.length) return prev;
      const next = [...prev.sections];
      [next[index], next[target]] = [next[target], next[index]];
      return { ...prev, sections: next };
    });
  }
  function addEntry(sectionId: string) {
    setData((prev) => ({ ...prev, sections: prev.sections.map((s) => (s.id === sectionId ? { ...s, entries: [...s.entries, createResumeEntry()] } : s)) }));
  }
  function updateEntry(sectionId: string, entryId: string, patch: Partial<ResumeData["sections"][number]["entries"][number]>) {
    setData((prev) => ({ ...prev, sections: prev.sections.map((s) => (s.id !== sectionId ? s : { ...s, entries: s.entries.map((e) => (e.id === entryId ? { ...e, ...patch } : e)) })) }));
  }
  function removeEntry(sectionId: string, entryId: string) {
    setData((prev) => ({ ...prev, sections: prev.sections.map((s) => (s.id !== sectionId ? s : { ...s, entries: s.entries.filter((e) => e.id !== entryId) })) }));
  }

  async function handlePhotoUpload(files: File[]) {
    const file = files[0];
    if (!file) return;
    const loaded = await loadImageFromFile(file);
    if (!loaded.ok || !loaded.loaded) {
      setError("No se pudo cargar la fotografía.");
      return;
    }
    const size = 240;
    const canvas = drawImageToCanvas(loaded.loaded.image, size, size);
    const blob = await canvasToBlob(canvas, "image/png");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    setData((prev) => ({ ...prev, photoPngBytes: Array.from(bytes) }));
  }

  async function handleDownloadPdf() {
    setError(null);
    try {
      const bytes = await buildResumePdf(data);
      downloadBlob(sanitizeFilename(`curriculum-${data.contact.fullName || "sin-nombre"}.pdf`), bytes, "application/pdf");
    } catch {
      setError("No se pudo generar el PDF del currículum.");
    }
  }

  async function handleDownloadPng() {
    setError(null);
    try {
      const bytes = await buildResumePdf(data);
      const blob = await renderPdfPageToPngBlob(bytes, 1, DOCUMENT_LIMITS.pngRenderScale);
      downloadBlob(sanitizeFilename(`curriculum-${data.contact.fullName || "sin-nombre"}.png`), blob);
    } catch {
      setError("No se pudo generar el PNG del currículum.");
    }
  }

  function handleExportJson() {
    const envelope = buildDocumentEnvelope(TOOL_ID, data);
    downloadTextFile("curriculum.json", JSON.stringify(envelope, null, 2), "application/json;charset=utf-8");
  }

  function handleImportJson(files: File[]) {
    const file = files[0];
    if (!file) return;
    file.text().then((text) => {
      const result = parseDocumentEnvelope<ResumeData>(text, TOOL_ID);
      if (!result.ok || !result.data) {
        setError(result.error ?? "No se pudo importar el archivo.");
        return;
      }
      setError(null);
      setData(result.data);
    });
  }

  function handleReset() {
    setData(createDefaultResume());
    setError(null);
  }

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">La información personal de tu currículum permanece en tu dispositivo.</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="resume-name" className="mb-1">
            Nombre completo
          </Label>
          <Input id="resume-name" value={data.contact.fullName} onChange={(e) => updateContact({ fullName: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="resume-title" className="mb-1">
            Título profesional
          </Label>
          <Input id="resume-title" value={data.contact.jobTitle} onChange={(e) => updateContact({ jobTitle: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="resume-city" className="mb-1">
            Ciudad
          </Label>
          <Input id="resume-city" value={data.contact.city} onChange={(e) => updateContact({ city: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="resume-region" className="mb-1">
            Región / País
          </Label>
          <Input id="resume-region" value={data.contact.region} onChange={(e) => updateContact({ region: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="resume-phone" className="mb-1">
            Teléfono
          </Label>
          <Input id="resume-phone" value={data.contact.phone} onChange={(e) => updateContact({ phone: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="resume-email" className="mb-1">
            Correo electrónico
          </Label>
          <Input id="resume-email" value={data.contact.email} onChange={(e) => updateContact({ email: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="resume-website" className="mb-1">
            Sitio web
          </Label>
          <Input id="resume-website" value={data.contact.website} onChange={(e) => updateContact({ website: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="resume-linkedin" className="mb-1">
            LinkedIn
          </Label>
          <Input id="resume-linkedin" value={data.contact.linkedin} onChange={(e) => updateContact({ linkedin: e.target.value })} />
        </div>
      </div>

      <div>
        <Label htmlFor="resume-summary" className="mb-1">
          Resumen profesional
        </Label>
        <textarea id="resume-summary" value={data.contact.summary} onChange={(e) => updateContact({ summary: e.target.value })} rows={3} className="w-full rounded-md border p-2 text-sm" />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={data.photoEnabled} onCheckedChange={(c) => setData((prev) => ({ ...prev, photoEnabled: Boolean(c) }))} />
          Incluir fotografía (opcional; las prácticas varían según país y sector)
        </label>
        {data.photoEnabled ? <FileUploadZone accept="image/png,image/jpeg,image/webp" onFilesSelected={handlePhotoUpload} label="o carga una fotografía" hint="" /> : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="resume-template" className="mb-1">
            Plantilla
          </Label>
          <LabeledSelect
            id="resume-template"
            className="w-full"
            value={data.template}
            onValueChange={(v) => setData((prev) => ({ ...prev, template: v as ResumeTemplateId }))}
            options={(Object.keys(RESUME_TEMPLATE_LABELS) as ResumeTemplateId[]).map((t) => ({ value: t, label: RESUME_TEMPLATE_LABELS[t] }))}
          />
          <p className="mt-1 text-xs text-muted-foreground">{RESUME_TEMPLATE_DESCRIPTIONS[data.template]}</p>
        </div>
        <div>
          <Label htmlFor="resume-color" className="mb-1 block">
            Color de acento
          </Label>
          <input id="resume-color" type="color" value={data.accentColorHex} onChange={(e) => setData((prev) => ({ ...prev, accentColorHex: e.target.value }))} />
        </div>
        <div className="flex items-end text-sm text-muted-foreground">Páginas estimadas: {pageEstimate}</div>
      </div>

      <div className="space-y-4">
        {data.sections.map((section, index) => (
          <div key={section.id} className="space-y-3 rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input value={section.title} onChange={(e) => updateSection(section.id, { title: e.target.value })} className="max-w-xs font-semibold" aria-label="Título de la sección" />
              <Button type="button" variant="ghost" size="sm" onClick={() => moveSection(section.id, -1)} disabled={index === 0}>
                Subir
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => moveSection(section.id, 1)} disabled={index === data.sections.length - 1}>
                Bajar
              </Button>
              <label className="flex items-center gap-1.5 text-xs">
                <Checkbox checked={!section.hidden} onCheckedChange={(c) => updateSection(section.id, { hidden: !c })} />
                Visible
              </label>
              <Button type="button" variant="ghost" size="sm" onClick={() => removeSection(section.id)}>
                Eliminar sección
              </Button>
            </div>

            {section.entries.map((entry) => (
              <div key={entry.id} className="grid gap-2 rounded-md border p-2 sm:grid-cols-2">
                <Input placeholder="Título / puesto" value={entry.title} onChange={(e) => updateEntry(section.id, entry.id, { title: e.target.value })} />
                <Input placeholder="Organización" value={entry.organization} onChange={(e) => updateEntry(section.id, entry.id, { organization: e.target.value })} />
                <Input placeholder="Ubicación" value={entry.location} onChange={(e) => updateEntry(section.id, entry.id, { location: e.target.value })} />
                <div className="flex gap-2">
                  <Input placeholder="Inicio" value={entry.startDate} onChange={(e) => updateEntry(section.id, entry.id, { startDate: e.target.value })} />
                  <Input placeholder="Fin" value={entry.endDate} disabled={entry.current} onChange={(e) => updateEntry(section.id, entry.id, { endDate: e.target.value })} />
                </div>
                <label className="flex items-center gap-1.5 text-xs">
                  <Checkbox checked={entry.current} onCheckedChange={(c) => updateEntry(section.id, entry.id, { current: Boolean(c) })} />
                  Actualmente
                </label>
                <label className="flex items-center gap-1.5 text-xs">
                  <Checkbox checked={!entry.hidden} onCheckedChange={(c) => updateEntry(section.id, entry.id, { hidden: !c })} />
                  Visible
                </label>
                <textarea
                  placeholder="Descripción"
                  value={entry.description}
                  onChange={(e) => updateEntry(section.id, entry.id, { description: e.target.value })}
                  rows={2}
                  className="col-span-2 rounded-md border p-2 text-sm"
                />
                <textarea
                  placeholder="Viñetas (una por línea)"
                  value={entry.bullets.join("\n")}
                  onChange={(e) => updateEntry(section.id, entry.id, { bullets: e.target.value.split("\n") })}
                  rows={2}
                  className="col-span-2 rounded-md border p-2 text-sm"
                />
                <Button type="button" variant="ghost" size="sm" onClick={() => removeEntry(section.id, entry.id)} className="col-span-2 justify-self-start">
                  Eliminar entrada
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => addEntry(section.id)}>
              Añadir entrada
            </Button>
          </div>
        ))}

        <div className="flex flex-wrap gap-2">
          {SECTION_KINDS.map((kind) => (
            <Button key={kind} type="button" variant="outline" size="sm" onClick={() => addSection(kind)}>
              + {RESUME_SECTION_LABELS[kind]}
            </Button>
          ))}
        </div>
      </div>

      {validation.errors.length > 0 ? (
        <ul className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {validation.errors.map((e, i) => (
            <li key={i} role="alert">
              {e}
            </li>
          ))}
        </ul>
      ) : null}
      {validation.warnings.length > 0 ? (
        <ul className="space-y-1 rounded-lg border border-amber-400/40 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
          {validation.warnings.map((w, i) => (
            <li key={i}>{w}</li>
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
        <Button type="button" variant="outline" onClick={handleDownloadPng} disabled={validation.errors.length > 0}>
          Descargar PNG
        </Button>
        <CopyButton text={plainText} label="Copiar versión de texto" />
        <DownloadButton content={plainText} filename="curriculum.txt" label="Descargar TXT" />
        <Button type="button" variant="outline" onClick={handleExportJson}>
          Exportar JSON
        </Button>
        <Button type="button" variant="outline" onClick={() => window.print()}>
          Imprimir
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setShowTextView((v) => !v)}>
          {showTextView ? "Ocultar vista textual" : "Ver vista textual"}
        </Button>
        <ResetButton onReset={handleReset} />
      </div>

      <FileUploadZone accept="application/json" onFilesSelected={handleImportJson} label="Importar una plantilla JSON guardada previamente" hint="" />

      {showTextView ? (
        <pre className="max-h-96 overflow-auto rounded-lg border bg-muted/30 p-3 text-xs whitespace-pre-wrap">{plainText}</pre>
      ) : null}
    </div>
  );
}
