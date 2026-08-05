"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CopyButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { AccessibleChart } from "@/components/public-tools/accessible-chart";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import { COMMON_CURRENCIES, majorToMinor, minorToMajor, formatMoney } from "@/lib/public-tools/business/invoice";
import { calculateSingleProduct, calculateProfitTarget, calculateProductMix, type MixProductInput } from "@/lib/public-tools/commerce/break-even";
import { buildCsv, downloadTextFile } from "@/lib/public-tools/csv-export";
import { buildDocumentEnvelope, parseDocumentEnvelope } from "@/lib/public-tools/documents/json-schema";

const TOOL_ID = "calculadora-punto-equilibrio";
type Mode = "single" | "target" | "mix";

interface StoredState {
  mode: Mode;
  currency: string;
  fixedCosts: number;
  price: number;
  variableCost: number;
  expectedUnits: number;
  profitTarget: number;
  mixFixedCosts: number;
  products: MixProductInput[];
}

function createProduct(): MixProductInput {
  return { id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: "", priceMinor: 0, variableCostMinor: 0, proportionPercent: 0 };
}

function defaultState(): StoredState {
  return { mode: "single", currency: "EUR", fixedCosts: 1000, price: 20, variableCost: 8, expectedUnits: 100, profitTarget: 500, mixFixedCosts: 1000, products: [{ ...createProduct(), name: "Producto A" }, { ...createProduct(), name: "Producto B" }] };
}

