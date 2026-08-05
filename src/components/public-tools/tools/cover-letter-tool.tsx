"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CopyButton, DownloadButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import {
  createDefaultCoverLetter,
  applyModeDefaults,
  validateCoverLetter,
  coverLetterToPlainText,
  coverLetterToMarkdown,
  coverLetterWordCount,
  COVER_LETTER_MODE_LABELS,
  COVER_LETTER_MODE_CONFIG,
  type CoverLetterData,
  type CoverLetterMode,
} from "@/lib/public-tools/employment/cover-letter";
import { buildCoverLetterPdf } from "@/lib/public-tools/employment/cover-letter-pdf";
import { buildDocumentEnvelope, parseDocumentEnvelope } from "@/lib/public-tools/documents/json-schema";
import { downloadBlob } from "@/lib/public-tools/files/download";
import { downloadTextFile } from "@/lib/public-tools/csv-export";
import { sanitizeFilename } from "@/lib/public-tools/files/filenames";

const TOOL_ID = "generador-carta-presentacion";
const PARAGRAPH_FIELDS = ["openingParagraph", "experienceParagraph", "motivationParagraph", "closingParagraph"] as const;

export function CoverLetterTool() {
  const [data, setData] = useState<CoverLetterData>(createDefaultCoverLetter());
  const [error, setError] = useState<string | null>(null);

  const validation = validateCoverLetter(data);
  const plainText = coverLetterToPlainText(data);
  const wordCount = coverLetterWordCount(data);
  const config = COVER_LETTER_MODE_CONFIG[data.mode];

  function patch(p: Partial<CoverLetterData>) {
    setData((prev) => ({ ...prev, ...p }));
  }

  function handleModeChange(mode: CoverLetterMode) {
    setData((prev) => applyModeDefaults(prev, mode));
  }

  async function handleDownloadPdf() {
    setError(null);
    try {
      const bytes = await buildCoverLetterPdf(data);
      downloadBlob(sanitizeFilename(`carta-presentacion-${data.candidateName || "sin-nombre"}.pdf`), bytes, "application/pdf");
    } catch {
      setError("No se pudo generar el PDF de la carta.");
    }
  }

  function handleExportJson() {
    downloadTextFile("carta-presentacion.json", JSON.stringify(buildDocumentEnvelope(TOOL_ID, data), null, 2), "application/json;charset=utf-8");
  }

  function handleImportJson(files: File[]) {
    const file = files[0];
    if (!file) return;
    file.text().then((text) => {
      const result = parseDocumentEnvelope<CoverLetterData>(text, TOOL_ID);
      if (!result.ok || !result.data) {
        setError(result.error ?? "No se pudo importar el archivo.");
        return;
      }
      setError(null);
      setData(result.data);
    });
  }

  function handleReset() {
    setData(createDefaultCoverLetter());
    setError(null);
  }

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">La información de tu carta permanece en tu dispositivo.</p>

      <div>
        <Label htmlFor="cl-mode" className="mb-1">
          Modo
        </Label>
        <Select value={data.mode} onValueChange={(v) => handleModeChange(v as CoverLetterMode)}>
          <SelectTrigger id="cl-mode" className="w-full sm:w-80">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(COVER_LETTER_MODE_LABELS) as CoverLetterMode[]).map((m) => (
              <SelectItem key={m} value={m}>
                {COVER_LETTER_MODE_LABELS[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-1 text-xs text-muted-foreground">{config.description}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="cl-name" className="mb-1">
            Tu nombre
          </Label>
          <Input id="cl-name" value={data.candidateName} onChange={(e) => patch({ candidateName: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="cl-date" className="mb-1">
            Fecha
          </Label>
          <Input id="cl-date" value={data.date} onChange={(e) => patch({ date: e.target.value })} placeholder="15 de enero de 2026" />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="cl-contact" className="mb-1">
            Tus datos de contacto (uno por línea)
          </Label>
          <textarea id="cl-contact" value={data.candidateContact} onChange={(e) => patch({ candidateContact: e.target.value })} rows={2} className="w-full rounded-md border p-2 text-sm" />
        </div>
        <div>
          <Label htmlFor="cl-recipient" className="mb-1">
            Nombre del destinatario
          </Label>
          <Input id="cl-recipient" value={data.recipientName} onChange={(e) => patch({ recipientName: e.target.value })} />
        </div>
        {config.showFullAddressBlock ? (
          <div>
            <Label htmlFor="cl-recipient-title" className="mb-1">
              Cargo del destinatario
            </Label>
            <Input id="cl-recipient-title" value={data.recipientTitle} onChange={(e) => patch({ recipientTitle: e.target.value })} />
          </div>
        ) : null}
        <div>
          <Label htmlFor="cl-company" className="mb-1">
            Empresa
          </Label>
          <Input id="cl-company" value={data.companyName} onChange={(e) => patch({ companyName: e.target.value })} />
        </div>
        {config.showFullAddressBlock ? (
          <div>
            <Label htmlFor="cl-company-address" className="mb-1">
              Dirección de la empresa
            </Label>
            <Input id="cl-company-address" value={data.companyAddress} onChange={(e) => patch({ companyAddress: e.target.value })} />
          </div>
        ) : null}
        <div>
          <Label htmlFor="cl-position" className="mb-1">
            Puesto solicitado
          </Label>
          <Input id="cl-position" value={data.positionTitle} onChange={(e) => patch({ positionTitle: e.target.value })} />
        </div>
        {config.showJobReference ? (
          <div>
            <Label htmlFor="cl-reference" className="mb-1">
              Referencia de la vacante (opcional)
            </Label>
            <Input id="cl-reference" value={data.jobReference} onChange={(e) => patch({ jobReference: e.target.value })} />
          </div>
        ) : null}
      </div>

      <div>
        <Label htmlFor="cl-salutation" className="mb-1">
          Saludo
        </Label>
        <Input id="cl-salutation" value={data.salutation} onChange={(e) => patch({ salutation: e.target.value })} />
      </div>

      {PARAGRAPH_FIELDS.map((field, i) => (
        <div key={field}>
          <Label htmlFor={`cl-${field}`} className="mb-1">
            {config.paragraphLabels[i]}
          </Label>
          <textarea
            id={`cl-${field}`}
            value={data[field]}
            onChange={(e) => patch({ [field]: e.target.value } as Partial<CoverLetterData>)}
            rows={3}
            className="w-full rounded-md border p-2 text-sm"
            placeholder={config.paragraphHints[i]}
          />
        </div>
      ))}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="cl-farewell" className="mb-1">
            Despedida
          </Label>
          <Input id="cl-farewell" value={data.farewell} onChange={(e) => patch({ farewell: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="cl-signature" className="mb-1">
            Nombre de firma
          </Label>
          <Input id="cl-signature" value={data.signatureName} onChange={(e) => patch({ signatureName: e.target.value })} />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {wordCount} palabras · recomendado para este modo: {config.recommendedWordRange[0]}-{config.recommendedWordRange[1]} palabras
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
        <CopyButton text={plainText} label="Copiar texto" />
        <DownloadButton content={plainText} filename="carta-presentacion.txt" label="Descargar TXT" />
        <DownloadButton content={coverLetterToMarkdown(data)} filename="carta-presentacion.md" mimeType="text/markdown;charset=utf-8" label="Descargar Markdown" />
        <Button type="button" variant="outline" onClick={handleExportJson}>
          Exportar JSON
        </Button>
        <Button type="button" variant="outline" onClick={() => window.print()}>
          Imprimir
        </Button>
        <ResetButton onReset={handleReset} />
      </div>

      <FileUploadZone accept="application/json" onFilesSelected={handleImportJson} label="Importar una carta guardada previamente" hint="" />
    </div>
  );
}
