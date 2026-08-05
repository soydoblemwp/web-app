"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CopyButton, DownloadButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { buildGradientCss, buildGradientDeclaration, isStructurallyValidGradientCss, GRADIENT_PRESETS, type GradientOptions, type GradientType } from "@/lib/public-tools/design/css-gradient";

const TYPE_LABELS: Record<GradientType, string> = {
  linear: "Lineal",
  radial: "Radial",
  conic: "Cónico",
  "repeating-linear": "Lineal repetido",
  "repeating-radial": "Radial repetido",
  "repeating-conic": "Cónico repetido",
};

export function CssGradientTool() {
  const [options, setOptions] = useState<GradientOptions>(GRADIENT_PRESETS[0].options);

  function updateStop(index: number, field: "color" | "alpha" | "position", value: string | number) {
    setOptions((prev) => ({ ...prev, stops: prev.stops.map((s, i) => (i === index ? { ...s, [field]: value } : s)) }));
  }
  function addStop() {
    setOptions((prev) => ({ ...prev, stops: [...prev.stops, { color: "#000000", alpha: 1, position: 100 }] }));
  }
  function removeStop(index: number) {
    setOptions((prev) => (prev.stops.length > 2 ? { ...prev, stops: prev.stops.filter((_, i) => i !== index) } : prev));
  }

  const css = useMemo(() => buildGradientCss(options), [options]);
  const declaration = useMemo(() => buildGradientDeclaration(options), [options]);
  const isValid = useMemo(() => isStructurallyValidGradientCss(css), [css]);

  return (
    <div className="space-y-6">
      <div>
        <Label htmlFor="gradient-type" className="mb-1">
          Tipo
        </Label>
        <Select value={options.type} onValueChange={(v) => setOptions((prev) => ({ ...prev, type: v as GradientType }))}>
          <SelectTrigger id="gradient-type" className="w-full sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(TYPE_LABELS) as GradientType[]).map((t) => (
              <SelectItem key={t} value={t}>
                {TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {options.type.includes("linear") ? (
        <div>
          <Label htmlFor="gradient-angle" className="mb-1">
            Ángulo: {options.angleDeg}°
          </Label>
          <Input id="gradient-angle" type="range" min={0} max={360} value={options.angleDeg} onChange={(e) => setOptions((prev) => ({ ...prev, angleDeg: Number(e.target.value) }))} />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          {options.type.includes("radial") ? (
            <div>
              <Label htmlFor="gradient-shape" className="mb-1">
                Forma
              </Label>
              <Select value={options.shape} onValueChange={(v) => setOptions((prev) => ({ ...prev, shape: v as "circle" | "ellipse" }))}>
                <SelectTrigger id="gradient-shape" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="circle">Círculo</SelectItem>
                  <SelectItem value="ellipse">Elipse</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div>
              <Label htmlFor="gradient-angle-conic" className="mb-1">
                Ángulo inicial: {options.angleDeg}°
              </Label>
              <Input id="gradient-angle-conic" type="range" min={0} max={360} value={options.angleDeg} onChange={(e) => setOptions((prev) => ({ ...prev, angleDeg: Number(e.target.value) }))} />
            </div>
          )}
          <div>
            <Label htmlFor="gradient-cx" className="mb-1">
              Centro X: {options.centerX}%
            </Label>
            <Input id="gradient-cx" type="range" min={0} max={100} value={options.centerX} onChange={(e) => setOptions((prev) => ({ ...prev, centerX: Number(e.target.value) }))} />
          </div>
          <div>
            <Label htmlFor="gradient-cy" className="mb-1">
              Centro Y: {options.centerY}%
            </Label>
            <Input id="gradient-cy" type="range" min={0} max={100} value={options.centerY} onChange={(e) => setOptions((prev) => ({ ...prev, centerY: Number(e.target.value) }))} />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">Colores</p>
        {options.stops.map((stop, index) => (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <input type="color" aria-label={`Color ${index + 1}`} value={stop.color.startsWith("#") ? stop.color : "#000000"} onChange={(e) => updateStop(index, "color", e.target.value)} className="h-9 w-9 rounded border" />
            <Input aria-label={`Valor de color ${index + 1}`} className="max-w-[8rem]" value={stop.color} onChange={(e) => updateStop(index, "color", e.target.value)} />
            <Input aria-label={`Opacidad ${index + 1}`} type="number" min={0} max={1} step={0.05} className="max-w-[5rem]" value={stop.alpha} onChange={(e) => updateStop(index, "alpha", Number(e.target.value))} />
            <Input
              aria-label={`Posición ${index + 1}`}
              type="number"
              min={0}
              max={100}
              className="max-w-[5rem]"
              value={stop.position ?? ""}
              onChange={(e) => updateStop(index, "position", e.target.value === "" ? "" : Number(e.target.value))}
            />
            <Button type="button" variant="ghost" size="sm" onClick={() => removeStop(index)}>
              ✕
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addStop} disabled={options.stops.length >= 12}>
          Añadir color
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {GRADIENT_PRESETS.map((preset) => (
          <Button key={preset.name} type="button" variant="outline" size="sm" onClick={() => setOptions(preset.options)}>
            {preset.name}
          </Button>
        ))}
      </div>

      <div aria-live="polite" className="space-y-2">
        <div className="h-32 rounded-lg border" style={{ background: css }} role="img" aria-label={`Vista previa del degradado: ${css}`} />
        {!isValid ? (
          <p role="alert" className="text-sm text-destructive">
            El CSS generado no pasó la comprobación estructural; revisa los colores introducidos.
          </p>
        ) : null}
        <code className="block overflow-x-auto rounded bg-muted p-2 text-xs">{declaration}</code>
        <div className="flex flex-wrap gap-2">
          <CopyButton text={css} label="Copiar valor" />
          <CopyButton text={declaration} label="Copiar CSS" />
          <DownloadButton content={declaration} filename="degradado.css" mimeType="text/css" label="Descargar .css" />
          <ResetButton onReset={() => setOptions(GRADIENT_PRESETS[0].options)} />
        </div>
      </div>
    </div>
  );
}
