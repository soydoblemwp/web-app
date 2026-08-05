"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CopyButton, ResetButton, DownloadButton } from "@/components/public-tools/copy-download-actions";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import { RECIPE_UNITS, toFriendlyFraction } from "@/lib/public-tools/cooking/recipe-units";
import { createRecipeIngredient, scaleByMultiplier, scaleByServings, scaleByPanSize, normalizeToGramsWherePossible, type RecipeIngredient, type PanShape } from "@/lib/public-tools/cooking/recipe-scaling";
import { calculateBakersPercentages, recalculateForTotalWeight } from "@/lib/public-tools/cooking/bakers-percentage";
import { buildCsv, downloadTextFile } from "@/lib/public-tools/csv-export";
import { buildDocumentEnvelope, parseDocumentEnvelope } from "@/lib/public-tools/documents/json-schema";
import { DOCUMENT_LIMITS } from "@/lib/public-tools/documents/limits";

const TOOL_ID = "escalar-recetas";
type Mode = "multiplier" | "servings" | "pan" | "bakers";
const PAN_SHAPE_LABELS: Record<PanShape, string> = { circular: "Circular", rectangular: "Rectangular", square: "Cuadrado" };

interface StoredState {
  mode: Mode;
  ingredients: RecipeIngredient[];
  multiplier: number;
  originalServings: number;
  targetServings: number;
  panShape: PanShape;
  originalPanValue1: number;
  originalPanValue2: number;
  targetPanValue1: number;
  targetPanValue2: number;
  bakersBaseId: string;
  bakersTargetTotalGrams: number;
}

function defaultState(): StoredState {
  const flour = { ...createRecipeIngredient(), name: "Harina", quantity: 500, unitId: "g" };
  const water = { ...createRecipeIngredient(), name: "Agua", quantity: 325, unitId: "g" };
  const salt = { ...createRecipeIngredient(), name: "Sal", quantity: 10, unitId: "g" };
  const yeast = { ...createRecipeIngredient(), name: "Levadura", quantity: 5, unitId: "g" };
  return {
    mode: "servings",
    ingredients: [flour, water, salt, yeast],
    multiplier: 1.5,
    originalServings: 4,
    targetServings: 6,
    panShape: "circular",
    originalPanValue1: 20,
    originalPanValue2: 0,
    targetPanValue1: 25,
    targetPanValue2: 0,
    bakersBaseId: flour.id,
    bakersTargetTotalGrams: 1000,
  };
}

