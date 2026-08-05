"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CopyButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import {
  createDefaultBusinessCard,
  validateBusinessCard,
  BUSINESS_CARD_TEMPLATE_LABELS,
  BUSINESS_CARD_TEMPLATE_DESCRIPTIONS,
  type BusinessCardData,
  type BusinessCardSizeId,
  type BusinessCardTemplateId,
} from "@/lib/public-tools/business/business-card";
import { buildBusinessCardPdf, buildBusinessCardSheetPdf } from "@/lib/public-tools/business/business-card-pdf";
import { buildBusinessCardSvg } from "@/lib/public-tools/business/business-card-svg";
import { renderPdfPageToPngBlob } from "@/lib/public-tools/documents/png-export";
import { downloadBlob } from "@/lib/public-tools/files/download";
import { downloadTextFile } from "@/lib/public-tools/csv-export";
import { sanitizeFilename } from "@/lib/public-tools/files/filenames";
import { loadImageFromFile, drawImageToCanvas, canvasToBlob } from "@/lib/public-tools/files/image-io";
import { buildDocumentEnvelope, parseDocumentEnvelope } from "@/lib/public-tools/documents/json-schema";
import { DOCUMENT_LIMITS } from "@/lib/public-tools/documents/limits";

const TOOL_ID = "generador-tarjetas-presentacion";
const SIZE_LABELS: Record<BusinessCardSizeId, string> = { us: "3.5 × 2 in (EE. UU.)", eu: "85 × 55 mm (Europa)", custom: "Personalizado" };

