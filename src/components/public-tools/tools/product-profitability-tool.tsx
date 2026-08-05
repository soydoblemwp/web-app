"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CopyButton, ResetButton, DownloadButton } from "@/components/public-tools/copy-download-actions";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import { COMMON_CURRENCIES, majorToMinor, minorToMajor, formatMoney } from "@/lib/public-tools/business/invoice";
import { calculateProductProfitability, sortByProfit, sortByMargin, findLossMakingProducts, type ProductProfitabilityInput } from "@/lib/public-tools/commerce/product-profitability";
import { buildCsv, downloadTextFile } from "@/lib/public-tools/csv-export";
import { buildDocumentEnvelope, parseDocumentEnvelope } from "@/lib/public-tools/documents/json-schema";
import { DOCUMENT_LIMITS } from "@/lib/public-tools/documents/limits";

const TOOL_ID = "calculadora-rentabilidad-productos";
type SortMode = "none" | "profit" | "margin";
const SORT_MODE_LABELS: Record<SortMode, string> = { none: "Sin ordenar", profit: "Beneficio por unidad", margin: "Margen neto" };

function createProduct(): ProductProfitabilityInput {
  return {
    id: `pp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: "",
    priceMinor: 0,
    costMinor: 0,
    packagingMinor: 0,
    shippingMinor: 0,
    processingFeeMinor: 0,
    commissionFixedMinor: 0,
    commissionPercent: 0,
    adCostPerSaleMinor: 0,
    returnRatePercent: 0,
    nonRecoverableTaxMinor: 0,
    unitsSoldPerMonth: 0,
    allocatedFixedCostsMinor: 0,
    targetMarginPercent: 30,
  };
}

export function ProductProfitabilityTool() {
  const [currency, setCurrency] = useState("EUR");
  const [products, setProducts] = useState<ProductProfitabilityInput[]>([{ ...createProduct(), name: "Producto A" }]);
  const [sortMode, setSortMode] = useState<SortMode>("none");
  const [error, setError] = useState<string | null>(null);

  function updateProduct(id: string, p: Partial<ProductProfitabilityInput>) {
    setProducts((prev) => prev.map((prod) => (prod.id === id ? { ...prod, ...p } : prod)));
  }

  let results = products.map(calculateProductProfitability);
  if (sortMode === "profit") results = sortByProfit(results);
  if (sortMode === "margin") results = sortByMargin(results);
  const lossMaking = findLossMakingProducts(results);

  const csv = buildCsv(
    ["Producto", "Precio", "Beneficio por unidad", "Margen neto %", "ROI sobre coste %", "Beneficio mensual"],
    results.map((r) => [r.name ?? "", r.revenuePerUnitMinor !== undefined ? minorToMajor(r.revenuePerUnitMinor, currency).toFixed(2) : "", r.profitPerUnitMinor !== undefined ? minorToMajor(r.profitPerUnitMinor, currency).toFixed(2) : "", r.netMarginPercent?.toFixed(2) ?? "", r.roiOnCostPercent?.toFixed(2) ?? "", r.monthlyProfitMinor !== undefined ? minorToMajor(r.monthlyProfitMinor, currency).toFixed(2) : ""])
  );

  const summary = results.map((r) => (r.ok ? `${r.name || "Sin nombre"}: beneficio ${formatMoney(r.profitPerUnitMinor!, currency)}/u, margen ${r.netMarginPercent!.toFixed(1)}%` : `${products.find((p) => p.id === r.id)?.name || "Producto"}: ${r.error}`)).join("\n");

  function handleExportJson() {
    downloadTextFile(`${TOOL_ID}.json`, JSON.stringify(buildDocumentEnvelope(TOOL_ID, { currency, products }), null, 2), "application/json;charset=utf-8");
  }
  function handleImportJson(files: File[]) {
    const file = files[0];
    if (!file) return;
    file.text().then((text) => {
      const result = parseDocumentEnvelope<{ currency: string; products: ProductProfitabilityInput[] }>(text, TOOL_ID);
      if (!result.ok || !result.data) {
        setError(result.error ?? "No se pudo importar el archivo.");
        return;
      }
      setCurrency(result.data.currency);
      setProducts(result.data.products);
      setError(null);
    });
  }

  const fields: { key: keyof ProductProfitabilityInput; label: string; isPercent?: boolean }[] = [
    { key: "priceMinor", label: "Precio de venta" },
    { key: "costMinor", label: "Coste del producto" },
    { key: "packagingMinor", label: "Embalaje" },
    { key: "shippingMinor", label: "Envío asumido" },
    { key: "processingFeeMinor", label: "Coste de procesamiento" },
    { key: "commissionFixedMinor", label: "Comisión fija" },
    { key: "commissionPercent", label: "Comisión %", isPercent: true },
    { key: "adCostPerSaleMinor", label: "Coste publicitario/venta" },
    { key: "returnRatePercent", label: "Tasa de devolución %", isPercent: true },
    { key: "nonRecoverableTaxMinor", label: "Impuesto no recuperable" },
    { key: "allocatedFixedCostsMinor", label: "Costes fijos asignados (mes)" },
    { key: "targetMarginPercent", label: "Margen objetivo %", isPercent: true },
  ];

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">Los datos se procesan en tu dispositivo y no se envían al servidor.</p>
      <p className="text-xs text-muted-foreground">Introduce las tarifas reales de la plataforma o canal que utilices. La herramienta no consulta comisiones actuales de ningún marketplace.</p>

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <Label htmlFor="pp-currency" className="mb-1">
            Moneda
          </Label>
          <Select value={currency} onValueChange={(v) => setCurrency(v as string)}>
            <SelectTrigger id="pp-currency" className="w-32">
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
          <Label htmlFor="pp-sort" className="mb-1">
            Ordenar por
          </Label>
          <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
            <SelectTrigger id="pp-sort" className="w-52">
              <SelectValue>{SORT_MODE_LABELS[sortMode]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin ordenar</SelectItem>
              <SelectItem value="profit">Beneficio por unidad</SelectItem>
              <SelectItem value="margin">Margen neto</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-4">
        {products.map((p) => {
          const result = calculateProductProfitability(p);
          return (
            <div key={p.id} className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <Input placeholder="Nombre del producto" value={p.name} onChange={(e) => updateProduct(p.id, { name: e.target.value })} className="max-w-sm font-medium" />
                <Input type="number" min={0} step="1" placeholder="Unidades/mes" value={p.unitsSoldPerMonth} onChange={(e) => updateProduct(p.id, { unitsSoldPerMonth: Number(e.target.value) })} className="max-w-[10rem]" />
                <Button type="button" variant="ghost" size="sm" onClick={() => setProducts((prev) => prev.filter((prod) => prod.id !== p.id))}>
                  Eliminar
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {fields.map((f) => (
                  <div key={String(f.key)}>
                    <Label htmlFor={`pp-${p.id}-${String(f.key)}`} className="mb-1 text-xs">
                      {f.label}
                    </Label>
                    <Input
                      id={`pp-${p.id}-${String(f.key)}`}
                      type="number"
                      step="0.01"
                      value={f.isPercent ? (p[f.key] as number) : minorToMajor(p[f.key] as number, currency)}
                      onChange={(e) => updateProduct(p.id, { [f.key]: f.isPercent ? Number(e.target.value) : majorToMinor(Number(e.target.value), currency) } as Partial<ProductProfitabilityInput>)}
                    />
                  </div>
                ))}
              </div>
              {result.ok ? (
                <div className="grid gap-1 rounded-md bg-muted/30 p-2 text-sm sm:grid-cols-2 lg:grid-cols-3" aria-live="polite">
                  <p>
                    Beneficio/unidad: <strong className={result.profitPerUnitMinor! < 0 ? "text-destructive" : ""}>{formatMoney(result.profitPerUnitMinor!, currency)}</strong>
                    {result.profitPerUnitMinor! < 0 ? " (pérdida)" : ""}
                  </p>
                  <p>Margen neto: {result.netMarginPercent!.toFixed(1)}%</p>
                  <p>ROI sobre coste: {result.roiOnCostPercent!.toFixed(1)}%</p>
                  <p>Beneficio mensual: {formatMoney(result.monthlyProfitMinor!, currency)}</p>
                  {result.breakEvenPriceMinor !== undefined ? <p>Precio mínimo de equilibrio: {formatMoney(result.breakEvenPriceMinor, currency)}</p> : null}
                  {result.maxAcquisitionCostForTargetMarginMinor !== undefined ? <p>Coste máx. para margen objetivo: {formatMoney(result.maxAcquisitionCostForTargetMarginMinor, currency)}</p> : null}
                </div>
              ) : (
                <p role="alert" className="text-sm text-destructive">
                  {result.error}
                </p>
              )}
            </div>
          );
        })}
        <Button type="button" variant="outline" size="sm" onClick={() => setProducts((prev) => (prev.length < DOCUMENT_LIMITS.productProfitability.maxProducts ? [...prev, createProduct()] : prev))}>
          Añadir producto
        </Button>
      </div>

      {lossMaking.length > 0 ? (
        <p role="alert" className="text-sm text-destructive">
          {lossMaking.length} producto(s) generan pérdida por unidad: {lossMaking.map((p) => p.name).join(", ")}.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <CopyButton text={summary} label="Copiar resumen" />
        <DownloadButton content={csv} filename="rentabilidad-productos.csv" mimeType="text/csv;charset=utf-8" label="Descargar CSV" />
        <Button type="button" variant="outline" onClick={handleExportJson}>
          Exportar JSON
        </Button>
        <ResetButton
          onReset={() => {
            setCurrency("EUR");
            setProducts([{ ...createProduct(), name: "Producto A" }]);
            setSortMode("none");
            setError(null);
          }}
        />
      </div>

      <FileUploadZone accept="application/json" onFilesSelected={handleImportJson} label="Importar productos guardados previamente" hint="" />
    </div>
  );
}
