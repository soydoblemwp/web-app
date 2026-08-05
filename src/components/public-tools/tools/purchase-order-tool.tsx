"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CopyButton, ResetButton, DownloadButton } from "@/components/public-tools/copy-download-actions";
import { createDefaultPurchaseOrder, createPurchaseOrderLine, computePurchaseOrderTotals, formatPurchaseOrderMoney, validatePurchaseOrder, type PurchaseOrderData } from "@/lib/public-tools/business/purchase-order";
import { COMMON_CURRENCIES, majorToMinor, minorToMajor } from "@/lib/public-tools/business/invoice";
import { buildPurchaseOrderPdf, purchaseOrderLinesToCsv } from "@/lib/public-tools/business/purchase-order-pdf";
import { buildDocumentEnvelope } from "@/lib/public-tools/documents/json-schema";
import { downloadBlob } from "@/lib/public-tools/files/download";
import { downloadTextFile } from "@/lib/public-tools/csv-export";
import { sanitizeFilename } from "@/lib/public-tools/files/filenames";

export function PurchaseOrderTool() {
  const [data, setData] = useState<PurchaseOrderData>(createDefaultPurchaseOrder());
  const [error, setError] = useState<string | null>(null);

  const validation = validatePurchaseOrder(data);
  const totals = computePurchaseOrderTotals(data);

  function patch(p: Partial<PurchaseOrderData>) {
    setData((prev) => ({ ...prev, ...p }));
  }
  function updateLine(id: string, patch2: Partial<PurchaseOrderData["lines"][number]>) {
    setData((prev) => ({ ...prev, lines: prev.lines.map((l) => (l.id === id ? { ...l, ...patch2 } : l)) }));
  }

  async function handleDownloadPdf() {
    setError(null);
    try {
      const bytes = await buildPurchaseOrderPdf(data);
      downloadBlob(sanitizeFilename(`orden-compra-${data.orderNumber || "sin-numero"}.pdf`), bytes, "application/pdf");
    } catch {
      setError("No se pudo generar el PDF de la orden.");
    }
  }

  function handleReset() {
    setData(createDefaultPurchaseOrder());
    setError(null);
  }

  const summary = `Total: ${formatPurchaseOrderMoney(totals.grandTotalMinor, data)} · ${data.lines.length} línea(s)`;

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">Los datos del negocio, clientes e importes permanecen en tu dispositivo.</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 rounded-md border p-2">
          <p className="text-xs font-semibold text-muted-foreground">Comprador</p>
          <Input placeholder="Nombre" value={data.buyer.name} onChange={(e) => patch({ buyer: { ...data.buyer, name: e.target.value } })} />
          <Input placeholder="Dirección" value={data.buyer.address} onChange={(e) => patch({ buyer: { ...data.buyer, address: e.target.value } })} />
          <Input placeholder="Contacto" value={data.buyer.contact} onChange={(e) => patch({ buyer: { ...data.buyer, contact: e.target.value } })} />
        </div>
        <div className="space-y-2 rounded-md border p-2">
          <p className="text-xs font-semibold text-muted-foreground">Proveedor</p>
          <Input placeholder="Nombre" value={data.supplier.name} onChange={(e) => patch({ supplier: { ...data.supplier, name: e.target.value } })} />
          <Input placeholder="Dirección" value={data.supplier.address} onChange={(e) => patch({ supplier: { ...data.supplier, address: e.target.value } })} />
          <Input placeholder="Contacto" value={data.supplier.contact} onChange={(e) => patch({ supplier: { ...data.supplier, contact: e.target.value } })} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="po-number" className="mb-1">
            N.º de orden
          </Label>
          <Input id="po-number" value={data.orderNumber} onChange={(e) => patch({ orderNumber: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="po-date" className="mb-1">
            Fecha
          </Label>
          <Input id="po-date" type="date" value={data.date} onChange={(e) => patch({ date: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="po-required" className="mb-1">
            Fecha requerida
          </Label>
          <Input id="po-required" type="date" value={data.requiredDate} onChange={(e) => patch({ requiredDate: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="po-currency" className="mb-1">
            Moneda
          </Label>
          <Select value={data.currency} onValueChange={(v) => patch({ currency: v as string })}>
            <SelectTrigger id="po-currency" className="w-full">
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
        <div>
          <Label htmlFor="po-responsible" className="mb-1">
            Responsable
          </Label>
          <Input id="po-responsible" value={data.responsible} onChange={(e) => patch({ responsible: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="po-shipping" className="mb-1">
            Envío
          </Label>
          <Input id="po-shipping" type="number" min={0} step="0.01" value={minorToMajor(data.shippingMinor, data.currency)} onChange={(e) => patch({ shippingMinor: majorToMinor(Number(e.target.value), data.currency) })} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="po-billing" className="mb-1">
            Dirección de facturación
          </Label>
          <Input id="po-billing" value={data.billingAddress} onChange={(e) => patch({ billingAddress: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="po-shipping-addr" className="mb-1">
            Dirección de entrega
          </Label>
          <Input id="po-shipping-addr" value={data.shippingAddress} onChange={(e) => patch({ shippingAddress: e.target.value })} />
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Líneas</h2>
        {data.lines.map((line) => (
          <div key={line.id} className="grid gap-2 rounded-md border p-2 sm:grid-cols-7">
            <Input placeholder="SKU" value={line.sku} onChange={(e) => updateLine(line.id, { sku: e.target.value })} />
            <Input placeholder="Descripción" value={line.description} onChange={(e) => updateLine(line.id, { description: e.target.value })} className="sm:col-span-2" />
            <Input type="number" min={0} placeholder="Cant." value={line.quantity} onChange={(e) => updateLine(line.id, { quantity: Number(e.target.value) })} />
            <Input placeholder="Unidad" value={line.unit} onChange={(e) => updateLine(line.id, { unit: e.target.value })} />
            <Input type="number" min={0} step="0.01" placeholder="Precio" value={minorToMajor(line.unitPriceMinor, data.currency)} onChange={(e) => updateLine(line.id, { unitPriceMinor: majorToMinor(Number(e.target.value), data.currency) })} />
            <Input type="number" min={0} max={100} placeholder="Imp. %" value={line.taxPercent} onChange={(e) => updateLine(line.id, { taxPercent: Number(e.target.value) })} />
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setData((prev) => ({ ...prev, lines: [...prev.lines, createPurchaseOrderLine()] }))}>
          Añadir línea
        </Button>
      </div>

      <div>
        <Label htmlFor="po-terms" className="mb-1">
          Condiciones
        </Label>
        <textarea id="po-terms" value={data.terms} onChange={(e) => patch({ terms: e.target.value })} rows={2} className="w-full rounded-md border p-2 text-sm" />
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
        <DownloadButton content={purchaseOrderLinesToCsv(data)} filename="lineas-orden-compra.csv" mimeType="text/csv;charset=utf-8" label="Descargar CSV" />
        <Button
          type="button"
          variant="outline"
          onClick={() => downloadTextFile("orden-compra.json", JSON.stringify(buildDocumentEnvelope("generador-ordenes-compra", data), null, 2), "application/json;charset=utf-8")}
        >
          Exportar JSON
        </Button>
        <CopyButton text={summary} label="Copiar resumen" />
        <ResetButton onReset={handleReset} />
      </div>
    </div>
  );
}
