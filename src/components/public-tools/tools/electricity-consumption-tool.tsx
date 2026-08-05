"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CopyButton, ResetButton, DownloadButton } from "@/components/public-tools/copy-download-actions";
import { AccessibleChart } from "@/components/public-tools/accessible-chart";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import { COMMON_CURRENCIES, majorToMinor, minorToMajor, formatMoney } from "@/lib/public-tools/business/invoice";
import { createAppliance, calculateApplianceEnergy, applyTariff, calculateMaxHoursForTarget, type ApplianceInput, type PowerUnit, type TariffBand, type TariffInput } from "@/lib/public-tools/household/electricity";
import { buildCsv, downloadTextFile } from "@/lib/public-tools/csv-export";
import { buildDocumentEnvelope, parseDocumentEnvelope } from "@/lib/public-tools/documents/json-schema";
import { DOCUMENT_LIMITS } from "@/lib/public-tools/documents/limits";

const TOOL_ID = "calculadora-consumo-electrico";

function createBand(): TariffBand {
  return { id: `band-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, label: "", hoursPerDay: 0, pricePerKwhMinor: 0 };
}

interface StoredState {
  currency: string;
  appliances: ApplianceInput[];
  tariffMode: "flat" | "bands";
  flatPrice: number;
  fixedCharge: number;
  bands: TariffBand[];
  compareEnabled: boolean;
  targetMonthlyCost: number;
}

function defaultState(): StoredState {
  return {
    currency: "EUR",
    appliances: [{ ...createAppliance(), name: "Aire acondicionado", powerValue: 1200, powerUnit: "w", quantity: 1, hoursPerDay: 4, daysPerUse: 30 }],
    tariffMode: "flat",
    flatPrice: 0.15,
    fixedCharge: 0,
    bands: [
      { ...createBand(), label: "Punta", hoursPerDay: 6, pricePerKwhMinor: 25 },
      { ...createBand(), label: "Valle", hoursPerDay: 18, pricePerKwhMinor: 10 },
    ],
    compareEnabled: false,
    targetMonthlyCost: 20,
  };
}

export function ElectricityConsumptionTool() {
  const [state, setState] = useState<StoredState>(defaultState());
  const [error, setError] = useState<string | null>(null);
  const { currency } = state;

  function patch(p: Partial<StoredState>) {
    setState((prev) => ({ ...prev, ...p }));
  }
  function updateAppliance(id: string, p: Partial<ApplianceInput>) {
    setState((prev) => ({ ...prev, appliances: prev.appliances.map((a) => (a.id === id ? { ...a, ...p } : a)) }));
  }
  function updateBand(id: string, p: Partial<TariffBand>) {
    setState((prev) => ({ ...prev, bands: prev.bands.map((b) => (b.id === id ? { ...b, ...p } : b)) }));
  }

  const tariff: TariffInput = {
    mode: state.tariffMode,
    flatPricePerKwhMinor: majorToMinor(state.flatPrice, currency),
    bands: state.bands,
    fixedChargeMinor: majorToMinor(state.fixedCharge, currency),
  };

  const results = state.appliances.map((a) => {
    const energy = calculateApplianceEnergy(a);
    const cost = energy.ok ? applyTariff(energy.dailyTotalKwh!, a.hoursPerDay, tariff) : { ok: false as const, error: energy.error };
    return { appliance: a, energy, cost };
  });

  const totalMonthlyKwh = results.reduce((sum, r) => sum + (r.energy.ok ? r.energy.monthlyKwh! : 0), 0);
  const totalMonthlyCostMinor = results.reduce((sum, r) => sum + (r.cost.ok ? (r.cost.totalCostMinor ?? 0) * (state.appliances.find((a) => a.id === r.appliance.id)?.daysPerUse ?? 30) : 0), 0);

  const firstAppliance = state.appliances[0];
  const maxHoursResult = firstAppliance ? calculateMaxHoursForTarget({ appliance: firstAppliance, tariff, targetMonthlyCostMinor: majorToMinor(state.targetMonthlyCost, currency) }) : null;

  function summaryText(): string {
    const lines = results.map((r) => (r.energy.ok ? `${r.appliance.name || "Sin nombre"}: ${r.energy.monthlyKwh!.toFixed(2)} kWh/mes` : `${r.appliance.name || "Sin nombre"}: ${r.energy.error}`));
    lines.push("", `Consumo mensual total: ${totalMonthlyKwh.toFixed(2)} kWh`, `Coste mensual total: ${formatMoney(totalMonthlyCostMinor, currency)}`);
    if (maxHoursResult?.ok) lines.push(`Horas máximas/día para no superar ${formatMoney(majorToMinor(state.targetMonthlyCost, currency), currency)}/mes: ${maxHoursResult.maxHoursPerDay!.toFixed(2)}`);
    return lines.join("\n");
  }

  const csv = buildCsv(
    ["Aparato", "kWh diarios", "kWh mensuales", "kWh anuales"],
    results.map((r) => [r.appliance.name, r.energy.ok ? r.energy.dailyTotalKwh!.toFixed(3) : "", r.energy.ok ? r.energy.monthlyKwh!.toFixed(2) : "", r.energy.ok ? r.energy.annualKwh!.toFixed(2) : ""])
  );

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
      <p className="text-xs text-muted-foreground">Introduce la potencia indicada por el fabricante y tu tarifa real. Los resultados son estimaciones matemáticas; no se conecta a medidores ni sistemas domésticos.</p>

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <Label htmlFor="ec-currency" className="mb-1">
            Moneda
          </Label>
          <Select value={currency} onValueChange={(v) => patch({ currency: v as string })}>
            <SelectTrigger id="ec-currency" className="w-32">
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
        <Select value={state.tariffMode} onValueChange={(v) => patch({ tariffMode: v as "flat" | "bands" })}>
          <SelectTrigger className="w-56">
            <SelectValue>{state.tariffMode === "flat" ? "Tarifa única" : "Tarifa por franjas horarias"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="flat">Tarifa única</SelectItem>
            <SelectItem value="bands">Tarifa por franjas horarias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {state.tariffMode === "flat" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="ec-flat-price" className="mb-1">
              Precio por kWh
            </Label>
            <Input id="ec-flat-price" type="number" min={0} step="0.0001" value={state.flatPrice} onChange={(e) => patch({ flatPrice: Number(e.target.value) })} />
          </div>
          <div>
            <Label htmlFor="ec-fixed-charge" className="mb-1">
              Cargo fijo mensual (opcional)
            </Label>
            <Input id="ec-fixed-charge" type="number" min={0} step="0.01" value={state.fixedCharge} onChange={(e) => patch({ fixedCharge: Number(e.target.value) })} />
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {state.bands.map((b) => (
            <div key={b.id} className="grid gap-2 rounded-md border p-2 sm:grid-cols-4">
              <Input placeholder="Nombre de franja" value={b.label} onChange={(e) => updateBand(b.id, { label: e.target.value })} />
              <Input type="number" min={0} max={24} step="0.1" placeholder="Horas/día" value={b.hoursPerDay} onChange={(e) => updateBand(b.id, { hoursPerDay: Number(e.target.value) })} />
              <Input type="number" min={0} step="0.0001" placeholder="Precio/kWh" value={minorToMajor(b.pricePerKwhMinor, currency)} onChange={(e) => updateBand(b.id, { pricePerKwhMinor: majorToMinor(Number(e.target.value), currency) })} />
              <Button type="button" variant="ghost" size="sm" onClick={() => setState((prev) => ({ ...prev, bands: prev.bands.filter((band) => band.id !== b.id) }))}>
                Eliminar
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setState((prev) => (prev.bands.length < DOCUMENT_LIMITS.electricity.maxTariffBands ? { ...prev, bands: [...prev.bands, createBand()] } : prev))}>
            Añadir franja
          </Button>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-semibold">Aparatos</h2>
        {state.appliances.map((a) => (
          <div key={a.id} className="space-y-2 rounded-lg border p-3">
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
              <Input placeholder="Nombre" value={a.name} onChange={(e) => updateAppliance(a.id, { name: e.target.value })} />
              <Input type="number" min={0} step="0.1" placeholder="Potencia" value={a.powerValue} onChange={(e) => updateAppliance(a.id, { powerValue: Number(e.target.value) })} />
              <Select value={a.powerUnit} onValueChange={(v) => updateAppliance(a.id, { powerUnit: v as PowerUnit })}>
                <SelectTrigger>
                  <SelectValue>{a.powerUnit === "w" ? "W" : "kW"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="w">W</SelectItem>
                  <SelectItem value="kw">kW</SelectItem>
                </SelectContent>
              </Select>
              <Input type="number" min={1} step="1" placeholder="Cantidad" value={a.quantity} onChange={(e) => updateAppliance(a.id, { quantity: Number(e.target.value) })} />
              <Button type="button" variant="ghost" size="sm" onClick={() => setState((prev) => ({ ...prev, appliances: prev.appliances.filter((app) => app.id !== a.id) }))}>
                Eliminar
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div>
                <Label htmlFor={`ec-hours-${a.id}`} className="mb-1 text-xs">
                  Horas de uso/día
                </Label>
                <Input id={`ec-hours-${a.id}`} type="number" min={0} max={24} step="0.1" value={a.hoursPerDay} onChange={(e) => updateAppliance(a.id, { hoursPerDay: Number(e.target.value) })} />
              </div>
              <div>
                <Label htmlFor={`ec-days-${a.id}`} className="mb-1 text-xs">
                  Días de uso/mes
                </Label>
                <Input id={`ec-days-${a.id}`} type="number" min={0} max={31} step="1" value={a.daysPerUse} onChange={(e) => updateAppliance(a.id, { daysPerUse: Number(e.target.value) })} />
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={a.standbyEnabled} onChange={(e) => updateAppliance(a.id, { standbyEnabled: e.target.checked })} />
                Modo en espera
              </label>
            </div>
            {a.standbyEnabled ? (
              <div className="max-w-xs">
                <Label htmlFor={`ec-standby-${a.id}`} className="mb-1 text-xs">
                  Potencia en espera (W)
                </Label>
                <Input id={`ec-standby-${a.id}`} type="number" min={0} step="0.1" value={a.standbyPowerW} onChange={(e) => updateAppliance(a.id, { standbyPowerW: Number(e.target.value) })} />
              </div>
            ) : null}
            {results.find((r) => r.appliance.id === a.id)?.energy.ok ? (
              <p aria-live="polite" className="text-xs text-muted-foreground">
                {results.find((r) => r.appliance.id === a.id)!.energy.dailyTotalKwh!.toFixed(3)} kWh/día · {results.find((r) => r.appliance.id === a.id)!.energy.monthlyKwh!.toFixed(2)} kWh/mes
              </p>
            ) : (
              <p role="alert" className="text-xs text-destructive">
                {results.find((r) => r.appliance.id === a.id)?.energy.error}
              </p>
            )}
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setState((prev) => (prev.appliances.length < DOCUMENT_LIMITS.electricity.maxAppliances ? { ...prev, appliances: [...prev.appliances, createAppliance()] } : prev))}>
          Añadir aparato
        </Button>
      </div>

      <div>
        <Label htmlFor="ec-target" className="mb-1">
          Objetivo de coste mensual para el primer aparato (opcional)
        </Label>
        <Input id="ec-target" type="number" min={0} step="0.01" value={state.targetMonthlyCost} onChange={(e) => patch({ targetMonthlyCost: Number(e.target.value) })} className="max-w-xs" />
        {maxHoursResult?.ok ? <p className="mt-1 text-xs text-muted-foreground">Horas máximas/día para no superarlo: {maxHoursResult.maxHoursPerDay!.toFixed(2)}</p> : maxHoursResult && !maxHoursResult.ok ? <p className="mt-1 text-xs text-destructive">{maxHoursResult.error}</p> : null}
      </div>

      <div aria-live="polite" className="grid gap-2 rounded-lg border p-4 text-sm sm:grid-cols-2">
        <p>
          Consumo mensual total: <strong>{totalMonthlyKwh.toFixed(2)} kWh</strong>
        </p>
        <p>
          Coste mensual total: <strong>{formatMoney(totalMonthlyCostMinor, currency)}</strong>
        </p>
      </div>

      {results.length > 0 && results.every((r) => r.energy.ok) ? (
        <AccessibleChart title="Consumo mensual por aparato" type="bar" series={[{ name: "kWh/mes", color: "#f59e0b", points: results.map((r) => ({ label: r.appliance.name || "Sin nombre", value: Number(r.energy.monthlyKwh!.toFixed(2)) })) }]} />
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <CopyButton text={summaryText()} label="Copiar resumen" />
        <DownloadButton content={csv} filename="consumo-electrico.csv" mimeType="text/csv;charset=utf-8" label="Descargar CSV" />
        <Button type="button" variant="outline" onClick={handleExportJson}>
          Exportar JSON
        </Button>
        <ResetButton
          onReset={() => {
            setState(defaultState());
            setError(null);
          }}
        />
      </div>

      <FileUploadZone accept="application/json" onFilesSelected={handleImportJson} label="Importar un escenario guardado previamente" hint="" />
    </div>
  );
}
