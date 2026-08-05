"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { parseTimeToMs, formatMsToTimecode } from "@/lib/public-tools/media/timeline";

/**
 * Shared start/end time editor for every trim-style tool (spec section
 * 16: "los usuarios deben poder escribir tiempos manualmente... debe
 * existir alternativa accesible a arrastrar/mover manejadores"). This is
 * the ONLY input method offered right now — plain, labeled text fields
 * that accept HH:MM:SS.mmm, MM:SS.mmm, or plain seconds, which is a real,
 * fully keyboard- and screen-reader-accessible alternative to a waveform
 * drag handle by construction, not an afterthought bolted onto one.
 */
export function MediaTimeRangeEditor({
  idPrefix,
  startMs,
  endMs,
  durationMs,
  onChange,
}: {
  idPrefix: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  onChange: (next: { startMs: number; endMs: number }) => void;
}) {
  const [startText, setStartText] = useState(formatMsToTimecode(startMs, false));
  const [endText, setEndText] = useState(formatMsToTimecode(endMs, false));
  const [error, setError] = useState<string | null>(null);

  // React's own "adjusting state when a prop changes" pattern — setState called during render
  // (never inside an effect) so the corrected text is ready in the SAME render/commit, with no
  // extra pass. Real bug found via Fase 45 browser correction: startMs/endMs frequently change
  // AFTER this component first mounts (e.g. video/audio duration is read asynchronously once
  // metadata loads) — the useState initializers above only run once, so without this the
  // displayed fields stayed stuck at their initial value (usually "00:00.000") even though the
  // real startMs/endMs used for processing were already correct, silently misleading the visitor
  // about what range they were about to process.
  const [prevStartMs, setPrevStartMs] = useState(startMs);
  if (startMs !== prevStartMs) {
    setPrevStartMs(startMs);
    setStartText(formatMsToTimecode(startMs, false));
  }
  const [prevEndMs, setPrevEndMs] = useState(endMs);
  if (endMs !== prevEndMs) {
    setPrevEndMs(endMs);
    setEndText(formatMsToTimecode(endMs, false));
  }

  function commit(field: "start" | "end", raw: string) {
    const parsed = parseTimeToMs(raw);
    if (!parsed.ok || parsed.milliseconds === undefined) {
      setError(parsed.error ?? "Tiempo inválido.");
      return;
    }
    setError(null);
    if (field === "start") onChange({ startMs: parsed.milliseconds, endMs });
    else onChange({ startMs, endMs: parsed.milliseconds });
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor={`${idPrefix}-start`} className="mb-1">
            Inicio
          </Label>
          <Input id={`${idPrefix}-start`} value={startText} onChange={(e) => setStartText(e.target.value)} onBlur={() => commit("start", startText)} placeholder="00:00.000" />
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-end`} className="mb-1">
            Final
          </Label>
          <Input id={`${idPrefix}-end`} value={endText} onChange={(e) => setEndText(e.target.value)} onBlur={() => commit("end", endText)} placeholder="00:05.000" />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setStartText(formatMsToTimecode(0, false));
            commit("start", formatMsToTimecode(0, false));
          }}
        >
          Inicio = 0
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            const text = formatMsToTimecode(durationMs, false);
            setEndText(text);
            commit("end", text);
          }}
          disabled={durationMs <= 0}
        >
          Final = duración total
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Duración seleccionada: {formatMsToTimecode(Math.max(0, endMs - startMs), false)}
        {durationMs > 0 ? ` de ${formatMsToTimecode(durationMs, false)}` : ""}
      </p>
    </div>
  );
}
