"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import { CopyButton, DownloadButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { downloadBlob } from "@/lib/public-tools/files/download";
import { sanitizeFilename } from "@/lib/public-tools/files/filenames";
import { computeInvoiceTotals, formatMoney, majorToMinor, COMMON_CURRENCIES, type DocumentKind, type InvoiceLineInput } from "@/lib/public-tools/business/invoice";

interface PartyForm {
  name: string;
  email: string;
  phone: string;
  address: string;
  website: string;
  taxId: string;
}

const EMPTY_PARTY: PartyForm = { name: "", email: "", phone: "", address: "", website: "", taxId: "" };

interface LineForm {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  taxPercent: string;
}

function newLine(id: string): LineForm {
  return { id, description: "", quantity: "1", unitPrice: "0", discountPercent: "0", taxPercent: "0" };
}

export function InvoiceGeneratorTool() {
  const [kind, setKind] = useState<DocumentKind>("FACTURA");
  const [issuer, setIssuer] = useState<PartyForm>(EMPTY_PARTY);
  const [client, setClient] = useState<PartyForm>(EMPTY_PARTY);
  const [documentNumber, setDocumentNumber] = useState("1");
  const [issueDate, setIssueDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [reference, setReference] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [lines, setLines] = useState<LineForm[]>([newLine("l1")]);
  const [globalDiscountPercent, setGlobalDiscountPercent] = useState("0");
  const [shipping, setShipping] = useState("0");
  const [paid, setPaid] = useState("0");
  const [logoBytes, setLogoBytes] = useState<Uint8Array | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function updateLine(id: string, field: keyof LineForm, value: string) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, newLine(`l${prev.length + 1}-${Date.now()}`)]);
  }
  function removeLine(id: string) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.id !== id) : prev));
  }

  const parsedLines: InvoiceLineInput[] = useMemo(
    () =>
      lines.map((l) => ({
        id: l.id,
        description: l.description,
        quantity: Number(l.quantity) || 0,
        unitPriceMinor: majorToMinor(Number(l.unitPrice) || 0, currency),
        discountPercent: Number(l.discountPercent) || 0,
        taxPercent: Number(l.taxPercent) || 0,
      })),
    [lines, currency]
  );

  const totals = useMemo(
    () =>
      computeInvoiceTotals({
        lines: parsedLines,
        globalDiscountPercent: Number(globalDiscountPercent) || 0,
        shippingMinor: majorToMinor(Number(shipping) || 0, currency),
        paidMinor: majorToMinor(Number(paid) || 0, currency),
      }),
    [parsedLines, globalDiscountPercent, shipping, paid, currency]
  );

  async function handleLogoUpload(files: File[]) {
    const file = files[0];
    if (!file) return;
    const buffer = new Uint8Array(await file.arrayBuffer());
    setLogoBytes(buffer);
  }

  async function handleDownloadPdf() {
    setError(null);
    setBusy(true);
    try {
      const { buildBusinessDocumentPdf } = await import("@/lib/public-tools/business/business-document-pdf");
      const bytes = await buildBusinessDocumentPdf({
        kind,
        issuer,
        client,
        documentNumber,
        issueDate,
        dueDate,
        currency,
        notes,
        terms,
        reference,
        lines: parsedLines,
        globalDiscountPercent: Number(globalDiscountPercent) || 0,
        shippingMinor: majorToMinor(Number(shipping) || 0, currency),
        paidMinor: majorToMinor(Number(paid) || 0, currency),
        logoPngBytes: logoBytes,
      });
      const filename = sanitizeFilename(`${kind === "FACTURA" ? "factura" : "presupuesto"}-${documentNumber || "documento"}.pdf`);
      downloadBlob(filename, bytes, "application/pdf");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar el PDF.");
    } finally {
      setBusy(false);
    }
  }

  function handleClearAll() {
    setIssuer(EMPTY_PARTY);
    setClient(EMPTY_PARTY);
    setDocumentNumber("1");
    setIssueDate("");
    setDueDate("");
    setReference("");
    setNotes("");
    setTerms("");
    setLines([newLine("l1")]);
    setGlobalDiscountPercent("0");
    setShipping("0");
    setPaid("0");
    setLogoBytes(null);
    setError(null);
  }

  const summaryText = [
    `${kind === "FACTURA" ? "Factura" : "Presupuesto"} N.º ${documentNumber}`,
    `Emisor: ${issuer.name}`,
    `Cliente: ${client.name}`,
    `Subtotal: ${formatMoney(totals.subtotalMinor, currency)}`,
    totals.globalDiscountMinor > 0 ? `Descuento: -${formatMoney(totals.globalDiscountMinor, currency)}` : null,
    totals.totalTaxMinor > 0 ? `Impuestos: ${formatMoney(totals.totalTaxMinor, currency)}` : null,
    `TOTAL: ${formatMoney(totals.grandTotalMinor, currency)}`,
    totals.paidMinor > 0 ? `Pagado: ${formatMoney(totals.paidMinor, currency)}, Saldo pendiente: ${formatMoney(totals.balanceDueMinor, currency)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const jsonExport = JSON.stringify({ kind, issuer, client, documentNumber, issueDate, dueDate, reference, currency, notes, terms, lines: parsedLines, totals }, null, 2);

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <Button type="button" variant={kind === "FACTURA" ? "default" : "outline"} size="sm" onClick={() => setKind("FACTURA")}>
          Factura
        </Button>
        <Button type="button" variant={kind === "PRESUPUESTO" ? "default" : "outline"} size="sm" onClick={() => setKind("PRESUPUESTO")}>
          Presupuesto
        </Button>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <fieldset className="space-y-2 rounded-lg border p-4">
          <legend className="px-1 text-sm font-medium">Emisor</legend>
          <Input aria-label="Nombre del emisor" placeholder="Nombre o negocio" value={issuer.name} onChange={(e) => setIssuer({ ...issuer, name: e.target.value })} />
          <Input aria-label="Correo del emisor" placeholder="Correo" value={issuer.email} onChange={(e) => setIssuer({ ...issuer, email: e.target.value })} />
          <Input aria-label="Teléfono del emisor" placeholder="Teléfono" value={issuer.phone} onChange={(e) => setIssuer({ ...issuer, phone: e.target.value })} />
          <Input aria-label="Dirección del emisor" placeholder="Dirección" value={issuer.address} onChange={(e) => setIssuer({ ...issuer, address: e.target.value })} />
          <Input aria-label="Sitio web del emisor" placeholder="Sitio web" value={issuer.website} onChange={(e) => setIssuer({ ...issuer, website: e.target.value })} />
          <Input aria-label="Identificador fiscal del emisor" placeholder="Identificador fiscal (opcional)" value={issuer.taxId} onChange={(e) => setIssuer({ ...issuer, taxId: e.target.value })} />
          <FileUploadZone accept="image/png" onFilesSelected={handleLogoUpload} label="Arrastra tu logo PNG aquí, o" hint="Opcional, formato PNG." />
          {logoBytes ? <p className="text-xs text-muted-foreground">Logo cargado ({logoBytes.length} bytes)</p> : null}
        </fieldset>

        <fieldset className="space-y-2 rounded-lg border p-4">
          <legend className="px-1 text-sm font-medium">Cliente</legend>
          <Input aria-label="Nombre del cliente" placeholder="Nombre" value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} />
          <Input aria-label="Empresa del cliente" placeholder="Empresa" value={client.website} onChange={(e) => setClient({ ...client, website: e.target.value })} />
          <Input aria-label="Correo del cliente" placeholder="Correo" value={client.email} onChange={(e) => setClient({ ...client, email: e.target.value })} />
          <Input aria-label="Dirección del cliente" placeholder="Dirección" value={client.address} onChange={(e) => setClient({ ...client, address: e.target.value })} />
          <Input aria-label="Identificador del cliente" placeholder="Identificador (opcional)" value={client.taxId} onChange={(e) => setClient({ ...client, taxId: e.target.value })} />
        </fieldset>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <div>
          <Label htmlFor="doc-number" className="mb-1">
            Número
          </Label>
          <Input id="doc-number" value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="issue-date" className="mb-1">
            Fecha de emisión
          </Label>
          <Input id="issue-date" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="due-date" className="mb-1">
            Fecha de vencimiento
          </Label>
          <Input id="due-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="doc-currency" className="mb-1">
            Moneda
          </Label>
          <Select value={currency} onValueChange={(v) => setCurrency(v as string)}>
            <SelectTrigger id="doc-currency" className="w-full">
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
      <Input aria-label="Referencia" placeholder="Referencia (opcional)" value={reference} onChange={(e) => setReference(e.target.value)} />

      <div className="space-y-3">
        <p className="text-sm font-medium">Líneas</p>
        {lines.map((line, index) => (
          <div key={line.id} className="grid grid-cols-2 gap-2 rounded-lg border p-3 sm:grid-cols-6">
            <Input className="sm:col-span-2" aria-label={`Descripción línea ${index + 1}`} placeholder="Descripción" value={line.description} onChange={(e) => updateLine(line.id, "description", e.target.value)} />
            <Input aria-label={`Cantidad línea ${index + 1}`} placeholder="Cantidad" value={line.quantity} onChange={(e) => updateLine(line.id, "quantity", e.target.value)} />
            <Input aria-label={`Precio unitario línea ${index + 1}`} placeholder="Precio" value={line.unitPrice} onChange={(e) => updateLine(line.id, "unitPrice", e.target.value)} />
            <Input aria-label={`Descuento línea ${index + 1}`} placeholder="Desc. %" value={line.discountPercent} onChange={(e) => updateLine(line.id, "discountPercent", e.target.value)} />
            <div className="flex gap-1">
              <Input aria-label={`Impuesto línea ${index + 1}`} placeholder="Imp. %" value={line.taxPercent} onChange={(e) => updateLine(line.id, "taxPercent", e.target.value)} />
              <Button type="button" variant="ghost" size="sm" onClick={() => removeLine(line.id)} aria-label={`Eliminar línea ${index + 1}`}>
                ✕
              </Button>
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addLine}>
          Añadir línea
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="global-discount" className="mb-1">
            Descuento global (%)
          </Label>
          <Input id="global-discount" value={globalDiscountPercent} onChange={(e) => setGlobalDiscountPercent(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="shipping" className="mb-1">
            Envío / cargo adicional
          </Label>
          <Input id="shipping" value={shipping} onChange={(e) => setShipping(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="paid" className="mb-1">
            Cantidad pagada
          </Label>
          <Input id="paid" value={paid} onChange={(e) => setPaid(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="doc-notes" className="mb-1">
            Notas
          </Label>
          <Textarea id="doc-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </div>
        <div>
          <Label htmlFor="doc-terms" className="mb-1">
            Condiciones
          </Label>
          <Textarea id="doc-terms" value={terms} onChange={(e) => setTerms(e.target.value)} rows={3} />
        </div>
      </div>

      <div aria-live="polite" className="space-y-1 rounded-lg border p-4 text-sm">
        <p>
          Subtotal: <strong>{formatMoney(totals.subtotalMinor, currency)}</strong>
        </p>
        {totals.globalDiscountMinor > 0 ? <p>Descuento: -{formatMoney(totals.globalDiscountMinor, currency)}</p> : null}
        {totals.totalTaxMinor > 0 ? <p>Impuestos: {formatMoney(totals.totalTaxMinor, currency)}</p> : null}
        {totals.shippingMinor > 0 ? <p>Envío: {formatMoney(totals.shippingMinor, currency)}</p> : null}
        <p className="text-base font-semibold">TOTAL: {formatMoney(totals.grandTotalMinor, currency)}</p>
        {totals.paidMinor > 0 ? (
          <p>
            Pagado: {formatMoney(totals.paidMinor, currency)} — Saldo pendiente: <strong>{formatMoney(totals.balanceDueMinor, currency)}</strong>
          </p>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={handleDownloadPdf} disabled={busy}>
          {busy ? "Generando..." : "Descargar PDF"}
        </Button>
        <CopyButton text={summaryText} label="Copiar resumen" />
        <DownloadButton content={jsonExport} filename="documento.json" mimeType="application/json" label="Descargar JSON" />
        <ResetButton onReset={handleClearAll} label="Borrar todos los datos" />
      </div>

      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
        Revisa los requisitos fiscales y comerciales aplicables en tu país antes de utilizar el documento.
      </p>
    </div>
  );
}
