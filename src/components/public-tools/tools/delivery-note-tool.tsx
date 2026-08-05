"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CopyButton, ResetButton, DownloadButton } from "@/components/public-tools/copy-download-actions";
import { createDefaultDeliveryNote, createDeliveryNoteLine, validateDeliveryNote, quantityPending, DELIVERY_NOTE_MODE_LABELS, type DeliveryNoteData, type DeliveryNoteMode } from "@/lib/public-tools/business/delivery-note";
import { buildDeliveryNotePdf, deliveryNoteLinesToCsv } from "@/lib/public-tools/business/delivery-note-pdf";
import { downloadBlob } from "@/lib/public-tools/files/download";
import { sanitizeFilename } from "@/lib/public-tools/files/filenames";

export function DeliveryNoteTool() {
  const [data, setData] = useState<DeliveryNoteData>(createDefaultDeliveryNote());
  const [error, setError] = useState<string | null>(null);

  const validation = validateDeliveryNote(data);

  function patch(p: Partial<DeliveryNoteData>) {
    setData((prev) => ({ ...prev, ...p }));
  }
  function updateLine(id: string, patch2: Partial<DeliveryNoteData["lines"][number]>) {
    setData((prev) => ({ ...prev, lines: prev.lines.map((l) => (l.id === id ? { ...l, ...patch2 } : l)) }));
  }

  async function handleDownloadPdf() {
    setError(null);
    try {
      const bytes = await buildDeliveryNotePdf(data);
      downloadBlob(sanitizeFilename(`nota-entrega-${data.shipmentNumber || "sin-numero"}.pdf`), bytes, "application/pdf");
    } catch {
      setError("No se pudo generar el PDF de la nota de entrega.");
    }
  }

  function handleReset() {
    setData(createDefaultDeliveryNote());
    setError(null);
  }

  const totalPending = data.lines.reduce((sum, l) => sum + quantityPending(l), 0);
  const summary = `${data.lines.length} línea(s) · ${totalPending} unidad(es) pendiente(s)`;

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">Los datos del envío permanecen en tu dispositivo.</p>

      <div>
        <Label htmlFor="dn-mode" className="mb-1">
          Tipo de documento
        </Label>
        <Select value={data.mode} onValueChange={(v) => patch({ mode: v as DeliveryNoteMode })}>
          <SelectTrigger id="dn-mode" className="w-full sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(DELIVERY_NOTE_MODE_LABELS) as DeliveryNoteMode[]).map((m) => (
              <SelectItem key={m} value={m}>
                {DELIVERY_NOTE_MODE_LABELS[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="dn-sender" className="mb-1">
            Remitente
          </Label>
          <Input id="dn-sender" value={data.senderName} onChange={(e) => patch({ senderName: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="dn-recipient" className="mb-1">
            Destinatario
          </Label>
          <Input id="dn-recipient" value={data.recipientName} onChange={(e) => patch({ recipientName: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="dn-sender-addr" className="mb-1">
            Dirección del remitente
          </Label>
          <Input id="dn-sender-addr" value={data.senderAddress} onChange={(e) => patch({ senderAddress: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="dn-delivery-addr" className="mb-1">
            Dirección de entrega
          </Label>
          <Input id="dn-delivery-addr" value={data.deliveryAddress} onChange={(e) => patch({ deliveryAddress: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="dn-order" className="mb-1">
            N.º de pedido
          </Label>
          <Input id="dn-order" value={data.orderNumber} onChange={(e) => patch({ orderNumber: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="dn-shipment" className="mb-1">
            N.º de envío
          </Label>
          <Input id="dn-shipment" value={data.shipmentNumber} onChange={(e) => patch({ shipmentNumber: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="dn-date" className="mb-1">
            Fecha
          </Label>
          <Input id="dn-date" type="date" value={data.date} onChange={(e) => patch({ date: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="dn-carrier" className="mb-1">
            Transportista
          </Label>
          <Input id="dn-carrier" value={data.carrier} onChange={(e) => patch({ carrier: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="dn-packages" className="mb-1">
            Número de paquetes
          </Label>
          <Input id="dn-packages" type="number" min={1} value={data.packageCount} onChange={(e) => patch({ packageCount: Number(e.target.value) })} />
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={data.showPrices} onCheckedChange={(c) => patch({ showPrices: Boolean(c) })} />
          Mostrar precios
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={data.showWeight} onCheckedChange={(c) => patch({ showWeight: Boolean(c) })} />
          Mostrar peso
        </label>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Líneas</h2>
        {data.lines.map((line) => (
          <div key={line.id} className="grid gap-2 rounded-md border p-2 sm:grid-cols-6">
            <Input placeholder="SKU" value={line.sku} onChange={(e) => updateLine(line.id, { sku: e.target.value })} />
            <Input placeholder="Descripción" value={line.description} onChange={(e) => updateLine(line.id, { description: e.target.value })} className="sm:col-span-2" />
            <Input type="number" min={0} placeholder="Solicitado" value={line.quantityOrdered} onChange={(e) => updateLine(line.id, { quantityOrdered: Number(e.target.value) })} />
            <Input type="number" min={0} placeholder="Enviado" value={line.quantityShipped} onChange={(e) => updateLine(line.id, { quantityShipped: Number(e.target.value) })} />
            <Input placeholder="Unidad" value={line.unit} onChange={(e) => updateLine(line.id, { unit: e.target.value })} />
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setData((prev) => ({ ...prev, lines: [...prev.lines, createDeliveryNoteLine()] }))}>
          Añadir línea
        </Button>
      </div>

      <div aria-live="polite" className="rounded-lg border p-4 text-sm font-semibold">
        {summary}
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
        <DownloadButton content={deliveryNoteLinesToCsv(data)} filename="lineas-nota-entrega.csv" mimeType="text/csv;charset=utf-8" label="Descargar CSV" />
        <CopyButton text={summary} label="Copiar resumen" />
        <ResetButton onReset={handleReset} />
      </div>
    </div>
  );
}
