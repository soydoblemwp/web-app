"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CopyButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import { COMMON_CURRENCIES, majorToMinor, minorToMajor, formatMoney } from "@/lib/public-tools/business/invoice";
import { calculateCommission, splitCommissionAmongReps, type CommissionTier, type CommissionTierMode, type RepSplit } from "@/lib/public-tools/commerce/sales-commission";
import { buildCsv, downloadTextFile } from "@/lib/public-tools/csv-export";
import { buildDocumentEnvelope, parseDocumentEnvelope } from "@/lib/public-tools/documents/json-schema";

const TOOL_ID = "calculadora-comisiones-ventas";
type PlanType = "flat" | "tiers" | "quota";
const PLAN_TYPE_LABELS: Record<PlanType, string> = { flat: "Comisión plana", tiers: "Tramos (progresivos o retroactivos)", quota: "Cuota y acelerador" };

function createTier(): CommissionTier {
  return { id: `tier-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, fromMinor: 0, toMinor: null, ratePercent: 0 };
}
function createRep(): RepSplit {
  return { id: `rep-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: "", sharePercent: 100 };
}

interface StoredState {
  currency: string;
  planType: PlanType;
  sales: number;
  returns: number;
  flatRate: number;
  tiers: CommissionTier[];
  tierMode: CommissionTierMode;
  quota: number;
  rateBeforeQuota: number;
  rateAfterQuota: number;
  accelerator: number;
  bonus: number;
  deductions: number;
  reps: RepSplit[];
  splitEnabled: boolean;
}

function defaultState(): StoredState {
  return {
    currency: "EUR",
    planType: "flat",
    sales: 10000,
    returns: 0,
    flatRate: 5,
    tiers: [
      { ...createTier(), fromMinor: 0, toMinor: 500000, ratePercent: 3 },
      { ...createTier(), fromMinor: 500000, toMinor: null, ratePercent: 6 },
    ],
    tierMode: "progressive",
    quota: 8000,
    rateBeforeQuota: 2,
    rateAfterQuota: 5,
    accelerator: 1,
    bonus: 0,
    deductions: 0,
    reps: [{ ...createRep(), name: "Vendedor 1" }],
    splitEnabled: false,
  };
}

