"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CopyButton, DownloadButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { Button } from "@/components/ui/button";
import { calculateLoan, type LoanTermUnit, type PaymentFrequency } from "@/lib/public-tools/finance/loan";
import { formatMoney, toMinorUnits } from "@/lib/public-tools/finance/money";
import { parseNumericInput } from "@/lib/public-tools/utilities/validation";
import { todayAsCalendarDate, calendarDateToIso, parseIsoDateInput } from "@/lib/public-tools/utilities/dates";
import { buildCsv, downloadTextFile } from "@/lib/public-tools/csv-export";

const MAX_ROWS_DISPLAYED = 600;

export function LoanCalculatorTool() {
  const [principalRaw, setPrincipalRaw] = useState("20000");
  const [rateRaw, setRateRaw] = useState("6.5");
  const [termValueRaw, setTermValueRaw] = useState("5");
  const [termUnit, setTermUnit] = useState<LoanTermUnit>("years");
  const [frequency, setFrequency] = useState<PaymentFrequency>("monthly");
  const [startDateRaw, setStartDateRaw] = useState(calendarDateToIso(todayAsCalendarDate()));
  const [extraRecurringRaw, setExtraRecurringRaw] = useState("0");
  const [extraOnceRaw, setExtraOnceRaw] = useState("0");
  const [feeRaw, setFeeRaw] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);

  function handleCalculate() {
    setError(null);
    setShowTable(true);
  }

  const principal = parseNumericInput(principalRaw, "El importe principal");
  const rate = parseNumericInput(rateRaw, "La tasa anual");
  const termValue = parseNumericInput(termValueRaw, "El plazo");
  const startDate = parseIsoDateInput(startDateRaw);
  const extraRecurring = parseNumericInput(extraRecurringRaw || "0", "El pago adicional recurrente");
  const extraOnce = parseNumericInput(extraOnceRaw || "0", "El pago adicional único");
  const fee = parseNumericInput(feeRaw || "0", "La comisión inicial");

  const canCompute = principal.ok && rate.ok && termValue.ok && startDate && extraRecurring.ok && extraOnce.ok && fee.ok;
  const result = canCompute
    ? calculateLoan({
        principal: principal.value!,
        annualRatePercent: rate.value!,
        termValue: termValue.value!,
        termUnit,
        frequency,
        startDate: startDate!,
        extraPaymentRecurring: extraRecurring.value,
        extraPaymentOnce: extraOnce.value,
        originationFee: fee.value,
      })
    : null;

  function handleReset() {
    setPrincipalRaw("20000");
    setRateRaw("6.5");
    setTermValueRaw("5");
    setExtraRecurringRaw("0");
    setExtraOnceRaw("0");
    setFeeRaw("0");
    setError(null);
    setShowTable(false);
  }

  const summary =
    result?.ok
      ? [
          `Pago periódico: ${formatMoney(toMinorUnits(result.periodicPayment!))}`,
          `Número de pagos: ${result.actualNumberOfPayments}`,
          `Interés total: ${formatMoney(toMinorUnits(result.totalInterest!))}`,
          `Capital total: ${formatMoney(toMinorUnits(result.totalPrincipal!))}`,
          `Coste total: ${formatMoney(toMinorUnits(result.totalCost!))}`,
          result.paymentsSaved ? `Pagos ahorrados con aportes extra: ${result.paymentsSaved}` : null,
          result.interestSaved ? `Interés ahorrado: ${formatMoney(toMinorUnits(result.interestSaved))}` : null,
        ]
          .filter(Boolean)
          .join("\n")
      : "";

  const csv = result?.ok
    ? buildCsv(
        ["Pago #", "Fecha", "Pago", "Capital", "Interés", "Extra", "Saldo"],
        result.schedule!.map((row) => [
          String(row.paymentNumber),
          `${row.date.year}-${String(row.date.month).padStart(2, "0")}-${String(row.date.day).padStart(2, "0")}`,
          row.payment.toFixed(2),
          row.principal.toFixed(2),
          row.interest.toFixed(2),
          row.extraPayment.toFixed(2),
          row.balance.toFixed(2),
        ])
      )
    : "";

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
        Este cálculo es educativo y no constituye una oferta de crédito ni asesoramiento financiero.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="loan-principal" className="mb-1">
            Importe principal
          </Label>
          <Input id="loan-principal" value={principalRaw} onChange={(e) => setPrincipalRaw(e.target.value)} inputMode="decimal" />
        </div>
        <div>
          <Label htmlFor="loan-rate" className="mb-1">
            Tasa anual nominal (%)
          </Label>
          <Input id="loan-rate" value={rateRaw} onChange={(e) => setRateRaw(e.target.value)} inputMode="decimal" />
        </div>
        <div>
          <Label htmlFor="loan-term" className="mb-1">
            Plazo
          </Label>
          <div className="flex gap-2">
            <Input id="loan-term" value={termValueRaw} onChange={(e) => setTermValueRaw(e.target.value)} inputMode="decimal" />
            <Select value={termUnit} onValueChange={(v) => setTermUnit(v as LoanTermUnit)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="months">Meses</SelectItem>
                <SelectItem value="years">Años</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label htmlFor="loan-frequency" className="mb-1">
            Frecuencia de pago
          </Label>
          <Select value={frequency} onValueChange={(v) => setFrequency(v as PaymentFrequency)}>
            <SelectTrigger id="loan-frequency" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Mensual</SelectItem>
              <SelectItem value="biweekly">Quincenal</SelectItem>
              <SelectItem value="weekly">Semanal</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="loan-start" className="mb-1">
            Fecha inicial
          </Label>
          <Input id="loan-start" type="date" value={startDateRaw} onChange={(e) => setStartDateRaw(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="loan-fee" className="mb-1">
            Comisión inicial (opcional)
          </Label>
          <Input id="loan-fee" value={feeRaw} onChange={(e) => setFeeRaw(e.target.value)} inputMode="decimal" />
        </div>
        <div>
          <Label htmlFor="loan-extra-recurring" className="mb-1">
            Pago adicional recurrente (opcional)
          </Label>
          <Input id="loan-extra-recurring" value={extraRecurringRaw} onChange={(e) => setExtraRecurringRaw(e.target.value)} inputMode="decimal" />
        </div>
        <div>
          <Label htmlFor="loan-extra-once" className="mb-1">
            Pago adicional único, primer pago (opcional)
          </Label>
          <Input id="loan-extra-once" value={extraOnceRaw} onChange={(e) => setExtraOnceRaw(e.target.value)} inputMode="decimal" />
        </div>
      </div>

      <Button type="button" onClick={handleCalculate}>
        Calcular préstamo
      </Button>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {showTable && result && !result.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {result.error}
        </p>
      ) : null}

      {showTable && result?.ok ? (
        <div aria-live="polite" className="space-y-4 rounded-lg border p-4">
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <p>
              Pago periódico: <strong>{formatMoney(toMinorUnits(result.periodicPayment!))}</strong>
            </p>
            <p>Número de pagos: {result.actualNumberOfPayments}</p>
            <p>Interés total: {formatMoney(toMinorUnits(result.totalInterest!))}</p>
            <p>Capital total: {formatMoney(toMinorUnits(result.totalPrincipal!))}</p>
            <p>Coste total estimado: {formatMoney(toMinorUnits(result.totalCost!))}</p>
            {result.paymentsSaved ? <p>Pagos ahorrados: {result.paymentsSaved}</p> : null}
            {result.interestSaved ? <p>Interés ahorrado: {formatMoney(toMinorUnits(result.interestSaved))}</p> : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <CopyButton text={summary} label="Copiar resumen" />
            <DownloadButton content={summary} filename="resumen-prestamo.txt" label="Descargar resumen" />
            <Button type="button" variant="outline" size="sm" onClick={() => downloadTextFile("tabla-amortizacion.csv", csv, "text/csv;charset=utf-8")}>
              Descargar tabla CSV
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
              Imprimir
            </Button>
          </div>

          <div className="max-h-96 overflow-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th scope="col" className="p-2 text-left">
                    #
                  </th>
                  <th scope="col" className="p-2 text-left">
                    Fecha
                  </th>
                  <th scope="col" className="p-2 text-right">
                    Pago
                  </th>
                  <th scope="col" className="p-2 text-right">
                    Capital
                  </th>
                  <th scope="col" className="p-2 text-right">
                    Interés
                  </th>
                  <th scope="col" className="p-2 text-right">
                    Extra
                  </th>
                  <th scope="col" className="p-2 text-right">
                    Saldo
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.schedule!.slice(0, MAX_ROWS_DISPLAYED).map((row) => (
                  <tr key={row.paymentNumber} className="border-t">
                    <td className="p-2">{row.paymentNumber}</td>
                    <td className="p-2">
                      {row.date.year}-{String(row.date.month).padStart(2, "0")}-{String(row.date.day).padStart(2, "0")}
                    </td>
                    <td className="p-2 text-right">{formatMoney(toMinorUnits(row.payment))}</td>
                    <td className="p-2 text-right">{formatMoney(toMinorUnits(row.principal))}</td>
                    <td className="p-2 text-right">{formatMoney(toMinorUnits(row.interest))}</td>
                    <td className="p-2 text-right">{formatMoney(toMinorUnits(row.extraPayment))}</td>
                    <td className="p-2 text-right">{formatMoney(toMinorUnits(row.balance))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <ResetButton onReset={handleReset} />
    </div>
  );
}
