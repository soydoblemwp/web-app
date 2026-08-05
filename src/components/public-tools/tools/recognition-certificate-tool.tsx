"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResetButton } from "@/components/public-tools/copy-download-actions";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import {
  createDefaultCertificate,
  validateCertificate,
  CERTIFICATE_TYPE_LABELS,
  CERTIFICATE_TEMPLATE_LABELS,
  CERTIFICATE_TEMPLATE_DESCRIPTIONS,
  NOT_OFFICIAL_NOTICE,
  type RecognitionCertificateData,
  type CertificateType,
  type CertificateTemplateId,
} from "@/lib/public-tools/printables/recognition-certificate";
import { buildRecognitionCertificatePdf } from "@/lib/public-tools/printables/recognition-certificate-pdf";
import { renderPdfPageToPngBlob } from "@/lib/public-tools/documents/png-export";
import { downloadBlob } from "@/lib/public-tools/files/download";
import { sanitizeFilename } from "@/lib/public-tools/files/filenames";
import { loadImageFromFile, drawImageToCanvas, canvasToBlob } from "@/lib/public-tools/files/image-io";
import { DOCUMENT_LIMITS } from "@/lib/public-tools/documents/limits";

export function RecognitionCertificateTool() {
  const [data, setData] = useState<RecognitionCertificateData>(createDefaultCertificate());
  const [error, setError] = useState<string | null>(null);

  const validation = validateCertificate(data);
  function patch(p: Partial<RecognitionCertificateData>) {
    setData((prev) => ({ ...prev, ...p }));
  }

  async function handleLogoUpload(files: File[]) {
    const file = files[0];
    if (!file) return;
    const loaded = await loadImageFromFile(file);
    if (!loaded.ok || !loaded.loaded) {
      setError("No se pudo cargar el logotipo.");
      return;
    }
    const canvas = drawImageToCanvas(loaded.loaded.image, 200, 200);
    const blob = await canvasToBlob(canvas, "image/png");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    patch({ logoPngBytes: Array.from(bytes) });
  }

  async function handleDownloadPdf() {
    setError(null);
    try {
      const bytes = await buildRecognitionCertificatePdf(data);
      downloadBlob(sanitizeFilename(`certificado-${data.recipientName || "sin-nombre"}.pdf`), bytes, "application/pdf");
    } catch {
      setError("No se pudo generar el PDF del certificado.");
    }
  }

  async function handleDownloadPng() {
    setError(null);
    try {
      const bytes = await buildRecognitionCertificatePdf(data);
      const blob = await renderPdfPageToPngBlob(bytes, 1, DOCUMENT_LIMITS.pngRenderScale);
      downloadBlob(sanitizeFilename(`certificado-${data.recipientName || "sin-nombre"}.png`), blob);
    } catch {
      setError("No se pudo generar el PNG del certificado.");
    }
  }

  function handleReset() {
    setData(createDefaultCertificate());
    setError(null);
  }

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">Los datos se procesan en tu dispositivo y no se envían al servidor.</p>
      <p className="text-xs font-medium text-amber-700 dark:text-amber-400">{NOT_OFFICIAL_NOTICE}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="cert-type" className="mb-1">
            Tipo de reconocimiento
          </Label>
          <Select value={data.certificateType} onValueChange={(v) => patch({ certificateType: v as CertificateType })}>
            <SelectTrigger id="cert-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(CERTIFICATE_TYPE_LABELS) as CertificateType[]).map((t) => (
                <SelectItem key={t} value={t}>
                  {CERTIFICATE_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="cert-template" className="mb-1">
            Plantilla
          </Label>
          <Select value={data.template} onValueChange={(v) => patch({ template: v as CertificateTemplateId })}>
            <SelectTrigger id="cert-template" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(CERTIFICATE_TEMPLATE_LABELS) as CertificateTemplateId[]).map((t) => (
                <SelectItem key={t} value={t}>
                  {CERTIFICATE_TEMPLATE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">{CERTIFICATE_TEMPLATE_DESCRIPTIONS[data.template]}</p>
        </div>
        <div>
          <Label htmlFor="cert-recognition-name" className="mb-1">
            Nombre del reconocimiento
          </Label>
          <Input id="cert-recognition-name" value={data.recognitionName} onChange={(e) => patch({ recognitionName: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="cert-recipient" className="mb-1">
            Nombre de la persona
          </Label>
          <Input id="cert-recipient" value={data.recipientName} onChange={(e) => patch({ recipientName: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="cert-org" className="mb-1">
            Organización
          </Label>
          <Input id="cert-org" value={data.organizationName} onChange={(e) => patch({ organizationName: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="cert-date" className="mb-1">
            Fecha
          </Label>
          <Input id="cert-date" type="date" value={data.date} onChange={(e) => patch({ date: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="cert-place" className="mb-1">
            Lugar
          </Label>
          <Input id="cert-place" value={data.place} onChange={(e) => patch({ place: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="cert-color" className="mb-1 block">
            Color de acento
          </Label>
          <input id="cert-color" type="color" value={data.accentColorHex} onChange={(e) => patch({ accentColorHex: e.target.value })} />
        </div>
      </div>

      <div>
        <Label htmlFor="cert-reason" className="mb-1">
          Motivo
        </Label>
        <textarea id="cert-reason" value={data.reason} onChange={(e) => patch({ reason: e.target.value })} rows={3} className="w-full rounded-md border p-2 text-sm" />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="flex gap-2">
            <Input
              placeholder="Nombre de responsable"
              value={data.signerNames[i] ?? ""}
              onChange={(e) => {
                const names = [...data.signerNames];
                names[i] = e.target.value;
                patch({ signerNames: names });
              }}
            />
            <Input
              placeholder="Cargo"
              value={data.signerTitles[i] ?? ""}
              onChange={(e) => {
                const titles = [...data.signerTitles];
                titles[i] = e.target.value;
                patch({ signerTitles: titles });
              }}
            />
          </div>
        ))}
      </div>

      <div>
        <Label className="mb-1 block">Logotipo (opcional)</Label>
        <FileUploadZone accept="image/png,image/jpeg,image/webp" onFilesSelected={handleLogoUpload} label="Cargar logotipo" hint="" />
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
        <Button type="button" variant="outline" onClick={() => window.print()}>
          Imprimir
        </Button>
        <ResetButton onReset={handleReset} />
      </div>
    </div>
  );
}
