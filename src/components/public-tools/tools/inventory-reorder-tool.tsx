"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CopyButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import { COMMON_CURRENCIES, majorToMinor, formatMoney } from "@/lib/public-tools/business/invoice";
import { calculateReorderPoint, calculateSafetyStock, calculateEoq, calculateCoverage, type SafetyStockMode } from "@/lib/public-tools/commerce/inventory";
import { todayAsCalendarDate, calendarDateToIso, parseIsoDateInput, type CalendarDate } from "@/lib/public-tools/utilities/dates";
import { downloadTextFile } from "@/lib/public-tools/csv-export";
import { buildDocumentEnvelope, parseDocumentEnvelope } from "@/lib/public-tools/documents/json-schema";

const TOOL_ID = "calculadora-inventario-reposicion";
type Mode = "reorder" | "safety" | "eoq" | "coverage";
const SAFETY_MODE_LABELS: Record<SafetyStockMode, string> = { manual: "Entrada manual", variability: "Variabilidad de la demanda", "service-level": "Demanda y entrega variables (nivel de servicio)" };

export function InventoryReorderTool() {
  const today = todayAsCalendarDate();
  const [mode, setMode] = useState<Mode>("reorder");
  const [currency, setCurrency] = useState("EUR");
  const [error, setError] = useState<string | null>(null);

  // Reorder point
  const [avgDemand, setAvgDemand] = useState(20);
  const [leadTime, setLeadTime] = useState(5);
  const [manualSafety, setManualSafety] = useState(30);
  const [currentStock, setCurrentStock] = useState(150);
  const [inTransit, setInTransit] = useState(0);

  // Safety stock
  const [safetyMode, setSafetyMode] = useState<SafetyStockMode>("manual");
  const [manualValue, setManualValue] = useState(30);
  const [demandStdDev, setDemandStdDev] = useState(5);
  const [leadTimeStdDev, setLeadTimeStdDev] = useState(1);
  const [avgLeadTime, setAvgLeadTime] = useState(5);
  const [serviceFactorZ, setServiceFactorZ] = useState(1.65);

  // EOQ
  const [annualDemand, setAnnualDemand] = useState(5000);
  const [orderCost, setOrderCost] = useState(50);
  const [holdingCost, setHoldingCost] = useState(2);

  // Coverage
  const [availableStock, setAvailableStock] = useState(500);
  const [coverageDemand, setCoverageDemand] = useState(20);
  const [startDate, setStartDate] = useState<CalendarDate>(today);

  const reorderResult = calculateReorderPoint({ averageDailyDemand: avgDemand, leadTimeDays: leadTime, manualSafetyStock: manualSafety, currentStock, inTransitUnits: inTransit });
  const safetyResult = calculateSafetyStock({ mode: safetyMode, manualValue, demandStdDev, leadTimeStdDev, averageDailyDemand: avgDemand, averageLeadTimeDays: avgLeadTime, serviceFactorZ });
  const eoqResult = calculateEoq({ annualDemand, orderCostMinor: majorToMinor(orderCost, currency), annualHoldingCostPerUnitMinor: majorToMinor(holdingCost, currency) });
  const coverageResult = calculateCoverage({ availableStock, averageDailyDemand: coverageDemand, startDate });

  function summaryText(): string {
    if (mode === "reorder" && reorderResult.ok) {
      return [`Punto de reposición: ${reorderResult.reorderPoint!.toFixed(2)} unidades`, `Posición de inventario: ${reorderResult.inventoryPosition} unidades`, reorderResult.shouldReorder ? "Recomendación: revisar la reposición ahora." : "Recomendación: aún no es necesario reponer."].join("\n");
    }
    if (mode === "safety" && safetyResult.ok) {
      return [`Stock de seguridad: ${safetyResult.safetyStock!.toFixed(2)} unidades`, safetyResult.assumptionsNote].filter(Boolean).join("\n");
    }
    if (mode === "eoq" && eoqResult.ok) {
      return [
        `Cantidad económica de pedido: ${eoqResult.economicOrderQuantity!.toFixed(2)} unidades`,
        `Pedidos por año: ${eoqResult.ordersPerYear!.toFixed(2)}`,
        `Días medios entre pedidos: ${eoqResult.averageDaysBetweenOrders!.toFixed(1)}`,
        `Coste anual de ordenar: ${formatMoney(eoqResult.annualOrderingCostMinor!, currency)}`,
        `Coste anual de mantener: ${formatMoney(eoqResult.annualHoldingCostMinor!, currency)}`,
      ].join("\n");
    }
    if (mode === "coverage" && coverageResult.ok) {
      if (coverageResult.status === "NO_DEMAND") return coverageResult.message;
      return [`Días de cobertura: ${coverageResult.daysOfCoverage.toFixed(1)}`, `Fecha estimada de agotamiento: ${calendarDateToIso(coverageResult.stockoutDate)}`].join("\n");
    }
    return "";
  }

  interface StoredState {
    mode: Mode;
    currency: string;
    avgDemand: number;
    leadTime: number;
    manualSafety: number;
    currentStock: number;
    inTransit: number;
    safetyMode: SafetyStockMode;
    manualValue: number;
    demandStdDev: number;
    leadTimeStdDev: number;
    avgLeadTime: number;
    serviceFactorZ: number;
    annualDemand: number;
    orderCost: number;
    holdingCost: number;
    availableStock: number;
    coverageDemand: number;
    startDateIso: string;
  }
  function handleExportJson() {
    const state: StoredState = { mode, currency, avgDemand, leadTime, manualSafety, currentStock, inTransit, safetyMode, manualValue, demandStdDev, leadTimeStdDev, avgLeadTime, serviceFactorZ, annualDemand, orderCost, holdingCost, availableStock, coverageDemand, startDateIso: calendarDateToIso(startDate) };
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
      const s = result.data;
      setMode(s.mode);
      setCurrency(s.currency);
      setAvgDemand(s.avgDemand);
      setLeadTime(s.leadTime);
      setManualSafety(s.manualSafety);
      setCurrentStock(s.currentStock);
      setInTransit(s.inTransit);
      setSafetyMode(s.safetyMode);
      setManualValue(s.manualValue);
      setDemandStdDev(s.demandStdDev);
      setLeadTimeStdDev(s.leadTimeStdDev);
      setAvgLeadTime(s.avgLeadTime);
      setServiceFactorZ(s.serviceFactorZ);
      setAnnualDemand(s.annualDemand);
      setOrderCost(s.orderCost);
      setHoldingCost(s.holdingCost);
      setAvailableStock(s.availableStock);
      setCoverageDemand(s.coverageDemand);
      const parsed = parseIsoDateInput(s.startDateIso);
      if (parsed) setStartDate(parsed);
      setError(null);
    });
  }

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">Los datos se procesan en tu dispositivo y no se envían al servidor.</p>
      <p className="text-xs text-muted-foreground">No realiza pronóstico automático ni se conecta a tus ventas reales; los resultados dependen solo de los valores que introduzcas.</p>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant={mode === "reorder" ? "default" : "outline"} size="sm" onClick={() => setMode("reorder")}>
          Punto de reposición
        </Button>
        <Button type="button" variant={mode === "safety" ? "default" : "outline"} size="sm" onClick={() => setMode("safety")}>
          Stock de seguridad
        </Button>
        <Button type="button" variant={mode === "eoq" ? "default" : "outline"} size="sm" onClick={() => setMode("eoq")}>
          Cantidad económica de pedido
        </Button>
        <Button type="button" variant={mode === "coverage" ? "default" : "outline"} size="sm" onClick={() => setMode("coverage")}>
          Cobertura
        </Button>
      </div>

      {mode === "reorder" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="inv-demand" className="mb-1">
              Demanda media diaria
            </Label>
            <Input id="inv-demand" type="number" min={0} step="0.01" value={avgDemand} onChange={(e) => setAvgDemand(Number(e.target.value))} />
          </div>
          <div>
            <Label htmlFor="inv-leadtime" className="mb-1">
              Tiempo de entrega (días)
            </Label>
            <Input id="inv-leadtime" type="number" min={0} step="0.1" value={leadTime} onChange={(e) => setLeadTime(Number(e.target.value))} />
          </div>
          <div>
            <Label htmlFor="inv-manual-safety" className="mb-1">
              Stock de seguridad manual
            </Label>
            <Input id="inv-manual-safety" type="number" min={0} step="1" value={manualSafety} onChange={(e) => setManualSafety(Number(e.target.value))} />
          </div>
          <div>
            <Label htmlFor="inv-current-stock" className="mb-1">
              Stock actual
            </Label>
            <Input id="inv-current-stock" type="number" min={0} step="1" value={currentStock} onChange={(e) => setCurrentStock(Number(e.target.value))} />
          </div>
          <div>
            <Label htmlFor="inv-transit" className="mb-1">
              Pedidos en tránsito
            </Label>
            <Input id="inv-transit" type="number" min={0} step="1" value={inTransit} onChange={(e) => setInTransit(Number(e.target.value))} />
          </div>
        </div>
      ) : null}

      {mode === "safety" ? (
        <div className="space-y-3">
          <Select value={safetyMode} onValueChange={(v) => setSafetyMode(v as SafetyStockMode)}>
            <SelectTrigger className="w-full sm:w-72">
              <SelectValue>{SAFETY_MODE_LABELS[safetyMode]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Entrada manual</SelectItem>
              <SelectItem value="variability">Variabilidad de la demanda</SelectItem>
              <SelectItem value="service-level">Demanda y entrega variables (nivel de servicio)</SelectItem>
            </SelectContent>
          </Select>
          {safetyMode === "manual" ? (
            <div>
              <Label htmlFor="inv-safety-manual" className="mb-1">
                Stock de seguridad
              </Label>
              <Input id="inv-safety-manual" type="number" min={0} step="1" value={manualValue} onChange={(e) => setManualValue(Number(e.target.value))} className="max-w-xs" />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="inv-z" className="mb-1">
                  Factor de seguridad (Z)
                </Label>
                <Input id="inv-z" type="number" min={0} step="0.01" value={serviceFactorZ} onChange={(e) => setServiceFactorZ(Number(e.target.value))} />
              </div>
              <div>
                <Label htmlFor="inv-demand-std" className="mb-1">
                  Desviación estándar de la demanda
                </Label>
                <Input id="inv-demand-std" type="number" min={0} step="0.01" value={demandStdDev} onChange={(e) => setDemandStdDev(Number(e.target.value))} />
              </div>
              <div>
                <Label htmlFor="inv-avg-leadtime" className="mb-1">
                  Tiempo de entrega medio (días)
                </Label>
                <Input id="inv-avg-leadtime" type="number" min={0} step="0.1" value={avgLeadTime} onChange={(e) => setAvgLeadTime(Number(e.target.value))} />
              </div>
              {safetyMode === "service-level" ? (
                <div>
                  <Label htmlFor="inv-leadtime-std" className="mb-1">
                    Desviación estándar del tiempo de entrega
                  </Label>
                  <Input id="inv-leadtime-std" type="number" min={0} step="0.01" value={leadTimeStdDev} onChange={(e) => setLeadTimeStdDev(Number(e.target.value))} />
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {mode === "eoq" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="inv-currency" className="mb-1">
              Moneda
            </Label>
            <Select value={currency} onValueChange={(v) => setCurrency(v as string)}>
              <SelectTrigger id="inv-currency" className="w-full">
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
            <Label htmlFor="inv-annual-demand" className="mb-1">
              Demanda anual
            </Label>
            <Input id="inv-annual-demand" type="number" min={0} step="1" value={annualDemand} onChange={(e) => setAnnualDemand(Number(e.target.value))} />
          </div>
          <div>
            <Label htmlFor="inv-order-cost" className="mb-1">
              Coste por pedido
            </Label>
            <Input id="inv-order-cost" type="number" min={0} step="0.01" value={orderCost} onChange={(e) => setOrderCost(Number(e.target.value))} />
          </div>
          <div>
            <Label htmlFor="inv-holding-cost" className="mb-1">
              Coste anual de almacenamiento por unidad
            </Label>
            <Input id="inv-holding-cost" type="number" min={0} step="0.01" value={holdingCost} onChange={(e) => setHoldingCost(Number(e.target.value))} />
          </div>
        </div>
      ) : null}

      {mode === "coverage" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="inv-available" className="mb-1">
              Stock disponible
            </Label>
            <Input id="inv-available" type="number" min={0} step="1" value={availableStock} onChange={(e) => setAvailableStock(Number(e.target.value))} />
          </div>
          <div>
            <Label htmlFor="inv-cov-demand" className="mb-1">
              Demanda media diaria
            </Label>
            <Input id="inv-cov-demand" type="number" min={0} step="0.01" value={coverageDemand} onChange={(e) => setCoverageDemand(Number(e.target.value))} />
          </div>
          <div>
            <Label htmlFor="inv-start-date" className="mb-1">
              Fecha inicial
            </Label>
            <Input
              id="inv-start-date"
              type="date"
              value={calendarDateToIso(startDate)}
              onChange={(e) => {
                const d = parseIsoDateInput(e.target.value);
                if (d) setStartDate(d);
              }}
            />
          </div>
        </div>
      ) : null}

      {mode === "reorder" && !reorderResult.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {reorderResult.error}
        </p>
      ) : null}
      {mode === "safety" && !safetyResult.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {safetyResult.error}
        </p>
      ) : null}
      {mode === "eoq" && !eoqResult.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {eoqResult.error}
        </p>
      ) : null}
      {mode === "coverage" && !coverageResult.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {coverageResult.error}
        </p>
      ) : null}

      {mode === "reorder" && reorderResult.ok ? (
        <div aria-live="polite" className="grid gap-2 rounded-lg border p-4 text-sm sm:grid-cols-2">
          <p>
            Punto de reposición: <strong>{reorderResult.reorderPoint!.toFixed(2)} unidades</strong>
          </p>
          <p>Posición de inventario: {reorderResult.inventoryPosition} unidades</p>
          <p>{reorderResult.shouldReorder ? "Recomendación: revisar la reposición ahora." : "Recomendación: aún no es necesario reponer."}</p>
        </div>
      ) : null}

      {mode === "safety" && safetyResult.ok ? (
        <div aria-live="polite" className="space-y-1 rounded-lg border p-4 text-sm">
          <p>
            Stock de seguridad: <strong>{safetyResult.safetyStock!.toFixed(2)} unidades</strong>
          </p>
          {safetyResult.assumptionsNote ? <p className="text-muted-foreground">{safetyResult.assumptionsNote}</p> : null}
        </div>
      ) : null}

      {mode === "eoq" && eoqResult.ok ? (
        <div aria-live="polite" className="grid gap-2 rounded-lg border p-4 text-sm sm:grid-cols-2">
          <p>
            Cantidad económica de pedido: <strong>{eoqResult.economicOrderQuantity!.toFixed(2)} unidades</strong>
          </p>
          <p>Pedidos por año: {eoqResult.ordersPerYear!.toFixed(2)}</p>
          <p>Días medios entre pedidos: {eoqResult.averageDaysBetweenOrders!.toFixed(1)}</p>
          <p>Coste anual de ordenar: {formatMoney(eoqResult.annualOrderingCostMinor!, currency)}</p>
          <p>Coste anual de mantener: {formatMoney(eoqResult.annualHoldingCostMinor!, currency)}</p>
          <p>Coste total anual: {formatMoney(eoqResult.totalAnnualCostMinor!, currency)}</p>
        </div>
      ) : null}

      {mode === "coverage" && coverageResult.ok && coverageResult.status === "NO_DEMAND" ? (
        <div aria-live="polite" className="space-y-1 rounded-lg border p-4 text-sm">
          <p className="text-amber-700 dark:text-amber-400">{coverageResult.message}</p>
        </div>
      ) : null}

      {mode === "coverage" && coverageResult.ok && coverageResult.status === "FINITE" ? (
        <div aria-live="polite" className="space-y-1 rounded-lg border p-4 text-sm">
          <p>
            Días de cobertura: <strong>{coverageResult.daysOfCoverage.toFixed(1)}</strong>
          </p>
          <p>Fecha estimada de agotamiento: {calendarDateToIso(coverageResult.stockoutDate)}</p>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <CopyButton text={summaryText()} label="Copiar resumen" />
        <Button type="button" variant="outline" onClick={() => downloadTextFile("inventario.txt", summaryText())} disabled={!summaryText()}>
          Descargar informe
        </Button>
        <Button type="button" variant="outline" onClick={handleExportJson}>
          Exportar JSON
        </Button>
        <ResetButton
          onReset={() => {
            setMode("reorder");
            setCurrency("EUR");
            setAvgDemand(20);
            setLeadTime(5);
            setManualSafety(30);
            setCurrentStock(150);
            setInTransit(0);
            setSafetyMode("manual");
            setManualValue(30);
            setDemandStdDev(5);
            setLeadTimeStdDev(1);
            setAvgLeadTime(5);
            setServiceFactorZ(1.65);
            setAnnualDemand(5000);
            setOrderCost(50);
            setHoldingCost(2);
            setAvailableStock(500);
            setCoverageDemand(20);
            setStartDate(today);
            setError(null);
          }}
        />
      </div>

      <FileUploadZone accept="application/json" onFilesSelected={handleImportJson} label="Importar un escenario guardado previamente" hint="" />
    </div>
  );
}
