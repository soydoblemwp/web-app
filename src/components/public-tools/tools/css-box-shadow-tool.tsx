"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CopyButton, DownloadButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { buildBoxShadowValue, buildBoxShadowDeclaration, isStructurallyValidBoxShadow, createShadowLayer, SHADOW_PRESETS, type ShadowLayer } from "@/lib/public-tools/design/css-box-shadow";

export function CssBoxShadowTool() {
  const [layers, setLayers] = useState<ShadowLayer[]>([createShadowLayer("s1")]);
  const [background, setBackground] = useState("#f4f4f5");
  const [borderRadius, setBorderRadius] = useState(12);

  function updateLayer<K extends keyof ShadowLayer>(id: string, key: K, value: ShadowLayer[K]) {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, [key]: value } : l)));
  }
  function addLayer() {
    setLayers((prev) => (prev.length >= 8 ? prev : [...prev, createShadowLayer(`s${prev.length + 1}-${Date.now()}`)]));
  }
  function removeLayer(id: string) {
    setLayers((prev) => (prev.length > 1 ? prev.filter((l) => l.id !== id) : prev));
  }
  function duplicateLayer(id: string) {
    setLayers((prev) => {
      const layer = prev.find((l) => l.id === id);
      if (!layer || prev.length >= 8) return prev;
      return [...prev, { ...layer, id: `${id}-copy-${Date.now()}` }];
    });
  }

  const value = useMemo(() => buildBoxShadowValue(layers), [layers]);
  const declaration = useMemo(() => buildBoxShadowDeclaration(layers), [layers]);
  const isValid = useMemo(() => isStructurallyValidBoxShadow(value), [value]);
  const extremeWarning = layers.some((l) => Math.abs(l.offsetX) > 100 || Math.abs(l.offsetY) > 100 || l.blur > 200);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {layers.map((layer, index) => (
          <div key={layer.id} className="space-y-2 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox checked={layer.enabled} onCheckedChange={(c) => updateLayer(layer.id, "enabled", Boolean(c))} />
                Capa {index + 1}
              </label>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => duplicateLayer(layer.id)}>
                  Duplicar
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => removeLayer(layer.id)}>
                  Eliminar
                </Button>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={layer.inset} onCheckedChange={(c) => updateLayer(layer.id, "inset", Boolean(c))} />
              Interior (inset)
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div>
                <Label htmlFor={`ox-${layer.id}`} className="mb-1 text-xs">
                  Offset X
                </Label>
                <Input id={`ox-${layer.id}`} type="number" value={layer.offsetX} onChange={(e) => updateLayer(layer.id, "offsetX", Number(e.target.value))} />
              </div>
              <div>
                <Label htmlFor={`oy-${layer.id}`} className="mb-1 text-xs">
                  Offset Y
                </Label>
                <Input id={`oy-${layer.id}`} type="number" value={layer.offsetY} onChange={(e) => updateLayer(layer.id, "offsetY", Number(e.target.value))} />
              </div>
              <div>
                <Label htmlFor={`blur-${layer.id}`} className="mb-1 text-xs">
                  Blur
                </Label>
                <Input id={`blur-${layer.id}`} type="number" min={0} value={layer.blur} onChange={(e) => updateLayer(layer.id, "blur", Number(e.target.value))} />
              </div>
              <div>
                <Label htmlFor={`spread-${layer.id}`} className="mb-1 text-xs">
                  Spread
                </Label>
                <Input id={`spread-${layer.id}`} type="number" value={layer.spread} onChange={(e) => updateLayer(layer.id, "spread", Number(e.target.value))} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="color" aria-label={`Color capa ${index + 1}`} value={layer.color} onChange={(e) => updateLayer(layer.id, "color", e.target.value)} className="h-9 w-9 rounded border" />
              <Label htmlFor={`alpha-${layer.id}`} className="text-xs">
                Opacidad
              </Label>
              <Input id={`alpha-${layer.id}`} type="number" min={0} max={1} step={0.05} className="max-w-[6rem]" value={layer.alpha} onChange={(e) => updateLayer(layer.id, "alpha", Number(e.target.value))} />
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addLayer} disabled={layers.length >= 8}>
          Añadir capa
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {SHADOW_PRESETS.map((preset) => (
          <Button key={preset.name} type="button" variant="outline" size="sm" onClick={() => setLayers(preset.layers.map((l, i) => ({ ...l, id: `preset-${i}-${Date.now()}` })))}>
            {preset.name}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:max-w-sm">
        <div>
          <Label htmlFor="shadow-bg" className="mb-1">
            Fondo de vista previa
          </Label>
          <input id="shadow-bg" type="color" className="h-9 w-full rounded border" value={background} onChange={(e) => setBackground(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="shadow-radius" className="mb-1">
            Radio: {borderRadius}px
          </Label>
          <Input id="shadow-radius" type="range" min={0} max={48} value={borderRadius} onChange={(e) => setBorderRadius(Number(e.target.value))} />
        </div>
      </div>

      <div aria-live="polite" className="space-y-2">
        <div className="flex h-40 items-center justify-center rounded-lg border p-8" style={{ background }}>
          <div className="h-20 w-32 bg-white" style={{ boxShadow: value, borderRadius }} role="img" aria-label={`Vista previa de la sombra: ${value}`} />
        </div>
        {!isValid ? (
          <p role="alert" className="text-sm text-destructive">
            El CSS generado no pasó la comprobación estructural.
          </p>
        ) : null}
        {extremeWarning ? <p className="text-sm text-amber-600 dark:text-amber-400">Algunos valores son extremos (offset o blur muy grandes); revisa si es intencional.</p> : null}
        <p className="text-xs text-muted-foreground">{layers.filter((l) => l.enabled).length} capa(s) activa(s)</p>
        <code className="block overflow-x-auto whitespace-pre rounded bg-muted p-2 text-xs">{declaration}</code>
        <div className="flex flex-wrap gap-2">
          <CopyButton text={value} label="Copiar valor" />
          <CopyButton text={declaration} label="Copiar CSS" />
          <DownloadButton content={declaration} filename="sombra.css" mimeType="text/css" label="Descargar .css" />
          <ResetButton onReset={() => setLayers([createShadowLayer("s1")])} />
        </div>
      </div>
    </div>
  );
}