export function RecipeScalerTool() {
  const [state, setState] = useState<StoredState>(defaultState());
  const [error, setError] = useState<string | null>(null);

  function patch(p: Partial<StoredState>) {
    setState((prev) => ({ ...prev, ...p }));
  }
  function updateIngredient(id: string, p: Partial<RecipeIngredient>) {
    setState((prev) => ({ ...prev, ingredients: prev.ingredients.map((ing) => (ing.id === id ? { ...ing, ...p } : ing)) }));
  }

  const scaleResult =
    state.mode === "multiplier"
      ? scaleByMultiplier(state.ingredients, state.multiplier)
      : state.mode === "servings"
        ? scaleByServings(state.ingredients, state.originalServings, state.targetServings)
        : state.mode === "pan"
          ? scaleByPanSize(
              state.ingredients,
              state.panShape === "rectangular" ? { shape: "rectangular", width: state.originalPanValue1, length: state.originalPanValue2 } : state.panShape === "circular" ? { shape: "circular", diameter: state.originalPanValue1 } : { shape: "square", side: state.originalPanValue1 },
              state.panShape === "rectangular" ? { shape: "rectangular", width: state.targetPanValue1, length: state.targetPanValue2 } : state.panShape === "circular" ? { shape: "circular", diameter: state.targetPanValue1 } : { shape: "square", side: state.targetPanValue1 }
            )
          : { ok: false as const, error: "" };

  const bakersResult = calculateBakersPercentages(state.ingredients, state.bakersBaseId);
  const bakersRecalculated = bakersResult.ok && bakersResult.rows ? recalculateForTotalWeight(bakersResult.rows, state.bakersTargetTotalGrams) : null;

  const normalized = state.mode !== "bakers" && scaleResult.ok && scaleResult.ingredients ? normalizeToGramsWherePossible(scaleResult.ingredients) : [];

  function summaryText(): string {
    if (state.mode === "bakers") {
      if (!bakersResult.ok || !bakersResult.rows) return "";
      return bakersResult.rows.map((r) => `${r.name || "Sin nombre"}: ${r.percent.toFixed(1)}% (${r.grams.toFixed(1)} g)`).join("\n");
    }
    if (!scaleResult.ok || !scaleResult.ingredients) return "";
    return scaleResult.ingredients.map((ing) => `${ing.name || "Sin nombre"}: ${toFriendlyFraction(ing.scaledQuantity)} ${RECIPE_UNITS.find((u) => u.id === ing.unitId)?.label ?? ing.unitId}`).join("\n");
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
    state.mode === "bakers" && bakersResult.ok && bakersResult.rows
      ? buildCsv(["Ingrediente", "Gramos", "Porcentaje de panadería"], bakersResult.rows.map((r) => [r.name, r.grams.toFixed(1), r.percent.toFixed(2)]))
      : scaleResult.ok && scaleResult.ingredients
        ? buildCsv(["Ingrediente", "Cantidad original", "Cantidad escalada", "Unidad"], scaleResult.ingredients.map((ing) => [ing.name, String(ing.quantity), ing.scaledQuantity.toFixed(3), RECIPE_UNITS.find((u) => u.id === ing.unitId)?.label ?? ing.unitId]))
        : "";

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">Los datos se procesan en tu dispositivo y no se envían al servidor.</p>
      <p className="text-xs text-muted-foreground">No ofrece recomendaciones nutricionales; solo escala las cantidades que introduzcas.</p>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant={state.mode === "servings" ? "default" : "outline"} size="sm" onClick={() => patch({ mode: "servings" })}>
          Por porciones
        </Button>
        <Button type="button" variant={state.mode === "multiplier" ? "default" : "outline"} size="sm" onClick={() => patch({ mode: "multiplier" })}>
          Multiplicador directo
        </Button>
        <Button type="button" variant={state.mode === "pan" ? "default" : "outline"} size="sm" onClick={() => patch({ mode: "pan" })}>
          Tamaño de molde
        </Button>
        <Button type="button" variant={state.mode === "bakers" ? "default" : "outline"} size="sm" onClick={() => patch({ mode: "bakers" })}>
          Porcentaje de panadería
        </Button>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Ingredientes</h2>
        {state.ingredients.map((ing) => (
          <div key={ing.id} className="grid gap-2 rounded-md border p-2 sm:grid-cols-5">
            <Input placeholder="Nombre" value={ing.name} onChange={(e) => updateIngredient(ing.id, { name: e.target.value })} />
            <Input type="number" min={0} step="0.01" placeholder="Cantidad" value={ing.quantity} onChange={(e) => updateIngredient(ing.id, { quantity: Number(e.target.value) })} />
            <Select value={ing.unitId} onValueChange={(v) => updateIngredient(ing.id, { unitId: v as string })}>
              <SelectTrigger>
                <SelectValue>{RECIPE_UNITS.find((u) => u.id === ing.unitId)?.label ?? ing.unitId}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {RECIPE_UNITS.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="number" min={0} step="0.001" placeholder="Densidad g/ml (opcional)" value={ing.densityGramsPerMl ?? ""} onChange={(e) => updateIngredient(ing.id, { densityGramsPerMl: e.target.value ? Number(e.target.value) : undefined })} />
            <Button type="button" variant="ghost" size="sm" onClick={() => setState((prev) => ({ ...prev, ingredients: prev.ingredients.filter((i) => i.id !== ing.id) }))}>
              Eliminar
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setState((prev) => (prev.ingredients.length < DOCUMENT_LIMITS.recipe.maxIngredients ? { ...prev, ingredients: [...prev.ingredients, createRecipeIngredient()] } : prev))}>
          Añadir ingrediente
        </Button>
      </div>

      {state.mode === "servings" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="rs-original-servings" className="mb-1">
              Porciones originales
            </Label>
            <Input id="rs-original-servings" type="number" min={0} step="0.5" value={state.originalServings} onChange={(e) => patch({ originalServings: Number(e.target.value) })} />
          </div>
          <div>
            <Label htmlFor="rs-target-servings" className="mb-1">
              Porciones objetivo
            </Label>
            <Input id="rs-target-servings" type="number" min={0} step="0.5" value={state.targetServings} onChange={(e) => patch({ targetServings: Number(e.target.value) })} />
          </div>
        </div>
      ) : null}

      {state.mode === "multiplier" ? (
        <div>
          <Label htmlFor="rs-multiplier" className="mb-1">
            Multiplicador
          </Label>
          <Input id="rs-multiplier" type="number" min={0} step="0.1" value={state.multiplier} onChange={(e) => patch({ multiplier: Number(e.target.value) })} className="max-w-xs" />
        </div>
      ) : null}

      {state.mode === "pan" ? (
        <div className="space-y-3">
          <Select value={state.panShape} onValueChange={(v) => patch({ panShape: v as PanShape })}>
            <SelectTrigger className="w-56">
              <SelectValue>{PAN_SHAPE_LABELS[state.panShape]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="circular">Circular</SelectItem>
              <SelectItem value="rectangular">Rectangular</SelectItem>
              <SelectItem value="square">Cuadrado</SelectItem>
            </SelectContent>
          </Select>
          <div className="grid gap-4 sm:grid-cols-2">
            <fieldset className="space-y-2 rounded-md border p-2">
              <legend className="text-xs font-medium">Molde original</legend>
              <Input type="number" min={0} step="0.1" placeholder={state.panShape === "rectangular" ? "Ancho" : state.panShape === "circular" ? "Diámetro" : "Lado"} value={state.originalPanValue1} onChange={(e) => patch({ originalPanValue1: Number(e.target.value) })} />
              {state.panShape === "rectangular" ? <Input type="number" min={0} step="0.1" placeholder="Largo" value={state.originalPanValue2} onChange={(e) => patch({ originalPanValue2: Number(e.target.value) })} /> : null}
            </fieldset>
            <fieldset className="space-y-2 rounded-md border p-2">
              <legend className="text-xs font-medium">Molde objetivo</legend>
              <Input type="number" min={0} step="0.1" placeholder={state.panShape === "rectangular" ? "Ancho" : state.panShape === "circular" ? "Diámetro" : "Lado"} value={state.targetPanValue1} onChange={(e) => patch({ targetPanValue1: Number(e.target.value) })} />
              {state.panShape === "rectangular" ? <Input type="number" min={0} step="0.1" placeholder="Largo" value={state.targetPanValue2} onChange={(e) => patch({ targetPanValue2: Number(e.target.value) })} /> : null}
            </fieldset>
          </div>
        </div>
      ) : null}

      {state.mode === "bakers" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="rs-bakers-base" className="mb-1">
              Ingrediente base (normalmente la harina)
            </Label>
            <Select value={state.bakersBaseId} onValueChange={(v) => patch({ bakersBaseId: v as string })}>
              <SelectTrigger id="rs-bakers-base" className="w-full">
                <SelectValue>{state.ingredients.find((ing) => ing.id === state.bakersBaseId)?.name || "(sin nombre)"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {state.ingredients.map((ing) => (
                  <SelectItem key={ing.id} value={ing.id}>
                    {ing.name || "(sin nombre)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="rs-bakers-total" className="mb-1">
              Peso total objetivo (g, opcional)
            </Label>
            <Input id="rs-bakers-total" type="number" min={0} step="1" value={state.bakersTargetTotalGrams} onChange={(e) => patch({ bakersTargetTotalGrams: Number(e.target.value) })} />
          </div>
        </div>
      ) : null}

      {state.mode !== "bakers" && !scaleResult.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {scaleResult.error}
        </p>
      ) : null}
      {state.mode === "bakers" && !bakersResult.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {bakersResult.error}
        </p>
      ) : null}

      {state.mode !== "bakers" && scaleResult.ok && scaleResult.ingredients ? (
        <div aria-live="polite" className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th scope="col" className="px-3 py-2 text-left">
                  Ingrediente
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  Cantidad escalada
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  ≈ Gramos
                </th>
              </tr>
            </thead>
            <tbody>
              {scaleResult.ingredients.map((ing, i) => (
                <tr key={ing.id} className="border-b last:border-0">
                  <td className="px-3 py-2">{ing.name || "Sin nombre"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {toFriendlyFraction(ing.scaledQuantity)} {RECIPE_UNITS.find((u) => u.id === ing.unitId)?.label ?? ing.unitId}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{normalized[i]?.grams !== null && normalized[i]?.grams !== undefined ? normalized[i]!.grams!.toFixed(1) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {state.mode === "bakers" && bakersResult.ok && bakersResult.rows ? (
        <div aria-live="polite" className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th scope="col" className="px-3 py-2 text-left">
                  Ingrediente
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  Gramos
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  % de panadería
                </th>
                {bakersRecalculated?.ok && bakersRecalculated.rows ? (
                  <th scope="col" className="px-3 py-2 text-right">
                    Gramos para {state.bakersTargetTotalGrams} g totales
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {bakersResult.rows.map((r, i) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-3 py-2">{r.name || "Sin nombre"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.grams.toFixed(1)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.percent.toFixed(1)}%</td>
                  {bakersRecalculated?.ok && bakersRecalculated.rows ? <td className="px-3 py-2 text-right tabular-nums">{bakersRecalculated.rows[i]?.grams.toFixed(1)}</td> : null}
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
        <CopyButton text={summaryText()} label="Copiar" />
        <DownloadButton content={csv} filename="receta-escalada.csv" mimeType="text/csv;charset=utf-8" label="Descargar CSV" />
        <Button type="button" variant="outline" onClick={() => downloadTextFile("receta-escalada.txt", summaryText())} disabled={!summaryText()}>
          Descargar TXT
        </Button>
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

      <FileUploadZone accept="application/json" onFilesSelected={handleImportJson} label="Importar una receta guardada previamente" hint="" />
    </div>
  );
}
