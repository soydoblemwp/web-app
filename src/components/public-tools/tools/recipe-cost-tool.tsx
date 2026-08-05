"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CopyButton, ResetButton, DownloadButton } from "@/components/public-tools/copy-download-actions";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import { RECIPE_UNITS } from "@/lib/public-tools/cooking/recipe-units";
import { createCostIngredient, calculateRecipeCost, type CostIngredient } from "@/lib/public-tools/cooking/recipe-cost";
import { COMMON_CURRENCIES, majorToMinor, minorToMajor, formatMoney } from "@/lib/public-tools/business/invoice";
import { buildCsv, downloadTextFile } from "@/lib/public-tools/csv-export";
import { parseCsv } from "@/lib/performance/csv";
import { buildDocumentEnvelope, parseDocumentEnvelope } from "@/lib/public-tools/documents/json-schema";
import { DOCUMENT_LIMITS } from "@/lib/public-tools/documents/limits";

const TOOL_ID = "calculadora-costo-receta";

interface StoredState {
  currency: string;
  ingredients: CostIngredient[];
  servings: number;
  additionalDirectCosts: number;
  pricingMode: "none" | "price" | "margin";
  targetSellingPrice: number;
  targetMarginPercent: number;
}

function defaultState(): StoredState {
  return {
    currency: "EUR",
    ingredients: [
      { ...createCostIngredient(), name: "Harina", packagePriceMinor: 150, packageSize: 1000, packageUnitId: "g", usedQuantity: 500, usedUnitId: "g", usableYieldPercent: 100 },
      { ...createCostIngredient(), name: "Huevos", packagePriceMinor: 250, packageSize: 12, packageUnitId: "unit", usedQuantity: 3, usedUnitId: "unit", usableYieldPercent: 100 },
    ],
    servings: 8,
    additionalDirectCosts: 100,
    pricingMode: "margin",
    targetSellingPrice: 500,
    targetMarginPercent: 40,
  };
}