export function BusinessCardTool() {
  const [data, setData] = useState<BusinessCardData>(createDefaultBusinessCard());
  const [error, setError] = useState<string | null>(null);

  const validation = validateBusinessCard(data);
  function patch(p: Partial<BusinessCardData>) {
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
    const canvas = drawImageToCanvas(loaded.loaded.image, 160, 160);
    const blob = await canvasToBlob(canvas, "image/png");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    patch({ logoPngBytes: Array.from(bytes) });
  }

  async function handleDownloadPdf() {
    setError(null);
    try {
      const bytes = await buildBusinessCardPdf(data);
      downloadBlob(sanitizeFilename(`tarjeta-${data.name || "sin-nombre"}.pdf`), bytes, "application/pdf");
    } catch {
      setError("No se pudo generar el PDF de la tarjeta.");
    }
  }

  async function handleDownloadSheetPdf(sheet: "A4" | "LETTER") {
    setError(null);
    try {
      const bytes = await buildBusinessCardSheetPdf(data, sheet);
      downloadBlob(sanitizeFilename(`hoja-tarjetas-${sheet.toLowerCase()}.pdf`), bytes, "application/pdf");
    } catch {
      setError("No se pudo generar la hoja de impresión.");
    }
  }

  async function handleDownloadPng() {
    setError(null);
    try {
      const bytes = await buildBusinessCardPdf(data);
      const blob = await renderPdfPageToPngBlob(bytes, 1, DOCUMENT_LIMITS.pngRenderScale);
      downloadBlob(sanitizeFilename(`tarjeta-${data.name || "sin-nombre"}.png`), blob);
    } catch {
      setError("No se pudo generar el PNG de la tarjeta.");
    }
  }

  async function handleDownloadSvg() {
    setError(null);
    try {
      const svg = await buildBusinessCardSvg(data);
      downloadTextFile(sanitizeFilename(`tarjeta-${data.name || "sin-nombre"}.svg`), svg, "image/svg+xml;charset=utf-8");
    } catch {
      setError("No se pudo generar el SVG de la tarjeta.");
    }
  }

  function handleReset() {
    setData(createDefaultBusinessCard());
    setError(null);
  }

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">Los datos de la tarjeta permanecen en tu dispositivo.</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="card-name" className="mb-1">
            Nombre
          </Label>
          <Input id="card-name" value={data.name} onChange={(e) => patch({ name: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="card-title" className="mb-1">
            Cargo
          </Label>
          <Input id="card-title" value={data.jobTitle} onChange={(e) => patch({ jobTitle: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="card-company" className="mb-1">
            Empresa
          </Label>
          <Input id="card-company" value={data.company} onChange={(e) => patch({ company: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="card-phone" className="mb-1">
            Teléfono
          </Label>
          <Input id="card-phone" value={data.phone} onChange={(e) => patch({ phone: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="card-email" className="mb-1">
            Correo
          </Label>
          <Input id="card-email" value={data.email} onChange={(e) => patch({ email: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="card-website" className="mb-1">
            Web
          </Label>
          <Input id="card-website" value={data.website} onChange={(e) => patch({ website: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="card-address" className="mb-1">
            Dirección (opcional)
          </Label>
          <Input id="card-address" value={data.address} onChange={(e) => patch({ address: e.target.value })} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="card-template" className="mb-1">
            Plantilla
          </Label>
          <Select value={data.template} onValueChange={(v) => patch({ template: v as BusinessCardTemplateId })}>
            <SelectTrigger id="card-template" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(BUSINESS_CARD_TEMPLATE_LABELS) as BusinessCardTemplateId[]).map((t) => (
                <SelectItem key={t} value={t}>
                  {BUSINESS_CARD_TEMPLATE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">{BUSINESS_CARD_TEMPLATE_DESCRIPTIONS[data.template]}</p>
        </div>
        <div>
          <Label htmlFor="card-size" className="mb-1">
            Tamaño
          </Label>
          <Select value={data.size} onValueChange={(v) => patch({ size: v as BusinessCardSizeId })}>
            <SelectTrigger id="card-size" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SIZE_LABELS) as BusinessCardSizeId[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {SIZE_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="card-color" className="mb-1 block">
            Color de acento
          </Label>
          <input id="card-color" type="color" value={data.accentColorHex} onChange={(e) => patch({ accentColorHex: e.target.value })} />
        </div>
      </div>

      {data.size === "custom" ? (
        <div className="flex gap-3">
          <div>
            <Label htmlFor="card-w" className="mb-1">
              Ancho (mm)
            </Label>
            <Input id="card-w" type="number" min={40} max={150} value={data.customWidthMm} onChange={(e) => patch({ customWidthMm: Number(e.target.value) })} />
          </div>
          <div>
            <Label htmlFor="card-h" className="mb-1">
              Alto (mm)
            </Label>
            <Input id="card-h" type="number" min={40} max={150} value={data.customHeightMm} onChange={(e) => patch({ customHeightMm: Number(e.target.value) })} />
          </div>
        </div>
      ) : null}

      <div>
        <Label className="mb-1 block">Logotipo (opcional)</Label>
        <FileUploadZone accept="image/png,image/jpeg,image/webp" onFilesSelected={handleLogoUpload} label="Cargar logotipo" hint="" />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={data.showQr} onCheckedChange={(c) => patch({ showQr: Boolean(c) })} />
        Incluir código QR
      </label>
      {data.showQr ? (
        <div>
          <Label htmlFor="card-qr" className="mb-1">
            Contenido del QR
          </Label>
          <Input id="card-qr" value={data.qrValue} onChange={(e) => patch({ qrValue: e.target.value })} placeholder="https://tu-sitio.com" />
        </div>
      ) : null}

      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={data.backEnabled} onCheckedChange={(c) => patch({ backEnabled: Boolean(c) })} />
        Incluir cara posterior
      </label>
      {data.backEnabled ? (
        <textarea value={data.backText} onChange={(e) => patch({ backText: e.target.value })} rows={3} className="w-full rounded-md border p-2 text-sm" placeholder="Texto de la cara posterior (una línea por renglón)" />
      ) : null}

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
          Descargar tarjeta (PDF)
        </Button>
        <Button type="button" variant="outline" onClick={handleDownloadPng} disabled={validation.errors.length > 0}>
          Descargar PNG
        </Button>
        <Button type="button" variant="outline" onClick={handleDownloadSvg} disabled={validation.errors.length > 0}>
          Descargar SVG
        </Button>
        <Button type="button" variant="outline" onClick={() => handleDownloadSheetPdf("A4")} disabled={validation.errors.length > 0}>
          Hoja de impresión (A4)
        </Button>
        <Button type="button" variant="outline" onClick={() => handleDownloadSheetPdf("LETTER")} disabled={validation.errors.length > 0}>
          Hoja de impresión (Letter)
        </Button>
        <CopyButton text={[data.name, data.jobTitle, data.company, data.phone, data.email, data.website].filter(Boolean).join("\n")} label="Copiar datos" />
        <Button
          type="button"
          variant="outline"
          onClick={() => downloadTextFile("tarjeta.json", JSON.stringify(buildDocumentEnvelope(TOOL_ID, data), null, 2), "application/json;charset=utf-8")}
        >
          Exportar JSON
        </Button>
        <ResetButton onReset={handleReset} />
      </div>

      <FileUploadZone
        accept="application/json"
        onFilesSelected={(files) => {
          const file = files[0];
          if (!file) return;
          file.text().then((text) => {
            const result = parseDocumentEnvelope<BusinessCardData>(text, TOOL_ID);
            if (!result.ok || !result.data) {
              setError(result.error ?? "No se pudo importar el archivo.");
              return;
            }
            setError(null);
            setData(result.data);
          });
        }}
        label="Importar una tarjeta guardada previamente"
        hint=""
      />
    </div>
  );
}
