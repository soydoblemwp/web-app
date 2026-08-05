"use client";

import { useMemo, useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import { CopyButton, DownloadButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import {
  parseSubtitles,
  buildSrt,
  buildVtt,
  shiftAllTimes,
  findOverlaps,
  findInvalidDurations,
  findDangerousCueContent,
  sanitizeCueTextToHtml,
  type SubtitleCue,
} from "@/lib/public-tools/media/subtitles";
import { parseTimeToMs, formatMsToTimecode } from "@/lib/public-tools/media/timeline";

export function SubtitleEditorTool() {
  const [rawInput, setRawInput] = useState("");
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [parsed, setParsed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shiftText, setShiftText] = useState("0");
  const [searchText, setSearchText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const cueSeedRef = useRef(0);

  function handleParse(text = rawInput) {
    const result = parseSubtitles(text);
    if (!result.ok && result.cues.length === 0) {
      setError(result.findings[0]?.message ?? "No se pudo analizar el archivo.");
      setParsed(false);
      return;
    }
    setCues(result.cues);
    setParsed(true);
    setError(result.findings.length > 0 ? `Se analizó con ${result.findings.length} advertencia(s); revisa los cues marcados.` : null);
  }

  function handleFileLoad(files: File[]) {
    const f = files[0];
    if (!f) return;
    f.text().then((text) => {
      setRawInput(text);
      handleParse(text);
    });
  }

  function updateCue(id: string, patch: Partial<SubtitleCue>) {
    setCues((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }
  function removeCue(id: string) {
    setCues((prev) => prev.filter((c) => c.id !== id));
  }
  function duplicateCue(id: string) {
    setCues((prev) => {
      const index = prev.findIndex((c) => c.id === id);
      if (index === -1) return prev;
      cueSeedRef.current += 1;
      const copy = { ...prev[index], id: `dup-${cueSeedRef.current}` };
      return [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)];
    });
  }
  function addCue() {
    cueSeedRef.current += 1;
    setCues((prev) => [...prev, { id: `new-${cueSeedRef.current}`, startMs: 0, endMs: 2000, text: "" }]);
  }
  function sortCues() {
    setCues((prev) => [...prev].sort((a, b) => a.startMs - b.startMs));
  }

  function handleShift() {
    const parsedTime = parseTimeToMs(shiftText.replace(/^-/, ""));
    if (!parsedTime.ok || parsedTime.milliseconds === undefined) return;
    const deltaMs = shiftText.trim().startsWith("-") ? -parsedTime.milliseconds : parsedTime.milliseconds;
    setCues((prev) => shiftAllTimes(prev, deltaMs));
  }

  function handleReplace() {
    if (!searchText) return;
    setCues((prev) => prev.map((c) => ({ ...c, text: c.text.split(searchText).join(replaceText) })));
  }

  const overlaps = useMemo(() => findOverlaps(cues), [cues]);
  const invalidDurations = useMemo(() => findInvalidDurations(cues), [cues]);
  const dangerousCues = useMemo(() => findDangerousCueContent(cues), [cues]);

  const srtOutput = useMemo(() => buildSrt(cues), [cues]);
  const vttOutput = useMemo(() => buildVtt(cues), [cues]);

  function handleReset() {
    setRawInput("");
    setCues([]);
    setParsed(false);
    setError(null);
  }

  return (
    <div className="space-y-6">
      {!parsed ? (
        <div className="space-y-3">
          <Label htmlFor="subtitle-input" className="mb-1">
            Pega el contenido SRT o WebVTT
          </Label>
          <Textarea id="subtitle-input" value={rawInput} onChange={(e) => setRawInput(e.target.value)} rows={10} className="font-mono text-xs" />
          <FileUploadZone accept=".srt,.vtt,text/vtt,application/x-subrip,text/plain" onFilesSelected={handleFileLoad} label="o carga un archivo .srt/.vtt" hint="" />
          <Button type="button" onClick={() => handleParse()}>
            Analizar
          </Button>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          {error ? <p className="text-sm text-amber-600 dark:text-amber-400">{error}</p> : null}
          {dangerousCues.length > 0 ? (
            <p role="alert" className="text-sm text-destructive">
              {dangerousCues.length} cue(s) contienen contenido potencialmente peligroso (scripts o URLs); se mostrarán siempre como texto escapado, nunca como HTML activo.
            </p>
          ) : null}

          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor="subtitle-shift" className="mb-1">
                Desplazar todos los tiempos
              </Label>
              <Input id="subtitle-shift" value={shiftText} onChange={(e) => setShiftText(e.target.value)} placeholder="1.5 o -1.5 (segundos)" className="w-40" />
            </div>
            <Button type="button" variant="outline" size="sm" onClick={handleShift}>
              Aplicar desplazamiento
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={sortCues}>
              Ordenar por tiempo
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={addCue}>
              Añadir cue
            </Button>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor="subtitle-search" className="mb-1">
                Buscar
              </Label>
              <Input id="subtitle-search" value={searchText} onChange={(e) => setSearchText(e.target.value)} className="w-40" />
            </div>
            <div>
              <Label htmlFor="subtitle-replace" className="mb-1">
                Reemplazar por
              </Label>
              <Input id="subtitle-replace" value={replaceText} onChange={(e) => setReplaceText(e.target.value)} className="w-40" />
            </div>
            <Button type="button" variant="outline" size="sm" onClick={handleReplace}>
              Reemplazar todo
            </Button>
          </div>

          <div aria-live="polite" className="space-y-1 text-sm">
            <p>{cues.length} cue(s)</p>
            {overlaps.length > 0 ? <p className="text-amber-600 dark:text-amber-400">{overlaps.length} solapamiento(s) detectado(s).</p> : null}
            {invalidDurations.length > 0 ? <p className="text-amber-600 dark:text-amber-400">{invalidDurations.length} cue(s) con duración inválida.</p> : null}
          </div>

          <div className="max-h-96 space-y-2 overflow-y-auto">
            {cues.map((cue, index) => {
              const hasOverlap = overlaps.some((o) => o.cueAId === cue.id || o.cueBId === cue.id);
              const hasInvalidDuration = invalidDurations.includes(cue.id);
              return (
                <div key={cue.id} className={`space-y-2 rounded-lg border p-3 ${hasOverlap || hasInvalidDuration ? "border-amber-400/60" : ""}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">#{index + 1}</span>
                    <Input
                      aria-label={`Inicio cue ${index + 1}`}
                      value={formatMsToTimecode(cue.startMs, false)}
                      onChange={(e) => {
                        const parsedT = parseTimeToMs(e.target.value);
                        if (parsedT.ok && parsedT.milliseconds !== undefined) updateCue(cue.id, { startMs: parsedT.milliseconds });
                      }}
                      className="w-32"
                    />
                    <span>→</span>
                    <Input
                      aria-label={`Final cue ${index + 1}`}
                      value={formatMsToTimecode(cue.endMs, false)}
                      onChange={(e) => {
                        const parsedT = parseTimeToMs(e.target.value);
                        if (parsedT.ok && parsedT.milliseconds !== undefined) updateCue(cue.id, { endMs: parsedT.milliseconds });
                      }}
                      className="w-32"
                    />
                    <Button type="button" variant="ghost" size="sm" onClick={() => duplicateCue(cue.id)}>
                      Duplicar
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeCue(cue.id)}>
                      Eliminar
                    </Button>
                  </div>
                  <Textarea aria-label={`Texto cue ${index + 1}`} value={cue.text} onChange={(e) => updateCue(cue.id, { text: e.target.value })} rows={2} />
                  <div className="rounded border bg-muted/30 p-2 text-sm" dangerouslySetInnerHTML={{ __html: sanitizeCueTextToHtml(cue.text) || "&nbsp;" }} />
                  {hasOverlap ? <p className="text-xs text-amber-600 dark:text-amber-400">Se solapa con otro cue.</p> : null}
                  {hasInvalidDuration ? <p className="text-xs text-amber-600 dark:text-amber-400">Duración inválida (final antes o casi igual al inicio).</p> : null}
                </div>
              );
            })}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="mb-1">SRT</Label>
              <Textarea readOnly value={srtOutput} rows={6} className="font-mono text-xs" />
              <div className="flex flex-wrap gap-2">
                <CopyButton text={srtOutput} label="Copiar SRT" />
                <DownloadButton content={srtOutput} filename="subtitulos.srt" mimeType="text/plain" label="Descargar .srt" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="mb-1">WebVTT</Label>
              <Textarea readOnly value={vttOutput} rows={6} className="font-mono text-xs" />
              <div className="flex flex-wrap gap-2">
                <CopyButton text={vttOutput} label="Copiar VTT" />
                <DownloadButton content={vttOutput} filename="subtitulos.vtt" mimeType="text/vtt" label="Descargar .vtt" />
              </div>
            </div>
          </div>
        </div>
      )}

      <ResetButton onReset={handleReset} />
    </div>
  );
}