export function RecipeCostTool() {
  const [state, setState] = useState<StoredState>(defaultState());
  const [error, setError] = useState<string | null>(null);
  const { currency } = state;

  function patch(p: Partial<StoredState>) {
    setState((prev) => ({ ...prev, ...p }));
  }
  function updateIngredient(id: string, p: Partial<CostIngredient>) {
    setState((prev) => ({ ...prev, ingredients: prev.ingredients.map((ing) => (ing.id === id ? { ...ing, ...p } : ing)) }));
  }

  const result = calculateRecipeCost({
    ingredients: state.ingredients,
    servings: state.servings,
    additionalDirectCostsMinor: majorToMinor(state.additionalDirectCosts, currency),
    targetSellingPriceMinor: state.pricingMode === "price" ? majorToMinor(state.targetSellingPrice, currency) : undefined,
    targetMarginPercent: state.pricingMode === "margin" ? state.targetMarginPercent : undefined,
  });

  function summaryText(): string {
    if (!result.ok) return "";
    const lines = [`Coste total del lote: ${formatMoney(result.totalBatchCostMinor!, currency)}`, `Coste por porción: ${formatMoney(result.costPerServingMinor!, currency)}`];
    if (result.suggestedPriceMinor !== undefined) lines.push(`Precio sugerido: ${formatMoney(result.suggestedPriceMinor, currency)}`);
    if (result.profitPerServingMinor !== undefined) lines.push(`Beneficio estimado por porción: ${formatMoney(result.profitPerServingMinor, currency)}`);
    lines.push("", ...(result.perIngredient ?? []).map((p) => `${p.name || "Sin nombre"}: ${formatMoney(p.usedCostMinor, currency)} (${p.percentOfBatchCost.toFixed(1)}%)`));
    return lines.join("\n");
  }

  const csv = result.ok && result.perIngredient ? buildCsv(["Ingrediente", "Coste usado", "Coste desperdiciado", "% del lote"], result.perIngredient.map((p) => [p.name, minorToMajor(p.usedCostMinor, currency).toFixed(2), minorToMajor(p.wastedCostMinor, currency).toFixed(2), p.percentOfBatchCost.toFixed(2)])) : "";

  function handleCsvImport(files: File[]) {
    const file = files[0];
    if (!file) return;
    file.text().then((text) => {
      const { headers, rows } = parseCsv(text);
      const nameIdx = headers.indexOf("Ingrediente");
      const priceIdx = headers.indexOf("Precio del paquete");
      const sizeIdx = headers.indexOf("Tamaño del paquete");
      if (nameIdx === -1 || priceIdx === -1 || sizeIdx === -1) {
        setError('El CSV debe incluir "Ingrediente", "Precio del paquete" y "Tamaño del paquete".');
        return;
      }
      const imported: CostIngredient[] = rows.slice(0, DOCUMENT_LIMITS.recipe.maxIngredients).map((row) => ({
        ...createCostIngredient(),
        name: row[nameIdx] ?? "",
        packagePriceMinor: majorToMinor(Number(row[priceIdx]) || 0, currency),
        packageSize: Number(row[sizeIdx]) || 1,
      }));
      setError(null);
      patch({ ingredients: imported });
    });
  }

  function handleExportJson() {
    downloadTextFile(`${TOOL_ID}.json`, JSON.stringify(buildDocumentEnvelope(TOOL_ID, state), null, 2), "application/json;charset=utf-8");
  }
  function handleImportJson(files: File[]) {
    const file = files[0];
    if (!file) return;
    file.text().then((text) => {
      const parsed = parseDocumentEnvelope<StoredState>(text, TOOL_ID);
      if (!parsed.ok || !parsed.data) {
        setError(parsed.error ?? "No se pudo importar el archivo.");
        return;
      }
      setError(null);
      setState(parsed.data);
    });
  }

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">Los datos se procesan en tu dispositivo y no se envían al servidor.</p>
      <p className="text-xs text-muted-foreground">Los precios y rendimientos son los que introduzcas. La herramienta no consulta precios actuales de supermercado ni calcula información nutricional.</p>

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <Label htmlFor="rc-currency" className="mb-1">
            Moneda
          </Label>
          <Select value={currency} onValueChange={(v) => patch({ currency: v as string })}>
            <SelectTrigger id="rc-currency" className="w-32">
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
          <Label htmlFor="rc-servings" className="mb-1">
            Porciones
          </Label>
          <Input id="rc-servings" type="number" min={1} step="1" value={state.servings} onChange={(e) => patch({ servings: Number(e.target.value) })} className="w-32" />
        </div>
        <div>
          <Label htmlFor="rc-additional" className="mb-1">
            Costes directos adicionales (embalaje, mano de obra, energía)
          </Label>
          <Input id="rc-additional" type="number" min={0} step="0.01" value={state.additionalDirectCosts} onChange={(e) => patch({ additionalDirectCosts: Number(e.target.value) })} className="w-48" />
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Ingredientes</h2>
        {state.ingredients.map((ing) => (
          <div key={ing.id} className="grid gap-2 rounded-md border p-2 sm:grid-cols-4 lg:grid-cols-7">
            <Input placeholder="Nombre" value={ing.name} onChange={(e) => updateIngredient(ing.id, { name: e.target.value })} />
            <Input type="number" min={0} step="0.01" placeholder="Precio paquete" value={minorToMajor(ing.packagePriceMinor, currency)} onChange={(e) => updateIngredient(ing.id, { packagePriceMinor: majorToMinor(Number(e.target.value), currency) })} />
            <Input type="number" min={0.01} step="0.01" placeholder="Tamaño paquete" value={ing.packageSize} onChange={(e) => updateIngredient(ing.id, { packageSize: Number(e.target.value) })} />
            <Select value={ing.packageUnitId} onValueChange={(v) => updateIngredient(ing.id, { packageUnitId: v as string })}>
              <SelectTrigger>
                <SelectValue>{RECIPE_UNITS.find((u) => u.id === ing.packageUnitId)?.label ?? ing.packageUnitId}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {RECIPE_UNITS.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="number" min={0} step="0.01" placeholder="Cantidad usada" value={ing.usedQuantity} onChange={(e) => updateIngredient(ing.id, { usedQuantity: Number(e.target.value) })} />
            <Select value={ing.usedUnitId} onValueChange={(v) => updateIngredient(ing.id, { usedUnitId: v as string })}>
              <SelectTrigger>
                <SelectValue>{RECIPE_UNITS.find((u) => u.id === ing.usedUnitId)?.label ?? ing.usedUnitId}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {RECIPE_UNITS.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Input type="number" min={0} max={100} step="1" placeholder="% rendimiento" value={ing.usableYieldPercent} onChange={(e) => updateIngredient(ing.id, { usableYieldPercent: Number(e.target.value) })} />
              <Button type="button" variant="ghost" size="sm" onClick={() => setState((prev) => ({ ...prev, ingredients: prev.ingredients.filter((i) => i.id !== ing.id) }))}>
                Eliminar
              </Button>
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setState((prev) => (prev.ingredients.length < DOCUMENT_LIMITS.recipe.maxIngredients ? { ...prev, ingredients: [...prev.ingredients, createCostIngredient()] } : prev))}>
          Añadir ingrediente
        </Button>
      </div>

      <div className="space-y-2">
        <div className="flex gap-2">
          <Button type="button" variant={state.pricingMode === "none" ? "default" : "outline"} size="sm" onClick={() => patch({ pricingMode: "none" })}>
            Sin precio de venta
          </Button>
          <Button type="button" variant={state.pricingMode === "price" ? "default" : "outline"} size="sm" onClick={() => patch({ pricingMode: "price" })}>
            Precio de venta objetivo
          </Button>
          <Button type="button" variant={state.pricingMode === "margin" ? "default" : "outline"} size="sm" onClick={() => patch({ pricingMode: "margin" })}>
            Margen objetivo
          </Button>
        </div>
        {state.pricingMode === "price" ? (
          <div>
            <Label htmlFor="rc-target-price" className="mb-1">
              Precio de venta por porción
            </Label>
            <Input id="rc-target-price" type="number" min={0} step="0.01" value={state.targetSellingPrice} onChange={(e) => patch({ targetSellingPrice: Number(e.target.value) })} className="max-w-xs" />
          </div>
        ) : null}
        {state.pricingMode === "margin" ? (
          <div>
            <Label htmlFor="rc-target-margin" className="mb-1">
              Margen objetivo (%)
            </Label>
            <Input id="rc-target-margin" type="number" min={0} max={99} step="1" value={state.targetMarginPercent} onChange={(e) => patch({ targetMarginPercent: Number(e.target.value) })} className="max-w-xs" />
          </div>
        ) : null}
      </div>

      {!result.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {result.error}
        </p>
      ) : null}

      {result.ok ? (
        <div aria-live="polite" className="space-y-3 rounded-lg border p-4 text-sm">
          <div className="grid gap-2 sm:grid-cols-2">
            <p>Coste total del lote: {formatMoney(result.totalBatchCostMinor!, currency)}</p>
            <p>
              Coste por porción: <strong>{formatMoney(result.costPerServingMinor!, currency)}</strong>
            </p>
            {result.suggestedPriceMinor !== undefined ? <p>Precio sugerido: {formatMoney(result.suggestedPriceMinor, currency)}</p> : null}
            {result.profitPerServingMinor !== undefined ? <p>Beneficio estimado por porción: {formatMoney(result.profitPerServingMinor, currency)}</p> : null}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th scope="col" className="px-2 py-1 text-left">
                    Ingrediente
                  </th>
                  <th scope="col" className="px-2 py-1 text-right">
                    Coste usado
                  </th>
                  <th scope="col" className="px-2 py-1 text-right">
                    % del lote
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.perIngredient!.map((p) => (
                  <tr key={p.id} className={`border-b last:border-0 ${p.id === result.mostExpensiveIngredientId ? "bg-amber-50 dark:bg-amber-950/20" : ""}`}>
                    <td className="px-2 py-1">
                      {p.name || "Sin nombre"} {p.id === result.mostExpensiveIngredientId ? "(más costoso)" : ""}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">{formatMoney(p.usedCostMinor, currency)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{p.percentOfBatchCost.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <CopyButton text={summaryText()} label="Copiar" />
        <DownloadButton content={csv} filename="costo-receta.csv" mimeType="text/csv;charset=utf-8" label="Descargar CSV" />
        <Button type="button" variant="outline" onClick={handleExportJson}>
          Exportar JSON
        </Button>
        <Button type="button" variant="outline" onClick={() => window.print()}>
          Imprimir
        </Button>
        <ResetButton
          onReset={() => {
            setState(defaultState());
            setError(null);
          }}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FileUploadZone accept=".csv,text/csv" onFilesSelected={handleCsvImport} label="Importar ingredientes desde CSV" hint="" />
        <FileUploadZone accept="application/json" onFilesSelected={handleImportJson} label="Importar una receta guardada previamente" hint="" />
      </div>
    </div>
  );
}
