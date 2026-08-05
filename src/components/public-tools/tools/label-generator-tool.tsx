"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResetButton } from "@/components/public-tools/copy-download-actions";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import {
  createDefaultLabelsData,
  createLabelItem,
  parseLabelsCsv,
  csvRowsToLabelItems,
  computeLabelSheetLayout,
  validateLabelsData,
  type LabelsData,
  type LabelSheetSize,
  type CsvColumnMapping,
} from "@/lib/public-tools/printables/labels";
import { buildLabelsSheetPdf, buildSingleLabelPdf } from "@/lib/public-tools/printables/labels-pdf";
import { buildSingleLabelSvg } from "@/lib/public-tools/printables/labels-svg";
import { renderPdfPageToPngBlob } from "@/lib/public-tools/documents/png-export";
import { downloadBlob } from "@/lib/public-tools/files/download";
import { downloadTextFile } from "@/lib/public-tools/csv-export";
import { sanitizeFilename } from "@/lib/public-tools/files/filenames";
import { buildZip, type ZipEntryInput } from "@/lib/public-tools/files/zip";
import { buildDocumentEnvelope, parseDocumentEnvelope } from "@/lib/public-tools/documents/json-schema";
import { DOCUMENT_LIMITS } from "@/lib/public-tools/documents/limits";
import { BARCODE_FORMATS, type BarcodeFormat } from "@/lib/public-tools/barcodes/formats";

const TOOL_ID = "generador-etiquetas-pegatinas";

