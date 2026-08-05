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
import { calculateRoi, calculateRoas, calculatePayback, type PaybackMode } from "@/lib/public-tools/commerce/roi-roas";
import { buildCsv, downloadTextFile } from "@/lib/public-tools/csv-export";
import { buildDocumentEnvelope, parseDocumentEnvelope } from "@/lib/public-tools/documents/json-schema";
import { DOCUMENT_LIMITS } from "@/lib/public-tools/documents/limits";

const TOOL_ID = "calculadora-roi-roas-recuperacion";
type Mode = "roi" | "roas" | "payback";

interface StoredState {
  mode: Mode;
  currency: string;
  investment: number;
  revenue: number;
  additionalCosts: number;
  residualValue: number;
  years: string;
  adSpend: number;
  attributedRevenue: number;
  productCost: number;
  commissions: number;
  otherCosts: number;
  paybackMode: PaybackMode;
  paybackInvestment: number;
  uniformFlow: number;
  flowsRaw: string;
  discountRateRaw: string;
}

export function RoiRoasPaybackTool() {
  const [mode, setMode] = useState<Mode>("roi");
  const [currency, setCurrency] = useState("EUR");
  const [error, setError] = useState<string | null>(null);

  // ROI
  const [investment, setInvestment] = useState(1000);
  const [revenue, setRevenue] = useState(1500);
  const [additionalCosts, setAdditionalCosts] = useState(100);
  const [residualValue, setResidualValue] = useState(0);
  const [years, setYears] = useState<string>("");

  // ROAS
  const [adSpend, setAdSpend] = useState(500);
  const [attributedRevenue, setAttributedRevenue] = useState(2000);
  const [productCost, setProductCost] = useState(600);
  const [commissions, setCommissions] = useState(100);
  const [otherCosts, setOtherCosts] = useState(0);

  // Payback
  const [paybackMode, setPaybackMode] = useState<PaybackMode>("uniform");
  const [paybackInvestment, setPaybackInvestment] = useState(5000);
  const [uniformFlow, setUniformFlow] = useState(500);
  const [flowsRaw, setFlowsRaw] = useState("800, 900, 1000, 1200, 1500");
  const [discountRateRaw, setDiscountRateRaw] = useState("");

  const roiResult = calculateRoi({
    initialInvestmentMinor: majorToMinor(investment, currency),
    revenueMinor: majorToMinor(revenue, currency),
    additionalCostsMinor: majorToMinor(additionalCosts, currency),
    residualValueMinor: majorToMinor(residualValue, currency),
    years: years ? Number(years) : undefined,
  });

  const roasResult = calculateRoas({
    adSpendMinor: majorToMinor(adSpend, currency),
    attributedRevenueMinor: majorToMinor(attributedRevenue, currency),
    productCostMinor: majorToMinor(productCost, currency),
    commissionsMinor: majorToMinor(commissions, currency),
    otherVariableCostsMinor: majorToMinor(otherCosts, currency),
  });

  const parsedFlows = flowsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .slice(0, DOCUMENT_LIMITS.roiRoas.maxCashFlows);

  const paybackResult = calculatePayback({
    mode: paybackMode,
    initialInvestmentMinor: majorToMinor(paybackInvestment, currency),
    uniformFlowMinor: majorToMinor(uniformFlow, currency),
    flows: paybackMode === "flows" ? parsedFlows.map((f) => majorToMinor(f, currency)) : undefined,
    discountRatePercent: discountRateRaw ? Number(discountRateRaw) : undefined,
  });

  function summaryText(): string {
    if (mode === "roi" && roiResult.ok) {
      return [
        `Beneficio neto: ${formatMoney(roiResult.netProfitMinor!, currency)}`,
        `ROI: ${roiResult.roiPercent!.toFixed(2)}%`,
        `Múltiplo: ${roiResult.multiple!.toFixed(2)}x`,
        roiResult.annualizedRoiPercent !== undefined ? `ROI anualizado: ${roiResult.annualizedRoiPercent.toFixed(2)}%` : null,
      ]
        .filter(Boolean)
        .join("\n");
    }
    if (mode === "roas" && roasResult.ok) {
      return [
        `ROAS: ${roasResult.roas!.toFixed(2)}x`,
        `Beneficio neto tras costes: ${formatMoney(roasResult.netProfitAfterCostsMinor!, currency)}`,
        `Retorno publicitario neto: ${formatMoney(roasResult.netAdReturnMinor!, currency)}`,
        roasResult.breakEvenRoas !== undefined ? `ROAS necesario para cubrir costes: ${roasResult.breakEvenRoas.toFixed(2)}x` : null,
      ]
        .filter(Boolean)
        .join("\n");
    }
    if (mode === "payback" && paybackResult.ok) {
      return paybackResult.neverRecovered
        ? "La inversión no se recupera dentro del rango de periodos introducido."
        : [
            `Periodo de recuperación simple: ${paybackResult.simplePaybackPeriods!.toFixed(2)} periodos`,
            paybackResult.discountedPaybackPeriods !== undefined ? `Periodo de recuperación descontado: ${paybackResult.discountedPaybackPeriods.toFixed(2)} periodos` : null,
          ]
            .filter(Boolean)
            .join("\n");
    }
    return "";
  }

  const paybackCsv = paybackResult.ok && paybackResult.schedule ? buildCsv(["Periodo", "Flujo", "Acumulado"], paybackResult.schedule.map((r) => [String(r.period), minorToMajor(r.flowMinor, currency).toFixed(2), minorToMajor(r.cumulativeMinor, currency).toFixed(2)])) : "";

  function currentState(): StoredState {
    return {
      mode,
      currency,
      investment,
      revenue,
      additionalCosts,
      residualValue,
      years,
      adSpend,
      attributedRevenue,
      productCost,
      commissions,
      otherCosts,
      paybackMode,
      paybackInvestment,
      uniformFlow,
      flowsRaw,
      discountRateRaw,
    };
  }
  function applyState(s: StoredState) {
    setMode(s.mode);
    setCurrency(s.currency);
    setInvestment(s.investment);
    setRevenue(s.revenue);
    setAdditionalCosts(s.additionalCosts);
    setResidualValue(s.residualValue);
    setYears(s.years);
    setAdSpend(s.adSpend);
    setAttributedRevenue(s.attributedRevenue);
    setProductCost(s.productCost);
    setCommissions(s.commissions);
    setOtherCosts(s.otherCosts);
    setPaybackMode(s.paybackMode);
    setPaybackInvestment(s.paybackInvestment);
    setUniformFlow(s.uniformFlow);
    setFlowsRaw(s.flowsRaw);
    setDiscountRateRaw(s.discountRateRaw);
  }
  function handleExportJson() {
    downloadTextFile(`${TOOL_ID}.json`, JSON.stringify(buildDocumentEnvelope(TOOL_ID, currentState()), null, 2), "application/json;charset=utf-8");
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
      applyState(result.data);
    });
  }

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">Los datos se procesan en tu dispositivo y no se envían al servidor.</p>
      <p className="text-xs text-muted-foreground">Los resultados son estimaciones matemáticas y no constituyen una recomendación de inversión.</p>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant={mode === "roi" ? "default" : "outline"} size="sm" onClick={() => setMode("roi")}>
          ROI
        </Button>
        <Button type="button" variant={mode === "roas" ? "default" : "outline"} size="sm" onClick={() => setMode("roas")}>
          ROAS
        </Button>
        <Button type="button" variant={mode === "payback" ? "default" : "outline"} size="sm" onClick={() => setMode("payback")}>
          Periodo de recuperación
        </Button>
      </div>

      <div>
        <Label htmlFor="rr-currency" className="mb-1">
          Moneda
        </Label>
        <Select value={currency} onValueChange={(v) => setCurrency(v as string)}>
          <SelectTrigger id="rr-currency" className="w-40">
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

      {mode === "roi" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="roi-investment" className="mb-1">
              Inversión inicial
            </Label>
            <Input id="roi-investment" type="number" min={0} step="0.01" value={investment} onChange={(e) => setInvestment(Number(e.target.value))} />
          </div>
          <div>
            <Label htmlFor="roi-revenue" className="mb-1">
              Ingresos obtenidos
            </Label>
            <Input id="roi-revenue" type="number" step="0.01" value={revenue} onChange={(e) => setRevenue(Number(e.target.value))} />
          </div>
          <div>
            <Label htmlFor="roi-costs" className="mb-1">
              Costes adicionales
            </Label>
            <Input id="roi-costs" type="number" min={0} step="0.01" value={additionalCosts} onChange={(e) => setAdditionalCosts(Number(e.target.value))} />
          </div>
          <div>
            <Label htmlFor="roi-residual" className="mb-1">
              Valor final o residual (opcional)
            </Label>
            <Input id="roi-residual" type="number" step="0.01" value={residualValue} onChange={(e) => setResidualValue(Number(e.target.value))} />
          </div>
          <div>
            <Label htmlFor="roi-years" className="mb-1">
              Duración en años (opcional, para ROI anualizado)
            </Label>
            <Input id="roi-years" type="number" min={0} step="0.1" value={years} onChange={(e) => setYears(e.target.value)} placeholder="Deja vacío para omitir" />
          </div>
        </div>
      ) : null}

      {mode === "roas" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="roas-spend" className="mb-1">
              Gasto publicitario
            </Label>
            <Input id="roas-spend" type="number" min={0} step="0.01" value={adSpend} onChange={(e) => setAdSpend(Number(e.target.value))} />
          </div>
          <div>
            <Label htmlFor="roas-revenue" className="mb-1">
              Ingresos atribuidos
            </Label>
            <Input id="roas-revenue" type="number" min={0} step="0.01" value={attributedRevenue} onChange={(e) => setAttributedRevenue(Number(e.target.value))} />
          </div>
          <div>
            <Label htmlFor="roas-product-cost" className="mb-1">
              Coste del producto o servicio (opcional)
            </Label>
            <Input id="roas-product-cost" type="number" min={0} step="0.01" value={productCost} onChange={(e) => setProductCost(Number(e.target.value))} />
          </div>
          <div>
            <Label htmlFor="roas-commissions" className="mb-1">
              Comisiones (opcional)
            </Label>
            <Input id="roas-commissions" type="number" min={0} step="0.01" value={commissions} onChange={(e) => setCommissions(Number(e.target.value))} />
          </div>
          <div>
            <Label htmlFor="roas-other" className="mb-1">
              Otros costes variables (opcional)
            </Label>
            <Input id="roas-other" type="number" min={0} step="0.01" value={otherCosts} onChange={(e) => setOtherCosts(Number(e.target.value))} />
          </div>
        </div>
      ) : null}

      {mode === "payback" ? (
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button type="button" variant={paybackMode === "uniform" ? "default" : "outline"} size="sm" onClick={() => setPaybackMode("uniform")}>
              Flujo uniforme
            </Button>
            <Button type="button" variant={paybackMode === "flows" ? "default" : "outline"} size="sm" onClick={() => setPaybackMode("flows")}>
              Flujos por periodo
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="pb-investment" className="mb-1">
                Inversión inicial
              </Label>
              <Input id="pb-investment" type="number" min={0} step="0.01" value={paybackInvestment} onChange={(e) => setPaybackInvestment(Number(e.target.value))} />
            </div>
            {paybackMode === "uniform" ? (
              <div>
                <Label htmlFor="pb-uniform" className="mb-1">
                  Flujo por periodo
                </Label>
                <Input id="pb-uniform" type="number" min={0} step="0.01" value={uniformFlow} onChange={(e) => setUniformFlow(Number(e.target.value))} />
              </div>
            ) : (
              <div className="sm:col-span-2">
                <Label htmlFor="pb-flows" className="mb-1">
                  Flujos por periodo (separados por coma)
                </Label>
                <Input id="pb-flows" value={flowsRaw} onChange={(e) => setFlowsRaw(e.target.value)} />
              </div>
            )}
            <div>
              <Label htmlFor="pb-discount" className="mb-1">
                Tasa de descuento (%, opcional)
              </Label>
              <Input id="pb-discount" type="number" min={0} step="0.01" value={discountRateRaw} onChange={(e) => setDiscountRateRaw(e.target.value)} placeholder="Deja vacío para omitir" />
            </div>
          </div>
        </div>
      ) : null}

      {mode === "roi" && !roiResult.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {roiResult.error}
        </p>
      ) : null}
      {mode === "roas" && !roasResult.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {roasResult.error}
        </p>
      ) : null}
      {mode === "payback" && !paybackResult.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {paybackResult.error}
        </p>
      ) : null}

      {mode === "roi" && roiResult.ok ? (
        <div aria-live="polite" className="grid gap-2 rounded-lg border p-4 text-sm sm:grid-cols-2">
          <p>
            Beneficio neto: <strong>{formatMoney(roiResult.netProfitMinor!, currency)}</strong>
          </p>
          <p>ROI: {roiResult.roiPercent!.toFixed(2)}%</p>
          <p>Múltiplo sobre inversión: {roiResult.multiple!.toFixed(2)}x</p>
          {roiResult.annualizedRoiPercent !== undefined ? <p>ROI anualizado: {roiResult.annualizedRoiPercent.toFixed(2)}%</p> : null}
        </div>
      ) : null}

      {mode === "roas" && roasResult.ok ? (
        <div aria-live="polite" className="grid gap-2 rounded-lg border p-4 text-sm sm:grid-cols-2">
          <p>
            ROAS: <strong>{roasResult.roas!.toFixed(2)}x</strong>
          </p>
          <p>Ingresos por unidad invertida: {roasResult.revenuePerCurrencyUnit!.toFixed(2)}</p>
          <p>Beneficio neto tras costes: {formatMoney(roasResult.netProfitAfterCostsMinor!, currency)}</p>
          <p>Retorno publicitario neto: {formatMoney(roasResult.netAdReturnMinor!, currency)}</p>
          {roasResult.breakEvenRoas !== undefined ? <p>ROAS necesario para cubrir costes: {roasResult.breakEvenRoas.toFixed(2)}x</p> : null}
        </div>
      ) : null}

      {mode === "payback" && paybackResult.ok ? (
        <div aria-live="polite" className="space-y-4 rounded-lg border p-4 text-sm">
          {paybackResult.neverRecovered ? (
            <p>La inversión no se recupera dentro del rango de periodos introducido.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <p>
                Periodo de recuperación simple: <strong>{paybackResult.simplePaybackPeriods!.toFixed(2)} periodos</strong>
              </p>
              {paybackResult.discountedPaybackPeriods !== undefined ? <p>Periodo de recuperación descontado: {paybackResult.discountedPaybackPeriods.toFixed(2)} periodos</p> : null}
            </div>
          )}
          {paybackResult.schedule && paybackResult.schedule.length > 0 ? (
            <AccessibleChart
              title="Saldo acumulado por periodo"
              type="line"
              series={[{ name: "Saldo acumulado", color: "#3b82f6", points: paybackResult.schedule.map((r) => ({ label: String(r.period), value: minorToMajor(r.cumulativeMinor, currency) })) }]}
              valueFormatter={(v) => formatMoney(majorToMinor(v, currency), currency)}
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
        <Button type="button" variant="outline" onClick={() => downloadTextFile("roi-roas-recuperacion.txt", summaryText())} disabled={!summaryText()}>
          Descargar informe
        </Button>
        {mode === "payback" ? (
          <Button type="button" variant="outline" onClick={() => downloadTextFile("recuperacion.csv", paybackCsv, "text/csv;charset=utf-8")} disabled={!paybackCsv}>
            Descargar CSV
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={handleExportJson}>
          Exportar JSON
        </Button>
        <ResetButton
          onReset={() => {
            setMode("roi");
            setCurrency("EUR");
            setInvestment(1000);
            setRevenue(1500);
            setAdditionalCosts(100);
            setResidualValue(0);
            setYears("");
            setAdSpend(500);
            setAttributedRevenue(2000);
            setProductCost(600);
            setCommissions(100);
            setOtherCosts(0);
            setPaybackMode("uniform");
            setPaybackInvestment(5000);
            setUniformFlow(500);
            setFlowsRaw("800, 900, 1000, 1200, 1500");
            setDiscountRateRaw("");
            setError(null);
          }}
        />
      </div>

      <FileUploadZone accept="application/json" onFilesSelected={handleImportJson} label="Importar un escenario guardado previamente" hint="" />
    </div>
  );
}