export function SalesCommissionTool() {
  const [state, setState] = useState<StoredState>(defaultState());
  const [error, setError] = useState<string | null>(null);
  const { currency } = state;

  function patch(p: Partial<StoredState>) {
    setState((prev) => ({ ...prev, ...p }));
  }
  function updateTier(id: string, p: Partial<CommissionTier>) {
    setState((prev) => ({ ...prev, tiers: prev.tiers.map((t) => (t.id === id ? { ...t, ...p } : t)) }));
  }
  function updateRep(id: string, p: Partial<RepSplit>) {
    setState((prev) => ({ ...prev, reps: prev.reps.map((r) => (r.id === id ? { ...r, ...p } : r)) }));
  }

  const commissionResult = calculateCommission({
    salesMinor: majorToMinor(state.sales, currency),
    returnsMinor: majorToMinor(state.returns, currency),
    flatRatePercent: state.planType === "flat" ? state.flatRate : undefined,
    tiers: state.planType === "tiers" ? state.tiers : undefined,
    tierMode: state.tierMode,
    quotaMinor: state.planType === "quota" ? majorToMinor(state.quota, currency) : undefined,
    rateBeforeQuotaPercent: state.rateBeforeQuota,
    rateAfterQuotaPercent: state.rateAfterQuota,
    accelerator: state.accelerator,
    bonusMinor: majorToMinor(state.bonus, currency),
    deductionsMinor: majorToMinor(state.deductions, currency),
  });

  const splitResult = state.splitEnabled && commissionResult.ok ? splitCommissionAmongReps(commissionResult.finalCommissionMinor!, state.reps) : null;

  function summaryText(): string {
    if (!commissionResult.ok) return "";
    const lines = [
      `Ventas comisionables: ${formatMoney(commissionResult.commissionableSalesMinor!, currency)}`,
      `Comisión base: ${formatMoney(commissionResult.baseCommissionMinor!, currency)}`,
      `Bono: ${formatMoney(commissionResult.bonusMinor!, currency)}`,
      `Deducciones: ${formatMoney(commissionResult.deductionsMinor!, currency)}`,
      `Comisión final: ${formatMoney(commissionResult.finalCommissionMinor!, currency)}`,
      `Tasa efectiva: ${commissionResult.effectiveRatePercent!.toFixed(2)}%`,
    ];
    if (splitResult?.ok && splitResult.splits) lines.push("", ...splitResult.splits.map((s) => `${s.name || "sin nombre"}: ${formatMoney(s.amountMinor, currency)} (${s.sharePercent}%)`));
    return lines.join("\n");
  }

  const csv =
    commissionResult.ok && commissionResult.tierBreakdown
      ? buildCsv(
          ["Tramo", "Importe en el tramo", "Tasa %", "Comisión"],
          commissionResult.tierBreakdown.map((row) => [row.tierId, minorToMajor(row.amountInTierMinor, currency).toFixed(2), row.ratePercent.toFixed(2), minorToMajor(row.commissionMinor, currency).toFixed(2)])
        )
      : "";

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
      <p className="text-xs text-muted-foreground">Configura el plan según el contrato y las normas aplicables. Esta herramienta no determina derechos laborales.</p>

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <Label htmlFor="sc-currency" className="mb-1">
            Moneda
          </Label>
          <Select value={currency} onValueChange={(v) => patch({ currency: v as string })}>
            <SelectTrigger id="sc-currency" className="w-32">
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
          <Label htmlFor="sc-plan" className="mb-1">
            Tipo de plan
          </Label>
          <Select value={state.planType} onValueChange={(v) => patch({ planType: v as PlanType })}>
            <SelectTrigger id="sc-plan" className="w-56">
              <SelectValue>{PLAN_TYPE_LABELS[state.planType]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="flat">Comisión plana</SelectItem>
              <SelectItem value="tiers">Tramos (progresivos o retroactivos)</SelectItem>
              <SelectItem value="quota">Cuota y acelerador</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="sc-sales" className="mb-1">
            Ventas
          </Label>
          <Input id="sc-sales" type="number" min={0} step="0.01" value={state.sales} onChange={(e) => patch({ sales: Number(e.target.value) })} />
        </div>
        <div>
          <Label htmlFor="sc-returns" className="mb-1">
            Devoluciones o cancelaciones
          </Label>
          <Input id="sc-returns" type="number" min={0} step="0.01" value={state.returns} onChange={(e) => patch({ returns: Number(e.target.value) })} />
        </div>
        <div>
          <Label htmlFor="sc-bonus" className="mb-1">
            Bono fijo
          </Label>
          <Input id="sc-bonus" type="number" min={0} step="0.01" value={state.bonus} onChange={(e) => patch({ bonus: Number(e.target.value) })} />
        </div>
        <div>
          <Label htmlFor="sc-deductions" className="mb-1">
            Deducciones
          </Label>
          <Input id="sc-deductions" type="number" min={0} step="0.01" value={state.deductions} onChange={(e) => patch({ deductions: Number(e.target.value) })} />
        </div>
      </div>

      {state.planType === "flat" ? (
        <div>
          <Label htmlFor="sc-flat-rate" className="mb-1">
            Porcentaje de comisión
          </Label>
          <Input id="sc-flat-rate" type="number" min={0} step="0.01" value={state.flatRate} onChange={(e) => patch({ flatRate: Number(e.target.value) })} className="max-w-xs" />
        </div>
      ) : null}

      {state.planType === "tiers" ? (
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button type="button" variant={state.tierMode === "progressive" ? "default" : "outline"} size="sm" onClick={() => patch({ tierMode: "progressive" })}>
              Progresiva
            </Button>
            <Button type="button" variant={state.tierMode === "retroactive" ? "default" : "outline"} size="sm" onClick={() => patch({ tierMode: "retroactive" })}>
              Retroactiva
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{state.tierMode === "progressive" ? "Solo la porción de ventas dentro de cada tramo usa su tasa." : "Al alcanzar un tramo, TODAS las ventas comisionables se pagan a la tasa de ese tramo."}</p>
          {state.tiers.map((t) => (
            <div key={t.id} className="grid gap-2 rounded-md border p-2 sm:grid-cols-4">
              <Input type="number" min={0} step="0.01" placeholder="Desde" value={minorToMajor(t.fromMinor, currency)} onChange={(e) => updateTier(t.id, { fromMinor: majorToMinor(Number(e.target.value), currency) })} />
              <Input
                type="number"
                min={0}
                step="0.01"
                placeholder="Hasta (vacío = sin límite)"
                value={t.toMinor === null ? "" : minorToMajor(t.toMinor, currency)}
                onChange={(e) => updateTier(t.id, { toMinor: e.target.value === "" ? null : majorToMinor(Number(e.target.value), currency) })}
              />
              <Input type="number" min={0} step="0.01" placeholder="Tasa %" value={t.ratePercent} onChange={(e) => updateTier(t.id, { ratePercent: Number(e.target.value) })} />
              <Button type="button" variant="ghost" size="sm" onClick={() => setState((prev) => ({ ...prev, tiers: prev.tiers.filter((tier) => tier.id !== t.id) }))}>
                Eliminar
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setState((prev) => ({ ...prev, tiers: [...prev.tiers, createTier()] }))}>
            Añadir tramo
          </Button>
        </div>
      ) : null}

      {state.planType === "quota" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="sc-quota" className="mb-1">
              Cuota
            </Label>
            <Input id="sc-quota" type="number" min={0} step="0.01" value={state.quota} onChange={(e) => patch({ quota: Number(e.target.value) })} />
          </div>
          <div>
            <Label htmlFor="sc-rate-before" className="mb-1">
              Tasa antes de cuota %
            </Label>
            <Input id="sc-rate-before" type="number" min={0} step="0.01" value={state.rateBeforeQuota} onChange={(e) => patch({ rateBeforeQuota: Number(e.target.value) })} />
          </div>
          <div>
            <Label htmlFor="sc-rate-after" className="mb-1">
              Tasa después de cuota %
            </Label>
            <Input id="sc-rate-after" type="number" min={0} step="0.01" value={state.rateAfterQuota} onChange={(e) => patch({ rateAfterQuota: Number(e.target.value) })} />
          </div>
          <div>
            <Label htmlFor="sc-accelerator" className="mb-1">
              Acelerador
            </Label>
            <Input id="sc-accelerator" type="number" min={0} step="0.01" value={state.accelerator} onChange={(e) => patch({ accelerator: Number(e.target.value) })} />
          </div>
        </div>
      ) : null}

      <div className="space-y-2 rounded-lg border p-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={state.splitEnabled} onChange={(e) => patch({ splitEnabled: e.target.checked })} />
          Repartir entre varios vendedores
        </label>
        {state.splitEnabled ? (
          <div className="space-y-2">
            {state.reps.map((r) => (
              <div key={r.id} className="flex gap-2">
                <Input placeholder="Nombre" value={r.name} onChange={(e) => updateRep(r.id, { name: e.target.value })} />
                <Input type="number" min={0} step="0.01" placeholder="Reparto %" value={r.sharePercent} onChange={(e) => updateRep(r.id, { sharePercent: Number(e.target.value) })} />
                <Button type="button" variant="ghost" size="sm" onClick={() => setState((prev) => ({ ...prev, reps: prev.reps.filter((rep) => rep.id !== r.id) }))}>
                  Eliminar
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setState((prev) => ({ ...prev, reps: [...prev.reps, createRep()] }))}>
              Añadir vendedor
            </Button>
          </div>
        ) : null}
      </div>

      {!commissionResult.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {commissionResult.error}
        </p>
      ) : null}

      {commissionResult.ok ? (
        <div aria-live="polite" className="space-y-3 rounded-lg border p-4 text-sm">
          <div className="grid gap-2 sm:grid-cols-2">
            <p>Ventas comisionables: {formatMoney(commissionResult.commissionableSalesMinor!, currency)}</p>
            <p>Comisión base: {formatMoney(commissionResult.baseCommissionMinor!, currency)}</p>
            <p>
              Comisión final: <strong>{formatMoney(commissionResult.finalCommissionMinor!, currency)}</strong>
            </p>
            <p>Tasa efectiva: {commissionResult.effectiveRatePercent!.toFixed(2)}%</p>
          </div>
          {commissionResult.tierBreakdown ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th scope="col" className="px-2 py-1 text-left">
                      Tramo
                    </th>
                    <th scope="col" className="px-2 py-1 text-right">
                      Importe
                    </th>
                    <th scope="col" className="px-2 py-1 text-right">
                      Tasa
                    </th>
                    <th scope="col" className="px-2 py-1 text-right">
                      Comisión
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {commissionResult.tierBreakdown.map((row) => (
                    <tr key={row.tierId} className="border-b last:border-0">
                      <td className="px-2 py-1">{row.tierId}</td>
                      <td className="px-2 py-1 text-right">{formatMoney(row.amountInTierMinor, currency)}</td>
                      <td className="px-2 py-1 text-right">{row.ratePercent.toFixed(2)}%</td>
                      <td className="px-2 py-1 text-right">{formatMoney(row.commissionMinor, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {splitResult?.ok && splitResult.splits ? (
            <ul className="space-y-1">
              {splitResult.splits.map((s) => (
                <li key={s.id}>
                  {s.name || "Sin nombre"}: {formatMoney(s.amountMinor, currency)} ({s.sharePercent}%)
                </li>
              ))}
            </ul>
          ) : splitResult && !splitResult.ok ? (
            <p role="alert" className="text-destructive">
              {splitResult.error}
            </p>
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
        <Button type="button" variant="outline" onClick={() => downloadTextFile("comisiones.csv", csv, "text/csv;charset=utf-8")} disabled={!csv}>
          Descargar CSV
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

      <FileUploadZone accept="application/json" onFilesSelected={handleImportJson} label="Importar un plan guardado previamente" hint="" />
    </div>
  );
}
