"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CopyButton, DownloadButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { parseCronExpression, explainCron, computeNextExecutions, CRON_PRESETS } from "@/lib/public-tools/development/cron";

const COMMON_TIMEZONES = ["UTC", "Europe/Madrid", "America/Mexico_City", "America/Bogota", "America/Argentina/Buenos_Aires", "America/New_York", "America/Los_Angeles"];

export function CronGeneratorTool() {
  const [expression, setExpression] = useState("0 9 * * 1-5");
  const [timeZone, setTimeZone] = useState("UTC");
  const [count, setCount] = useState(5);

  const parseResult = useMemo(() => parseCronExpression(expression), [expression]);
  const nextExecutions = useMemo(() => {
    if (!parseResult.ok || !parseResult.cron) return null;
    return computeNextExecutions(parseResult.cron, count, timeZone);
  }, [parseResult, count, timeZone]);

  function handleReset() {
    setExpression("0 9 * * 1-5");
    setTimeZone("UTC");
    setCount(5);
  }

  const formatter = useMemo(() => new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short", timeZone }), [timeZone]);

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">Sintaxis cron estándar de cinco campos: minuto hora día-del-mes mes día-de-la-semana.</p>

      <div className="flex flex-wrap gap-2">
        {CRON_PRESETS.map((preset) => (
          <Button key={preset.name} type="button" variant="outline" size="sm" onClick={() => setExpression(preset.expression)}>
            {preset.name}
          </Button>
        ))}
      </div>

      <div>
        <Label htmlFor="cron-expression" className="mb-1">
          Expresión cron
        </Label>
        <Input id="cron-expression" value={expression} onChange={(e) => setExpression(e.target.value)} className="font-mono" placeholder="* * * * *" />
      </div>

      {!parseResult.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {parseResult.error}
        </p>
      ) : (
        <div aria-live="polite" className="space-y-2 rounded-lg border p-4 text-sm">
          <p className="font-medium">{explainCron(parseResult.cron!)}</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="cron-timezone" className="mb-1">
            Zona horaria IANA
          </Label>
          <Input id="cron-timezone" list="cron-timezone-list" value={timeZone} onChange={(e) => setTimeZone(e.target.value)} />
          <datalist id="cron-timezone-list">
            {COMMON_TIMEZONES.map((tz) => (
              <option key={tz} value={tz} />
            ))}
          </datalist>
        </div>
        <div>
          <Label htmlFor="cron-count" className="mb-1">
            Cantidad de próximas ejecuciones
          </Label>
          <Input id="cron-count" type="number" min={1} max={50} value={count} onChange={(e) => setCount(Number(e.target.value))} />
        </div>
      </div>

      {nextExecutions ? (
        <div aria-live="polite" className="space-y-2 rounded-lg border p-4 text-sm">
          <p className="font-medium">Próximas ejecuciones ({timeZone})</p>
          {nextExecutions.dates.length === 0 ? (
            <p className="text-muted-foreground">No se encontraron próximas ejecuciones en el rango de búsqueda.</p>
          ) : (
            <ul className="list-disc space-y-1 pl-5">
              {nextExecutions.dates.map((date, i) => (
                <li key={i}>{formatter.format(date)}</li>
              ))}
            </ul>
          )}
          {nextExecutions.limitedByTime || nextExecutions.limitedBySteps ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">La búsqueda se detuvo por un límite de tiempo/pasos antes de encontrar todas las ejecuciones solicitadas.</p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <CopyButton text={expression} label="Copiar expresión" />
        <DownloadButton content={expression} filename="cron.txt" mimeType="text/plain" label="Descargar" />
        <ResetButton onReset={handleReset} />
      </div>

      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">La ejecución final depende del sistema o servicio donde instales la expresión cron.</p>
    </div>
  );
}
