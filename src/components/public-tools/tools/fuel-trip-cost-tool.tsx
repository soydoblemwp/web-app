"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, LabeledSelect } from "@/components/ui/select";
import { CopyButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import { COMMON_CURRENCIES, majorToMinor, formatMoney } from "@/lib/public-tools/business/invoice";
import { calculateFuelTrip, compareVehicles, type TripLeg, type EfficiencyUnit, type DistanceUnit, type FuelTripInput } from "@/lib/public-tools/travel/fuel-trip";
import { downloadTextFile } from "@/lib/public-tools/csv-export";
import { buildDocumentEnvelope, parseDocumentEnvelope } from "@/lib/public-tools/documents/json-schema";
import { DOCUMENT_LIMITS } from "@/lib/public-tools/documents/limits";

const TOOL_ID = "calculadora-costo-combustible-viaje";
const EFFICIENCY_LABELS: Record<EfficiencyUnit, string> = { "l-100km": "Litros/100 km", "km-l": "km/litro", "mpg-us": "mpg (EE. UU.)", "mpg-imperial": "mpg (imperial)" };

function createLeg(): TripLeg {
  return { id: `leg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, label: "", distance: 0, distanceUnit: "km" };
}

interface VehicleForm {
  id: string;
  name: string;
  efficiencyValue: number;
  efficiencyUnit: EfficiencyUnit;
}

function createVehicle(): VehicleForm {
  return { id: `veh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: "", efficiencyValue: 7, efficiencyUnit: "l-100km" };
}

interface StoredState {
  currency: string;
  legs: TripLeg[];
  roundTrip: boolean;
  fuelPrice: number;
  tolls: number;
  parking: number;
  otherCosts: number;
  passengers: number;
  compareEnabled: boolean;
  vehicles: VehicleForm[];
}

function defaultState(): StoredState {
  return {
    currency: "EUR",
    legs: [{ ...createLeg(), label: "Trayecto principal", distance: 120, distanceUnit: "km" }],
    roundTrip: true,
    fuelPrice: 1.7,
    tolls: 0,
    parking: 0,
    otherCosts: 0,
    passengers: 1,
    compareEnabled: false,
    vehicles: [{ ...createVehicle(), name: "Vehículo A" }, { ...createVehicle(), name: "Vehículo B", efficiencyValue: 5.5 }],
  };
}

export function FuelTripCostTool() {
  const [state, setState] = useState<StoredState>(defaultState());
  const [error, setError] = useState<string | null>(null);
  const { currency } = state;

  function patch(p: Partial<StoredState>) {
    setState((prev) => ({ ...prev, ...p }));
  }
  function updateLeg(id: string, p: Partial<TripLeg>) {
    setState((prev) => ({ ...prev, legs: prev.legs.map((l) => (l.id === id ? { ...l, ...p } : l)) }));
  }
  function updateVehicle(id: string, p: Partial<VehicleForm>) {
    setState((prev) => ({ ...prev, vehicles: prev.vehicles.map((v) => (v.id === id ? { ...v, ...p } : v)) }));
  }

  function buildInput(vehicle: VehicleForm): FuelTripInput {
    return {
      legs: state.legs,
      roundTrip: state.roundTrip,
      efficiencyValue: vehicle.efficiencyValue,
      efficiencyUnit: vehicle.efficiencyUnit,
      fuelPricePerLiterMinor: majorToMinor(state.fuelPrice, currency),
      tollsMinor: majorToMinor(state.tolls, currency),
      parkingMinor: majorToMinor(state.parking, currency),
      otherCostsMinor: majorToMinor(state.otherCosts, currency),
      passengers: state.passengers,
    };
  }

  const singleResult = calculateFuelTrip(buildInput(state.vehicles[0] ?? createVehicle()));
  const comparison = state.compareEnabled ? compareVehicles(state.vehicles.map(buildInput)) : null;

  function summaryText(): string {
    if (state.compareEnabled && comparison) {
      return state.vehicles
        .map((v, i) => {
          const r = comparison.results[i];
          return r.ok ? `${v.name || "Vehículo"}: ${formatMoney(r.totalCostMinor!, currency)} total, ${formatMoney(r.costPerKmMinor!, currency)}/km` : `${v.name || "Vehículo"}: ${r.error}`;
        })
        .join("\n");
    }
    if (!singleResult.ok) return "";
    return [
      `Distancia total: ${singleResult.totalDistanceKm!.toFixed(1)} km`,
      `Combustible necesario: ${singleResult.fuelNeededLiters!.toFixed(2)} litros`,
      `Coste de combustible: ${formatMoney(singleResult.fuelCostMinor!, currency)}`,
      `Coste total: ${formatMoney(singleResult.totalCostMinor!, currency)}`,
      `Coste por km: ${formatMoney(singleResult.costPerKmMinor!, currency)}`,
      `Coste por pasajero: ${formatMoney(singleResult.costPerPassengerMinor!, currency)}`,
    ].join("\n");
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

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">Los datos se procesan en tu dispositivo y no se envían al servidor.</p>
      <p className="text-xs text-muted-foreground">La distancia se introduce manualmente; esta herramienta no consulta mapas, tráfico, peajes reales ni tu ubicación, y no representa el coste completo de propiedad del vehículo.</p>

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <Label htmlFor="ft-currency" className="mb-1">
            Moneda
          </Label>
          <Select value={currency} onValueChange={(v) => patch({ currency: v as string })}>
            <SelectTrigger id="ft-currency" className="w-32">
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
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={state.roundTrip} onChange={(e) => patch({ roundTrip: e.target.checked })} />
          Ida y vuelta
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={state.compareEnabled} onChange={(e) => patch({ compareEnabled: e.target.checked })} />
          Comparar vehículos
        </label>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Etapas del viaje</h2>
        {state.legs.map((leg) => (
          <div key={leg.id} className="grid gap-2 rounded-md border p-2 sm:grid-cols-4">
            <Input placeholder="Nombre de la etapa" value={leg.label} onChange={(e) => updateLeg(leg.id, { label: e.target.value })} className="sm:col-span-2" />
            <Input type="number" min={0} step="0.1" placeholder="Distancia" value={leg.distance} onChange={(e) => updateLeg(leg.id, { distance: Number(e.target.value) })} />
            <div className="flex gap-2">
              <Select value={leg.distanceUnit} onValueChange={(v) => updateLeg(leg.id, { distanceUnit: v as DistanceUnit })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="km">km</SelectItem>
                  <SelectItem value="mi">mi</SelectItem>
                </SelectContent>
              </Select>
              <Button type="button" variant="ghost" size="sm" onClick={() => setState((prev) => ({ ...prev, legs: prev.legs.filter((l) => l.id !== leg.id) }))}>
                Eliminar
              </Button>
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setState((prev) => (prev.legs.length < DOCUMENT_LIMITS.fuelTrip.maxLegs ? { ...prev, legs: [...prev.legs, createLeg()] } : prev))}>
          Añadir etapa
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="ft-fuel-price" className="mb-1">
            Precio del combustible por litro
          </Label>
          <Input id="ft-fuel-price" type="number" min={0} step="0.01" value={state.fuelPrice} onChange={(e) => patch({ fuelPrice: Number(e.target.value) })} />
        </div>
        <div>
          <Label htmlFor="ft-passengers" className="mb-1">
            Pasajeros
          </Label>
          <Input id="ft-passengers" type="number" min={1} step="1" value={state.passengers} onChange={(e) => patch({ passengers: Number(e.target.value) })} />
        </div>
        <div>
          <Label htmlFor="ft-tolls" className="mb-1">
            Peajes
          </Label>
          <Input id="ft-tolls" type="number" min={0} step="0.01" value={state.tolls} onChange={(e) => patch({ tolls: Number(e.target.value) })} />
        </div>
        <div>
          <Label htmlFor="ft-parking" className="mb-1">
            Estacionamiento
          </Label>
          <Input id="ft-parking" type="number" min={0} step="0.01" value={state.parking} onChange={(e) => patch({ parking: Number(e.target.value) })} />
        </div>
        <div>
          <Label htmlFor="ft-other" className="mb-1">
            Otros costes
          </Label>
          <Input id="ft-other" type="number" min={0} step="0.01" value={state.otherCosts} onChange={(e) => patch({ otherCosts: Number(e.target.value) })} />
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">{state.compareEnabled ? "Vehículos a comparar" : "Vehículo"}</h2>
        {(state.compareEnabled ? state.vehicles : state.vehicles.slice(0, 1)).map((v) => (
          <div key={v.id} className="grid gap-2 rounded-md border p-2 sm:grid-cols-3">
            <Input placeholder="Nombre del vehículo" value={v.name} onChange={(e) => updateVehicle(v.id, { name: e.target.value })} />
            <Input type="number" min={0} step="0.01" placeholder="Rendimiento" value={v.efficiencyValue} onChange={(e) => updateVehicle(v.id, { efficiencyValue: Number(e.target.value) })} />
            <LabeledSelect
              value={v.efficiencyUnit}
              onValueChange={(val) => updateVehicle(v.id, { efficiencyUnit: val as EfficiencyUnit })}
              options={(Object.keys(EFFICIENCY_LABELS) as EfficiencyUnit[]).map((u) => ({ value: u, label: EFFICIENCY_LABELS[u] }))}
            />
          </div>
        ))}
        {state.compareEnabled ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setState((prev) => (prev.vehicles.length < DOCUMENT_LIMITS.fuelTrip.maxVehicles ? { ...prev, vehicles: [...prev.vehicles, createVehicle()] } : prev))}>
            Añadir vehículo
          </Button>
        ) : null}
      </div>

      {!state.compareEnabled && !singleResult.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {singleResult.error}
        </p>
      ) : null}

      {!state.compareEnabled && singleResult.ok ? (
        <div aria-live="polite" className="grid gap-2 rounded-lg border p-4 text-sm sm:grid-cols-2">
          <p>Distancia total: {singleResult.totalDistanceKm!.toFixed(1)} km</p>
          <p>Combustible necesario: {singleResult.fuelNeededLiters!.toFixed(2)} l</p>
          <p>Coste de combustible: {formatMoney(singleResult.fuelCostMinor!, currency)}</p>
          <p>
            Coste total: <strong>{formatMoney(singleResult.totalCostMinor!, currency)}</strong>
          </p>
          <p>Coste por km: {formatMoney(singleResult.costPerKmMinor!, currency)}</p>
          <p>Coste por pasajero: {formatMoney(singleResult.costPerPassengerMinor!, currency)}</p>
        </div>
      ) : null}

      {state.compareEnabled && comparison ? (
        <div aria-live="polite" className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th scope="col" className="px-3 py-2 text-left">
                  Vehículo
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  Coste total
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  Diferencia vs. más barato
                </th>
              </tr>
            </thead>
            <tbody>
              {state.vehicles.map((v, i) => {
                const r = comparison.results[i];
                const savings = comparison.savingsVsCheapestMinor[i];
                return (
                  <tr key={v.id} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      {v.name || "Sin nombre"} {i === comparison.cheapestIndex ? <span className="text-xs text-green-700 dark:text-green-400">(más barato)</span> : null}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.ok ? formatMoney(r.totalCostMinor!, currency) : r.error}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{savings !== null && savings > 0 ? `+${formatMoney(savings, currency)}` : savings === 0 ? "—" : ""}</td>
                  </tr>
                );
              })}
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
        <CopyButton text={summaryText()} label="Copiar resumen" />
        <Button type="button" variant="outline" onClick={() => downloadTextFile("costo-viaje.txt", summaryText())} disabled={!summaryText()}>
          Descargar informe
        </Button>
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

      <FileUploadZone accept="application/json" onFilesSelected={handleImportJson} label="Importar un viaje guardado previamente" hint="" />
    </div>
  );
}
