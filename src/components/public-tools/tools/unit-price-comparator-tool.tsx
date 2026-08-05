"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CopyButton, ResetButton, DownloadButton } from "@/components/public-tools/copy-download-actions";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import { COMMON_CURRENCIES, majorToMinor, minorToMajor, formatMoney } from "@/lib/public-tools/business/invoice";
import { UNIT_CATEGORIES, type UnitCategoryId } from "@/lib/public-tools/utilities/units";
import { calculateUnitPrices, type UnitPriceProductInput } from "@/lib/public-tools/commerce/unit-price";
import { buildCsv, downloadTextFile } from "@/lib/public-tools/csv-export";
import { buildDocumentEnvelope, parseDocumentEnvelope } from "@/lib/public-tools/documents/json-schema";
import { DOCUMENT_LIMITS } from "@/lib/public-tools/documents/limits";

const TOOL_ID = "comparador-precio-unidad";
const COMPARABLE_CATEGORIES = UNIT_CATEGORIES.filter((c) => c.id !== "temperatura");

function createProduct(unitId: string): UnitPriceProductInput {
  return { id: `up-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: "", finalPriceMinor: 0, packageQuantity: 1, unitId, packagesCount: 1, usablePercent: 100 };
}

export function UnitPriceComparatorTool() {
  const [currency, setCurrency] = useState("EUR");
  const [categoryId, setCategoryId] = useState<UnitCategoryId | "count">("masa");
  const [products, setProducts] = useState<UnitPriceProductInput[]>([{ ...createProduct("g"), name: "Producto A" }, { ...createProduct("g"), name: "Producto B" }]);
  const [targetQuantityRaw, setTargetQuantityRaw] = useState("");
  const [error, setError] = useState<string | null>(null);

  const category = COMPARABLE_CATEGORIES.find((c) => c.id === categoryId);
  const availableUnits = categoryId === "count" ? [{ id: "unit", label: "Unidad" }] : (category?.units ?? []);

  function updateProduct(id: string, p: Partial<UnitPriceProductInput>) {
    setProducts((prev) => prev.map((prod) => (prod.id === id ? { ...prod, ...p } : prod)));
  }

  const result = calculateUnitPrices({ categoryId, products, targetQuantity: targetQuantityRaw ? Number(targetQuantityRaw) : undefined });

  const summary = result.ok
    ? result
        .products!.map((p) => `${p.rank}. ${p.name || "Sin nombre"}${p.isBestValue ? " (mejor valor)" : ""}: ${formatMoney(majorToMinor(p.pricePerUsableBaseUnitMinor, currency), currency)}/${result.baseUnitLabel}`)
        .join("\n")
    : "";

  const csv = result.ok
    ? buildCsv(
        ["Producto", "Ranking", "Precio por unidad base", "Diferencia vs. mejor"],
        result.products!.map((p) => [p.name, String(p.rank), minorToMajor(majorToMinor(p.pricePerUsableBaseUnitMinor, currency), currency).toFixed(4), minorToMajor(majorToMinor(p.savingsVsBestPerBaseUnitMinor, currency), currency).toFixed(4)])
      )
    : "";

  interface StoredState {
    currency: string;
    categoryId: UnitCategoryId | "count";
    products: UnitPriceProductInput[];
    targetQuantityRaw: string;
  }
  function handleExportJson() {
    const state: StoredState = { currency, categoryId, products, targetQuantityRaw };
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
      setCurrency(parsed.data.currency);
      setCategoryId(parsed.data.categoryId);
      setProducts(parsed.data.products);
      setTargetQuantityRaw(parsed.data.targetQuantityRaw);
      setError(null);
    });
  }

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">Los datos se procesan en tu dispositivo y no se envían al servidor.</p>
      <p className="text-xs text-muted-foreground">La opción más barata por unidad no es necesariamente la de mejor calidad.</p>

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <Label htmlFor="up-currency" className="mb-1">
            Moneda
          </Label>
          <Select value={currency} onValueChange={(v) => setCurrency(v as string)}>
            <SelectTrigger id="up-currency" className="w-32">
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
          <Label htmlFor="up-category" className="mb-1">
            Tipo de cantidad
          </Label>
          <Select
            value={categoryId}
            onValueChange={(v) => {
              const newCategoryId = v as UnitCategoryId | "count";
              setCategoryId(newCategoryId);
              const defaultUnit = newCategoryId === "count" ? "unit" : (COMPARABLE_CATEGORIES.find((c) => c.id === newCategoryId)?.units[0]?.id ?? "");
              setProducts((prev) => prev.map((p) => ({ ...p, unitId: defaultUnit })));
            }}
          >
            <SelectTrigger id="up-category" className="w-56">
              <SelectValue>{categoryId === "count" ? "Cantidad (unidades)" : (COMPARABLE_CATEGORIES.find((c) => c.id === categoryId)?.label ?? categoryId)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="count">Cantidad (unidades)</SelectItem>
              {COMPARABLE_CATEGORIES.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="up-target" className="mb-1">
            Cantidad objetivo para ahorro (opcional)
          </Label>
          <Input id="up-target" type="number" min={0} step="0.01" value={targetQuantityRaw} onChange={(e) => setTargetQuantityRaw(e.target.value)} className="w-40" />
        </div>
      </div>

      <div className="space-y-3">
        {products.map((p) => (
          <div key={p.id} className="grid gap-2 rounded-md border p-2 sm:grid-cols-6">
            <Input placeholder="Nombre" value={p.name} onChange={(e) => updateProduct(p.id, { name: e.target.value })} className="sm:col-span-2" />
            <Input type="number" min={0} step="0.01" placeholder="Precio final pagado" value={minorToMajor(p.finalPriceMinor, currency)} onChange={(e) => updateProduct(p.id, { finalPriceMinor: majorToMinor(Number(e.target.value), currency) })} />
            <Input type="number" min={0} step="0.01" placeholder="Cantidad/paquete" value={p.packageQuantity} onChange={(e) => updateProduct(p.id, { packageQuantity: Number(e.target.value) })} />
            <Select value={p.unitId} onValueChange={(v) => updateProduct(p.id, { unitId: v as string })}>
              <SelectTrigger>
                <SelectValue>{availableUnits.find((u) => u.id === p.unitId)?.label ?? p.unitId}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {availableUnits.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Input type="number" min={1} step="1" placeholder="Nº paquetes" value={p.packagesCount} onChange={(e) => updateProduct(p.id, { packagesCount: Number(e.target.value) })} />
              <Button type="button" variant="ghost" size="sm" onClick={() => setProducts((prev) => prev.filter((prod) => prod.id !== p.id))}>
                Eliminar
              </Button>
            </div>
            <div className="sm:col-span-6">
              <Label htmlFor={`up-usable-${p.id}`} className="mb-1 text-xs">
                Contenido utilizable (%, opcional — deja 100 si no aplica)
              </Label>
              <Input id={`up-usable-${p.id}`} type="number" min={0} max={100} step="1" value={p.usablePercent} onChange={(e) => updateProduct(p.id, { usablePercent: Number(e.target.value) })} className="max-w-[10rem]" />
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setProducts((prev) => (prev.length < DOCUMENT_LIMITS.unitPrice.maxProducts ? [...prev, createProduct(availableUnits[0]?.id ?? "g")] : prev))}>
          Añadir producto
        </Button>
      </div>

      {!result.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {result.error}
        </p>
      ) : null}

      {result.ok ? (
        <div aria-live="polite" className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th scope="col" className="px-3 py-2 text-left">
                  Ranking
                </th>
                <th scope="col" className="px-3 py-2 text-left">
                  Producto
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  Precio por {result.baseUnitLabel}
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  Diferencia vs. mejor
                </th>
                {targetQuantityRaw ? (
                  <th scope="col" className="px-3 py-2 text-right">
                    Coste extra para {targetQuantityRaw} {result.baseUnitLabel}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {result.products!.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="px-3 py-2">{p.rank}</td>
                  <td className="px-3 py-2">
                    {p.name || "Sin nombre"} {p.isBestValue ? <span className="text-xs text-green-700 dark:text-green-400">(mejor valor)</span> : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(majorToMinor(p.pricePerUsableBaseUnitMinor, currency), currency)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.isBestValue ? "—" : formatMoney(majorToMinor(p.savingsVsBestPerBaseUnitMinor, currency), currency)}</td>
                  {targetQuantityRaw ? <td className="px-3 py-2 text-right tabular-nums">{p.savingsForTargetQuantityMinor !== undefined ? formatMoney(majorToMinor(p.savingsForTargetQuantityMinor, currency), currency) : "—"}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <CopyButton text={summary} label="Copiar resumen" />
        <DownloadButton content={csv} filename="comparador-precio-unidad.csv" mimeType="text/csv;charset=utf-8" label="Descargar CSV" />
        <Button type="button" variant="outline" onClick={handleExportJson}>
          Exportar JSON
        </Button>
        <ResetButton
          onReset={() => {
            setCurrency("EUR");
            setCategoryId("masa");
            setProducts([{ ...createProduct("g"), name: "Producto A" }, { ...createProduct("g"), name: "Producto B" }]);
            setTargetQuantityRaw("");
            setError(null);
          }}
        />
      </div>

      <FileUploadZone accept="application/json" onFilesSelected={handleImportJson} label="Importar una comparación guardada previamente" hint="" />
    </div>
  );
}
