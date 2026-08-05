"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CopyButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { createDefaultReceipt, createReceiptLine, computeReceiptTotals, formatReceiptMoney, validateReceipt, RECEIPT_MODE_LABELS, type ReceiptData, type ReceiptMode } from "@/lib/public-tools/business/receipt";
import { COMMON_CURRENCIES, majorToMinor, minorToMajor } from "@/lib/public-tools/business/invoice";
import { buildReceiptPdf } from "@/lib/public-tools/business/receipt-pdf";
import { downloadBlob } from "@/lib/public-tools/files/download";
import { sanitizeFilename } from "@/lib/public-tools/files/filenames";

export function ReceiptGeneratorTool() {
  const [data, setData] = useState<ReceiptData>(createDefaultReceipt());
  const [error, setError] = useState<string | null>(null);

  const validation = validateReceipt(data);
  const totals = computeReceiptTotals(data);

  function patch(p: Partial<ReceiptData>) {
    setData((prev) => ({ ...prev, ...p }));
  }
  function updateLine(id: string, patch2: Partial<ReceiptData["lines"][number]>) {
    setData((prev) => ({ ...prev, lines: prev.lines.map((l) => (l.id === id ? { ...l, ...patch2 } : l)) }));
  }
  function removeLine(id: string) {
    setData((prev) => ({ ...prev, lines: prev.lines.filter((l) => l.id !== id) }));
  }

  async function handleDownloadPdf() {
    setError(null);
    try {
      const bytes = await buildReceiptPdf(data);
      downloadBlob(sanitizeFilename(`recibo-${data.receiptNumber || "sin-numero"}.pdf`), bytes, "application/pdf");
    } catch {
      setError("No se pudo generar el PDF del recibo.");
    }
  }

  function handleReset() {
    setData(createDefaultReceipt());
    setError(null);
  }

  const summary = [`Total: ${formatReceiptMoney(totals.grandTotalMinor, data)}`, data.amountReceivedMinor > 0 ? `${totals.changeMinor >= 0 ? "Cambio" : "Pendiente"}: ${formatReceiptMoney(Math.abs(totals.changeMinor), data)}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">Los datos del negocio, clientes e importes permanecen en tu dispositivo.</p>
      <p className="text-xs text-muted-foreground">El documento refleja únicamente la información introducida por el usuario y no verifica una transacción real.</p>

      <div>
        <Label htmlFor="receipt-mode" className="mb-1">
          Tipo
        </Label>
        <Select value={data.mode} onValueChange={(v) => patch({ mode: v as ReceiptMode })}>
          <SelectTrigger id="receipt-mode" className="w-full sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(RECEIPT_MODE_LABELS) as ReceiptMode[]).map((m) => (
              <SelectItem key={m} value={m}>
                {RECEIPT_MODE_LABELS[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="receipt-issuer" className="mb-1">
            Emitido por
          </Label>
          <Input id="receipt-issuer" value={data.issuerName} onChange={(e) => patch({ issuerName: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="receipt-receiver" className="mb-1">
            Recibido de
          </Label>
          <Input id="receipt-receiver" value={data.receiverName} onChange={(e) => patch({ receiverName: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="receipt-number" className="mb-1">
            N.º de recibo
          </Label>
          <Input id="receipt-number" value={data.receiptNumber} onChange={(e) => patch({ receiptNumber: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="receipt-date" className="mb-1">
            Fecha
          </Label>
          <Input id="receipt-date" type="date" value={data.date} onChange={(e) => patch({ date: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="receipt-payment" className="mb-1">
            Método de pago
          </Label>
          <Input id="receipt-payment" value={data.paymentMethod} onChange={(e) => patch({ paymentMethod: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="receipt-currency" className="mb-1">
            Moneda
          </Label>
          <Select value={data.currency} onValueChange={(v) => patch({ currency: v as string })}>
            <SelectTrigger id="receipt-currency" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMMON_CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Líneas</h2>
        {data.lines.map((line) => (
          <div key={line.id} className="grid gap-2 rounded-md border p-2 sm:grid-cols-6">
            <Input placeholder="Concepto" value={line.description} onChange={(e) => updateLine(line.id, { description: e.target.value })} className="sm:col-span-2" />
            <Input type="number" min={0} placeholder="Cant." value={line.quantity} onChange={(e) => updateLine(line.id, { quantity: Number(e.target.value) })} />
            <Input type="number" min={0} step="0.01" placeholder="Precio" value={minorToMajor(line.unitPriceMinor, data.currency)} onChange={(e) => updateLine(line.id, { unitPriceMinor: majorToMinor(Number(e.target.value), data.currency) })} />
            <Input type="number" min={0} max={100} placeholder="Imp. %" value={line.taxPercent} onChange={(e) => updateLine(line.id, { taxPercent: Number(e.target.value) })} />
            <Button type="button" variant="ghost" size="sm" onClick={() => removeLine(line.id)}>
              Eliminar
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setData((prev) => ({ ...prev, lines: [...prev.lines, createReceiptLine()] }))}>
          Añadir línea
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="receipt-tip" className="mb-1">
            Propina (opcional)
          </Label>
          <Input id="receipt-tip" type="number" min={0} step="0.01" value={minorToMajor(data.tipMinor, data.currency)} onChange={(e) => patch({ tipMinor: majorToMinor(Number(e.target.value), data.currency) })} />
        </div>
        <div>
          <Label htmlFor="receipt-received" className="mb-1">
            Importe recibido (opcional)
          </Label>
          <Input id="receipt-received" type="number" min={0} step="0.01" value={minorToMajor(data.amountReceivedMinor, data.currency)} onChange={(e) => patch({ amountReceivedMinor: majorToMinor(Number(e.target.value), data.currency) })} />
        </div>
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
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={handleDownloadPdf} disabled={validation.errors.length > 0}>
          Descargar PDF
        </Button>
        <CopyButton text={summary} label="Copiar resumen" />
        <Button type="button" variant="outline" onClick={() => window.print()}>
          Imprimir
        </Button>
        <ResetButton onReset={handleReset} />
      </div>
    </div>
  );
}
