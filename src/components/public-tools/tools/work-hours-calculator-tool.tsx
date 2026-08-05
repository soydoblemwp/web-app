"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CopyButton, DownloadButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { summarizeWeek, formatMinutesAsHours, type Shift, type WorkHoursOptions } from "@/lib/public-tools/productivity/work-hours";
import { formatMoney, toMinorUnits } from "@/lib/public-tools/finance/money";
import { buildCsv, downloadTextFile } from "@/lib/public-tools/csv-export";
import { parseNumericInput } from "@/lib/public-tools/utilities/validation";

function newShift(day: string): Shift {
  return { id: `s-${Date.now()}-${Math.random().toString(36).slice(2)}`, day, startMinutes: 9 * 60, endMinutes: 17 * 60, unpaidBreakMinutes: 30, paidBreakMinutes: 0 };
}

function minutesToTimeInput(minutes: number): string {
  return `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function WorkHoursCalculatorTool() {
  const [shifts, setShifts] = useState<Shift[]>([newShift("Lunes"), newShift("Martes")]);
  const [rateRaw, setRateRaw] = useState("15");
  const [overtimeEnabled, setOvertimeEnabled] = useState(true);
  const [thresholdRaw, setThresholdRaw] = useState("40");
  const [multiplierRaw, setMultiplierRaw] = useState("1.5");

  function updateShift(id: string, patch: Partial<Shift>) {
    setShifts((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function addShift() {
    setShifts((prev) => [...prev, newShift(prev[prev.length - 1]?.day ?? "Lunes")]);
  }
  function duplicateShift(id: string) {
    setShifts((prev) => {
      const found = prev.find((s) => s.id === id);
      if (!found) return prev;
      return [...prev, { ...found, id: `s-${Date.now()}-${Math.random().toString(36).slice(2)}` }];
    });
  }
  function removeShift(id: string) {
    setShifts((prev) => prev.filter((s) => s.id !== id));
  }

  const rate = parseNumericInput(rateRaw, "La tarifa por hora");
  const threshold = parseNumericInput(thresholdRaw || "0", "El umbral de horas extra");
  const multiplier = parseNumericInput(multiplierRaw || "1", "El multiplicador de horas extra");

  const options: WorkHoursOptions = {
    overtimeEnabled,
    overtimeThresholdHours: threshold.ok ? threshold.value! : 40,
    overtimeMultiplier: multiplier.ok ? multiplier.value! : 1.5,
    defaultHourlyRate: rate.ok ? rate.value! : 0,
  };

  const summary = summarizeWeek(shifts, options);

  const csv = buildCsv(
    ["Día", "Entrada", "Salida", "Descanso no pagado (min)", "Descanso pagado (min)"],
    shifts.map((s) => [s.day, minutesToTimeInput(s.startMinutes), minutesToTimeInput(s.endMinutes), String(s.unpaidBreakMinutes), String(s.paidBreakMinutes)])
  );

  function handleReset() {
    setShifts([newShift("Lunes"), newShift("Martes")]);
    setRateRaw("15");
    setThresholdRaw("40");
    setMultiplierRaw("1.5");
  }

  const summaryText = [
    `Total horas: ${formatMinutesAsHours(summary.totalNetMinutes)}`,
    `Horas regulares: ${formatMinutesAsHours(summary.regularMinutes)}`,
    `Horas extra: ${formatMinutesAsHours(summary.overtimeMinutes)}`,
    `Pago regular: ${formatMoney(toMinorUnits(summary.regularPay))}`,
    `Pago extra: ${formatMoney(toMinorUnits(summary.overtimePay))}`,
    `Pago total: ${formatMoney(toMinorUnits(summary.totalPay))}`,
  ].join("\n");

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
        Configura las reglas de horas extra según tu contrato y la normativa aplicable. Esta herramienta no ofrece asesoramiento laboral.
      </p>

      <div className="space-y-2">
        {shifts.map((shift) => (
          <div key={shift.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-6">
            <Input aria-label="Día" value={shift.day} onChange={(e) => updateShift(shift.id, { day: e.target.value })} placeholder="Día" />
            <Input aria-label="Hora de entrada" type="time" value={minutesToTimeInput(shift.startMinutes)} onChange={(e) => {
              const [h, m] = e.target.value.split(":").map(Number);
              updateShift(shift.id, { startMinutes: h * 60 + m });
            }} />
            <Input aria-label="Hora de salida" type="time" value={minutesToTimeInput(shift.endMinutes)} onChange={(e) => {
              const [h, m] = e.target.value.split(":").map(Number);
              updateShift(shift.id, { endMinutes: h * 60 + m });
            }} />
            <Input aria-label="Descanso no pagado (minutos)" type="number" min={0} value={shift.unpaidBreakMinutes} onChange={(e) => updateShift(shift.id, { unpaidBreakMinutes: Number(e.target.value) })} />
            <Input aria-label="Tarifa por hora de este turno (opcional)" type="number" min={0} placeholder="Tarifa (opcional)" value={shift.hourlyRate ?? ""} onChange={(e) => updateShift(shift.id, { hourlyRate: e.target.value === "" ? undefined : Number(e.target.value) })} />
            <div className="flex gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => duplicateShift(shift.id)}>
                Duplicar
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => removeShift(shift.id)}>
                Eliminar
              </Button>
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addShift}>
          Añadir turno
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <div>
          <Label htmlFor="wh-rate" className="mb-1">
            Tarifa por hora (por defecto)
          </Label>
          <Input id="wh-rate" value={rateRaw} onChange={(e) => setRateRaw(e.target.value)} inputMode="decimal" />
        </div>
        <div className="flex items-end gap-2">
          <Checkbox checked={overtimeEnabled} onCheckedChange={(c) => setOvertimeEnabled(Boolean(c))} id="wh-ot-enabled" />
          <Label htmlFor="wh-ot-enabled">Horas extra habilitadas</Label>
        </div>
        <div>
          <Label htmlFor="wh-threshold" className="mb-1">
            Umbral semanal (horas)
          </Label>
          <Input id="wh-threshold" value={thresholdRaw} onChange={(e) => setThresholdRaw(e.target.value)} inputMode="decimal" disabled={!overtimeEnabled} />
        </div>
        <div>
          <Label htmlFor="wh-multiplier" className="mb-1">
            Multiplicador de horas extra
          </Label>
          <Input id="wh-multiplier" value={multiplierRaw} onChange={(e) => setMultiplierRaw(e.target.value)} inputMode="decimal" disabled={!overtimeEnabled} />
        </div>
      </div>

      <div aria-live="polite" className="grid gap-2 rounded-lg border p-4 text-sm sm:grid-cols-3">
        <p>Total horas: {formatMinutesAsHours(summary.totalNetMinutes)}</p>
        <p>Regulares: {formatMinutesAsHours(summary.regularMinutes)}</p>
        <p>Extra: {formatMinutesAsHours(summary.overtimeMinutes)}</p>
        <p>Pago regular: {formatMoney(toMinorUnits(summary.regularPay))}</p>
        <p>Pago extra: {formatMoney(toMinorUnits(summary.overtimePay))}</p>
        <p className="font-semibold">Pago total: {formatMoney(toMinorUnits(summary.totalPay))}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <CopyButton text={summaryText} label="Copiar resumen" />
        <DownloadButton content={summaryText} filename="resumen-horas.txt" label="Descargar resumen" />
        <Button type="button" variant="outline" size="sm" onClick={() => downloadTextFile("hoja-de-tiempo.csv", csv, "text/csv;charset=utf-8")}>
          Exportar CSV
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
          Imprimir hoja de tiempo
        </Button>
      </div>

      <ResetButton onReset={handleReset} />
    </div>
  );
}