export function BreakEvenTool() {
  const [state, setState] = useState<StoredState>(defaultState());
  const [error, setError] = useState<string | null>(null);
  const { currency } = state;

  function patch(p: Partial<StoredState>) {
    setState((prev) => ({ ...prev, ...p }));
  }
  function updateProduct(id: string, p: Partial<MixProductInput>) {
    setState((prev) => ({ ...prev, products: prev.products.map((prod) => (prod.id === id ? { ...prod, ...p } : prod)) }));
  }

  const singleResult = calculateSingleProduct({
    fixedCostsMinor: majorToMinor(state.fixedCosts, currency),
    priceMinor: majorToMinor(state.price, currency),
    variableCostMinor: majorToMinor(state.variableCost, currency),
    expectedUnits: state.expectedUnits,
  });

  const targetResult = calculateProfitTarget({
    fixedCostsMinor: majorToMinor(state.fixedCosts, currency),
    priceMinor: majorToMinor(state.price, currency),
    variableCostMinor: majorToMinor(state.variableCost, currency),
    expectedUnits: state.expectedUnits,
    profitTargetMinor: majorToMinor(state.profitTarget, currency),
  });

  const mixResult = calculateProductMix({
    fixedCostsMinor: majorToMinor(state.mixFixedCosts, currency),
    products: state.products,
  });

  function summaryText(): string {
    if (state.mode === "single" && singleResult.ok) {
      return [
        `Margen de contribución: ${formatMoney(singleResult.contributionMarginMinor!, currency)} (${(singleResult.contributionMarginRatio! * 100).toFixed(1)}%)`,
        `Punto de equilibrio: ${singleResult.breakEvenUnits!.toFixed(2)} unidades (${formatMoney(singleResult.breakEvenRevenueMinor!, currency)})`,
        `Beneficio a ${state.expectedUnits} unidades: ${formatMoney(singleResult.profitAtExpectedMinor!, currency)}`,
        `Margen de seguridad: ${singleResult.marginOfSafetyUnits!.toFixed(2)} unidades (${singleResult.marginOfSafetyPercent!.toFixed(1)}%)`,
      ].join("\n");
    }
    if (state.mode === "target" && targetResult.ok) {
      return [`Unidades necesarias: ${targetResult.unitsNeeded!.toFixed(2)}`, `Ingresos necesarios: ${formatMoney(targetResult.revenueNeeded!, currency)}`, `Diferencia frente al punto de equilibrio: ${targetResult.differenceFromBreakEvenUnits!.toFixed(2)} unidades`].join("\n");
    }
    if (state.mode === "mix" && mixResult.ok) {
      return [
        `Punto de equilibrio total: ${mixResult.totalBreakEvenUnits!.toFixed(2)} unidades (${formatMoney(mixResult.totalBreakEvenRevenueMinor!, currency)})`,
        ...(mixResult.perProduct ?? []).map((p) => `  ${p.name || "sin nombre"}: ${p.breakEvenUnits.toFixed(2)} unidades`),
      ].join("\n");
    }
    return "";
  }

  function handleExportJson() {
    downloadTextFile(`${TOOL_ID}.json`, JSON.stringify(buildDocumentEnvelope(TOOL_ID, state), null, 2), "application/json;charset=utf-8");
  }
  function handleImportJson(files: File[]) {
    const file = files[0];
    if (!file) return;
    file.text().then((text) => {
      const result = parseDocumentEnvelope<StoredState>(text, TOOL_ID);
      if (!result.ok || !result.data) {
        setError(result.error ?? "No se pudo importar el archivo.");
        return;
      }
      setError(null);
      setState(result.data);
    });
  }

  const csv =
    state.mode === "single" && singleResult.ok && singleResult.chartPoints
      ? buildCsv(
          ["Unidades", "Coste total", "Ingresos"],
          singleResult.chartPoints.map((p) => [p.units.toFixed(2), minorToMajor(p.costMinor, currency).toFixed(2), minorToMajor(p.revenueMinor, currency).toFixed(2)])
        )
      : state.mode === "mix" && mixResult.ok && mixResult.perProduct
        ? buildCsv(
            ["Producto", "Margen de contribución", "Unidades de equilibrio"],
            mixResult.perProduct.map((p) => [p.name, minorToMajor(p.contributionMarginMinor, currency).toFixed(2), p.breakEvenUnits.toFixed(2)])
          )
        : "";

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">Los datos se procesan en tu dispositivo y no se envían al servidor.</p>
      <p className="text-xs text-muted-foreground">Los resultados son estimaciones basadas en costes, precios y mezcla introducidos por el usuario. No constituye asesoramiento financiero.</p>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant={state.mode === "single" ? "default" : "outline"} size="sm" onClick={() => patch({ mode: "single" })}>
          Un producto
        </Button>
        <Button type="button" variant={state.mode === "target" ? "default" : "outline"} size="sm" onClick={() => patch({ mode: "target" })}>
          Objetivo de beneficio
        </Button>
        <Button type="button" variant={state.mode === "mix" ? "default" : "outline"} size="sm" onClick={() => patch({ mode: "mix" })}>
          Mezcla de productos
        </Button>
      </div>

      <div>
        <Label htmlFor="be-currency" className="mb-1">
          Moneda
        </Label>
        <Select value={state.currency} onValueChange={(v) => patch({ currency: v as string })}>
          <SelectTrigger id="be-currency" className="w-40">
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

      {state.mode !== "mix" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="be-fixed" className="mb-1">
              Costes fijos
            </Label>
            <Input id="be-fixed" type="number" min={0} step="0.01" value={state.fixedCosts} onChange={(e) => patch({ fixedCosts: Number(e.target.value) })} />
          </div>
          <div>
            <Label htmlFor="be-price" className="mb-1">
              Precio de venta por unidad
            </Label>
            <Input id="be-price" type="number" min={0} step="0.01" value={state.price} onChange={(e) => patch({ price: Number(e.target.value) })} />
          </div>
          <div>
            <Label htmlFor="be-variable" className="mb-1">
              Coste variable por unidad
            </Label>
            <Input id="be-variable" type="number" min={0} step="0.01" value={state.variableCost} onChange={(e) => patch({ variableCost: Number(e.target.value) })} />
          </div>
          <div>
            <Label htmlFor="be-units" className="mb-1">
              Unidades previstas
            </Label>
            <Input id="be-units" type="number" min={0} step="1" value={state.expectedUnits} onChange={(e) => patch({ expectedUnits: Number(e.target.value) })} />
          </div>
          {state.mode === "target" ? (
            <div>
              <Label htmlFor="be-target" className="mb-1">
                Beneficio objetivo
              </Label>
              <Input id="be-target" type="number" step="0.01" value={state.profitTarget} onChange={(e) => patch({ profitTarget: Number(e.target.value) })} />
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <Label htmlFor="be-mix-fixed" className="mb-1">
              Costes fijos totales
            </Label>
            <Input id="be-mix-fixed" type="number" min={0} step="0.01" value={state.mixFixedCosts} onChange={(e) => patch({ mixFixedCosts: Number(e.target.value) })} className="max-w-xs" />
          </div>
          {state.products.map((p) => (
            <div key={p.id} className="grid gap-2 rounded-md border p-2 sm:grid-cols-5">
              <Input placeholder="Nombre" value={p.name} onChange={(e) => updateProduct(p.id, { name: e.target.value })} className="sm:col-span-2" />
              <Input type="number" min={0} step="0.01" placeholder="Precio" value={minorToMajor(p.priceMinor, currency)} onChange={(e) => updateProduct(p.id, { priceMinor: majorToMinor(Number(e.target.value), currency) })} />
              <Input type="number" min={0} step="0.01" placeholder="Coste variable" value={minorToMajor(p.variableCostMinor, currency)} onChange={(e) => updateProduct(p.id, { variableCostMinor: majorToMinor(Number(e.target.value), currency) })} />
              <div className="flex gap-2">
                <Input type="number" min={0} max={100} step="0.1" placeholder="% mezcla" value={p.proportionPercent} onChange={(e) => updateProduct(p.id, { proportionPercent: Number(e.target.value) })} />
                <Button type="button" variant="ghost" size="sm" onClick={() => setState((prev) => ({ ...prev, products: prev.products.filter((prod) => prod.id !== p.id) }))}>
                  Eliminar
                </Button>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setState((prev) => ({ ...prev, products: [...prev.products, createProduct()] }))}>
            Añadir producto
          </Button>
        </div>
      )}

      {state.mode === "single" && !singleResult.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {singleResult.error}
        </p>
      ) : null}
      {state.mode === "target" && !targetResult.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {targetResult.error}
        </p>
      ) : null}
      {state.mode === "mix" && !mixResult.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {mixResult.error}
        </p>
      ) : null}
      {state.mode === "mix" && mixResult.ok && mixResult.warning ? <p className="text-sm text-amber-700 dark:text-amber-400">{mixResult.warning}</p> : null}

      {state.mode === "single" && singleResult.ok ? (
        <div aria-live="polite" className="space-y-4 rounded-lg border p-4">
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <p>
              Margen de contribución: <strong>{formatMoney(singleResult.contributionMarginMinor!, currency)}</strong> ({(singleResult.contributionMarginRatio! * 100).toFixed(1)}%)
            </p>
            <p>
              Punto de equilibrio: <strong>{singleResult.breakEvenUnits!.toFixed(2)} unidades</strong>
            </p>
            <p>Ingresos de equilibrio: {formatMoney(singleResult.breakEvenRevenueMinor!, currency)}</p>
            <p>Beneficio a {state.expectedUnits} unidades: {formatMoney(singleResult.profitAtExpectedMinor!, currency)}</p>
            <p>Margen de seguridad: {singleResult.marginOfSafetyUnits!.toFixed(2)} unidades ({singleResult.marginOfSafetyPercent!.toFixed(1)}%)</p>
          </div>
          {singleResult.chartPoints ? (
            <AccessibleChart
              title="Costes e ingresos por volumen de unidades"
              type="line"
              series={[
                { name: "Coste total", color: "#ef4444", points: singleResult.chartPoints.map((p) => ({ label: p.units.toFixed(0), value: minorToMajor(p.costMinor, currency) })) },
                { name: "Ingresos", color: "#22c55e", points: singleResult.chartPoints.map((p) => ({ label: p.units.toFixed(0), value: minorToMajor(p.revenueMinor, currency) })) },
              ]}
              valueFormatter={(v) => formatMoney(majorToMinor(v, currency), currency)}
            />
          ) : null}
        </div>
      ) : null}

      {state.mode === "target" && targetResult.ok ? (
        <div aria-live="polite" className="grid gap-2 rounded-lg border p-4 text-sm sm:grid-cols-2">
          <p>
            Unidades necesarias: <strong>{targetResult.unitsNeeded!.toFixed(2)}</strong>
          </p>
          <p>Ingresos necesarios: {formatMoney(targetResult.revenueNeeded!, currency)}</p>
          <p>Diferencia frente al punto de equilibrio: {targetResult.differenceFromBreakEvenUnits!.toFixed(2)} unidades</p>
        </div>
      ) : null}

      {state.mode === "mix" && mixResult.ok ? (
        <div aria-live="polite" className="space-y-3 rounded-lg border p-4 text-sm">
          <p>
            Punto de equilibrio total: <strong>{mixResult.totalBreakEvenUnits!.toFixed(2)} unidades</strong> ({formatMoney(mixResult.totalBreakEvenRevenueMinor!, currency)})
          </p>
          {mixResult.perProduct ? (
            <AccessibleChart
              title="Unidades de equilibrio por producto"
              type="bar"
              series={[{ name: "Unidades", color: "#3b82f6", points: mixResult.perProduct.map((p) => ({ label: p.name || "Sin nombre", value: Number(p.breakEvenUnits.toFixed(2)) })) }]}
            />
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <CopyButton text={summaryText()} label="Copiar resumen" />
        <Button type="button" variant="outline" onClick={() => downloadTextFile("punto-equilibrio.csv", csv, "text/csv;charset=utf-8")} disabled={!csv}>
          Descargar CSV
        </Button>
        <Button type="button" variant="outline" onClick={() => downloadTextFile("punto-equilibrio.txt", summaryText())} disabled={!summaryText()}>
          Descargar informe
        </Button>
        <Button type="button" variant="outline" onClick={handleExportJson}>
          Exportar JSON
        </Button>
        <ResetButton onReset={() => setState(defaultState())} />
      </div>

      <FileUploadZone accept="application/json" onFilesSelected={handleImportJson} label="Importar un escenario guardado previamente" hint="" />
    </div>
  );
}