export function LabelGeneratorTool() {
  const [data, setData] = useState<LabelsData>(createDefaultLabelsData());
  const [csvHeaders, setCsvHeaders] = useState<string[] | null>(null);
  const [csvRows, setCsvRows] = useState<string[][] | null>(null);
  const [mapping, setMapping] = useState<CsvColumnMapping>({});
  const [error, setError] = useState<string | null>(null);

  const validation = validateLabelsData(data);
  const layout = computeLabelSheetLayout(data);

  function patch(p: Partial<LabelsData>) {
    setData((prev) => ({ ...prev, ...p }));
  }
  function updateItem(id: string, patch2: Partial<LabelsData["items"][number]>) {
    setData((prev) => ({ ...prev, items: prev.items.map((it) => (it.id === id ? { ...it, ...patch2 } : it)) }));
  }
  function removeItem(id: string) {
    setData((prev) => ({ ...prev, items: prev.items.filter((it) => it.id !== id) }));
  }

  function handleCsvUpload(files: File[]) {
    const file = files[0];
    if (!file) return;
    file.text().then((text) => {
      const result = parseLabelsCsv(text);
      if (!result.ok || !result.headers || !result.rows) {
        setError(result.error ?? "No se pudo leer el CSV.");
        return;
      }
      setError(null);
      setCsvHeaders(result.headers);
      setCsvRows(result.rows);
      setMapping({ text: result.headers[0] });
    });
  }

  function applyCsvMapping() {
    if (!csvHeaders || !csvRows) return;
    const items = csvRowsToLabelItems(csvHeaders, csvRows, mapping);
    if (items.length > DOCUMENT_LIMITS.labels.maxLabels) {
      setError(`El CSV genera demasiadas etiquetas (máximo ${DOCUMENT_LIMITS.labels.maxLabels}).`);
      return;
    }
    setError(null);
    setData((prev) => ({ ...prev, items }));
  }

  async function handleDownloadSheetPdf() {
    setError(null);
    try {
      const bytes = await buildLabelsSheetPdf(data);
      downloadBlob(sanitizeFilename("hoja-etiquetas.pdf"), bytes, "application/pdf");
    } catch {
      setError("No se pudo generar la hoja de etiquetas.");
    }
  }

  async function handleDownloadSinglePng() {
    setError(null);
    const item = data.items[0];
    if (!item) return;
    try {
      const bytes = await buildSingleLabelPdf(item, data);
      const blob = await renderPdfPageToPngBlob(bytes, 1, DOCUMENT_LIMITS.pngRenderScale);
      downloadBlob(sanitizeFilename(`etiqueta-${item.text || "1"}.png`), blob);
    } catch {
      setError("No se pudo generar el PNG de la etiqueta.");
    }
  }

  async function handleDownloadSingleSvg() {
    setError(null);
    const item = data.items[0];
    if (!item) return;
    try {
      const svg = await buildSingleLabelSvg(item, data);
      downloadTextFile(sanitizeFilename(`etiqueta-${item.text || "1"}.svg`), svg, "image/svg+xml;charset=utf-8");
    } catch {
      setError("No se pudo generar el SVG de la etiqueta.");
    }
  }

  async function handleDownloadZip() {
    setError(null);
    try {
      const entries: ZipEntryInput[] = [];
      for (const [index, item] of data.items.entries()) {
        const baseName = sanitizeFilename(`etiqueta-${index + 1}-${item.text || "sin-texto"}`);
        const pdfBytes = await buildSingleLabelPdf(item, data);
        const pngBlob = await renderPdfPageToPngBlob(pdfBytes, 1, DOCUMENT_LIMITS.pngRenderScale);
        entries.push({ name: `${baseName}.png`, data: new Uint8Array(await pngBlob.arrayBuffer()) });
        const svg = await buildSingleLabelSvg(item, data);
        entries.push({ name: `${baseName}.svg`, data: new TextEncoder().encode(svg) });
      }
      const result = buildZip(entries);
      if (!result.ok || !result.bytes) {
        setError(result.error?.message ?? "No se pudo generar el ZIP de etiquetas.");
        return;
      }
      downloadBlob(sanitizeFilename("etiquetas.zip"), result.bytes, "application/zip");
    } catch {
      setError("No se pudo generar el ZIP de etiquetas.");
    }
  }

  function handleExportJson() {
    downloadTextFile("plantilla-etiquetas.json", JSON.stringify(buildDocumentEnvelope(TOOL_ID, data), null, 2), "application/json;charset=utf-8");
  }

  function handleImportJson(files: File[]) {
    const file = files[0];
    if (!file) return;
    file.text().then((text) => {
      const result = parseDocumentEnvelope<LabelsData>(text, TOOL_ID);
      if (!result.ok || !result.data) {
        setError(result.error ?? "No se pudo importar el archivo.");
        return;
      }
      setError(null);
      setData(result.data);
    });
  }

  function handleReset() {
    setData(createDefaultLabelsData());
    setCsvHeaders(null);
    setCsvRows(null);
    setError(null);
  }

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">Los datos se procesan en tu dispositivo y no se envían al servidor.</p>

      <div className="grid gap-4 sm:grid-cols-4">
        <div>
          <Label htmlFor="label-width" className="mb-1">
            Ancho (mm)
          </Label>
          <Input id="label-width" type="number" min={10} value={data.widthMm} onChange={(e) => patch({ widthMm: Number(e.target.value) })} />
        </div>
        <div>
          <Label htmlFor="label-height" className="mb-1">
            Alto (mm)
          </Label>
          <Input id="label-height" type="number" min={10} value={data.heightMm} onChange={(e) => patch({ heightMm: Number(e.target.value) })} />
        </div>
        <div>
          <Label htmlFor="label-sheet" className="mb-1">
            Hoja
          </Label>
          <Select value={data.sheetSize} onValueChange={(v) => patch({ sheetSize: v as LabelSheetSize })}>
            <SelectTrigger id="label-sheet" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="A4">A4</SelectItem>
              <SelectItem value="LETTER">Letter</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="label-margin" className="mb-1">
            Margen (mm)
          </Label>
          <Input id="label-margin" type="number" min={0} value={data.marginMm} onChange={(e) => patch({ marginMm: Number(e.target.value) })} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {layout.columns} × {layout.rows} = {layout.labelsPerSheet} etiquetas por hoja.
      </p>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={data.sequentialNumbering} onCheckedChange={(c) => patch({ sequentialNumbering: Boolean(c) })} />
        Numeración secuencial
      </label>

      <div className="space-y-2 rounded-lg border p-3">
        <h2 className="text-sm font-semibold">Importar desde CSV</h2>
        <FileUploadZone accept=".csv,text/csv" onFilesSelected={handleCsvUpload} label="Cargar archivo CSV" hint="" />
        {csvHeaders ? (
          <div className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label className="mb-1">Columna de texto</Label>
                <Select value={mapping.text ?? ""} onValueChange={(v) => setMapping((m) => ({ ...m, text: v as string }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecciona columna" />
                  </SelectTrigger>
                  <SelectContent>
                    {csvHeaders.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1">Columna de precio (opcional)</Label>
                <Select value={mapping.price ?? ""} onValueChange={(v) => setMapping((m) => ({ ...m, price: v as string }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Ninguna" />
                  </SelectTrigger>
                  <SelectContent>
                    {csvHeaders.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={applyCsvMapping}>
              Generar etiquetas desde CSV ({csvRows?.length ?? 0} filas)
            </Button>
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Etiquetas ({data.items.length})</h2>
        {data.items.slice(0, 20).map((item) => (
          <div key={item.id} className="grid gap-2 rounded-md border p-2 sm:grid-cols-6">
            <Input placeholder="Texto" value={item.text} onChange={(e) => updateItem(item.id, { text: e.target.value })} />
            <Input placeholder="Precio" value={item.price} onChange={(e) => updateItem(item.id, { price: e.target.value })} />
            <Input placeholder="SKU" value={item.sku} onChange={(e) => updateItem(item.id, { sku: e.target.value })} />
            <Input placeholder="QR (opcional)" value={item.qrValue} onChange={(e) => updateItem(item.id, { qrValue: e.target.value })} />
            <Select value={item.barcodeFormat || "none"} onValueChange={(v) => updateItem(item.id, { barcodeFormat: v === "none" ? "" : (v as BarcodeFormat) })}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sin código" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin código de barras</SelectItem>
                {BARCODE_FORMATS.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {item.barcodeFormat ? <Input placeholder="Valor del código" value={item.barcodeValue} onChange={(e) => updateItem(item.id, { barcodeValue: e.target.value })} /> : <span />}
            <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(item.id)}>
              Eliminar
            </Button>
          </div>
        ))}
        {data.items.length > 20 ? <p className="text-xs text-muted-foreground">Mostrando las primeras 20 de {data.items.length} etiquetas.</p> : null}
        <Button type="button" variant="outline" size="sm" onClick={() => setData((prev) => ({ ...prev, items: [...prev.items, createLabelItem()] }))}>
          Añadir etiqueta
        </Button>
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
        <Button type="button" onClick={handleDownloadSheetPdf} disabled={validation.errors.length > 0}>
          Descargar hoja (PDF)
        </Button>
        <Button type="button" variant="outline" onClick={handleDownloadSinglePng} disabled={data.items.length === 0}>
          Descargar PNG (1.ª etiqueta)
        </Button>
        <Button type="button" variant="outline" onClick={handleDownloadSingleSvg} disabled={data.items.length === 0}>
          Descargar SVG (1.ª etiqueta)
        </Button>
        <Button type="button" variant="outline" onClick={handleDownloadZip} disabled={data.items.length === 0}>
          Descargar ZIP (todas, PNG+SVG)
        </Button>
        <Button type="button" variant="outline" onClick={handleExportJson}>
          Exportar plantilla (JSON)
        </Button>
        <Button type="button" variant="outline" onClick={() => window.print()}>
          Imprimir
        </Button>
        <ResetButton onReset={handleReset} />
      </div>

      <FileUploadZone accept="application/json" onFilesSelected={handleImportJson} label="Importar una plantilla de etiquetas guardada previamente" hint="" />
    </div>
  );
}
