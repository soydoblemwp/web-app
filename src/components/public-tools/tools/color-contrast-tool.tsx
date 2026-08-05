"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CopyButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { parseColor, rgbToHex, contrastRatioRgb, evaluateWcagLevels, suggestAdjustedColor } from "@/lib/public-tools/color-contrast";

function LevelBadge({ label, pass }: { label: string; pass: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${pass ? "border-emerald-600 text-emerald-700 dark:text-emerald-400" : "border-destructive text-destructive"}`}>
      {pass ? "✓" : "✗"} {label}
    </span>
  );
}

export function ColorContrastTool() {
  const [foreground, setForeground] = useState("#111111");
  const [background, setBackground] = useState("#ffffff");
  const [savedPalette, setSavedPalette] = useState<{ fg: string; bg: string }[]>([]);

  const fgRgb = useMemo(() => parseColor(foreground), [foreground]);
  const bgRgb = useMemo(() => parseColor(background), [background]);

  const ratio = fgRgb && bgRgb ? contrastRatioRgb(fgRgb, bgRgb) : null;
  const levels = ratio !== null ? evaluateWcagLevels(ratio) : null;

  function handleSwap() {
    setForeground(background);
    setBackground(foreground);
  }

  function handleSave() {
    if (!fgRgb || !bgRgb) return;
    setSavedPalette((prev) => [...prev, { fg: foreground, bg: background }]);
  }

  const suggestionLighter = fgRgb && bgRgb ? suggestAdjustedColor(fgRgb, bgRgb, 4.5, "lighter") : null;
  const suggestionDarker = fgRgb && bgRgb ? suggestAdjustedColor(fgRgb, bgRgb, 4.5, "darker") : null;

  const cssVars = fgRgb && bgRgb ? `:root {\n  --color-text: ${rgbToHex(fgRgb)};\n  --color-bg: ${rgbToHex(bgRgb)};\n}` : "";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="contrast-fg" className="mb-1">
            Color de texto
          </Label>
          <div className="flex items-center gap-2">
            <input type="color" value={fgRgb ? rgbToHex(fgRgb) : "#000000"} onChange={(e) => setForeground(e.target.value)} aria-label="Selector visual de color de texto" className="h-9 w-9 rounded border" />
            <Input id="contrast-fg" value={foreground} onChange={(e) => setForeground(e.target.value)} placeholder="#111111, rgb(17,17,17), hsl(0,0%,7%)" />
          </div>
        </div>
        <div>
          <Label htmlFor="contrast-bg" className="mb-1">
            Color de fondo
          </Label>
          <div className="flex items-center gap-2">
            <input type="color" value={bgRgb ? rgbToHex(bgRgb) : "#ffffff"} onChange={(e) => setBackground(e.target.value)} aria-label="Selector visual de color de fondo" className="h-9 w-9 rounded border" />
            <Input id="contrast-bg" value={background} onChange={(e) => setBackground(e.target.value)} placeholder="#ffffff" />
          </div>
        </div>
      </div>

      <Button type="button" variant="outline" size="sm" onClick={handleSwap}>
        Intercambiar
      </Button>

      {!fgRgb || !bgRgb ? (
        <p role="alert" className="text-sm text-destructive">
          No se pudo interpretar alguno de los dos colores. Usa HEX (#rrggbb), rgb(r,g,b) o hsl(h,s%,l%).
        </p>
      ) : (
        <div aria-live="polite" className="space-y-4 rounded-lg border p-4">
          <p className="text-lg font-medium">
            Relación de contraste: <code>{ratio!.toFixed(2)}:1</code>
          </p>
          <div className="flex flex-wrap gap-2">
            <LevelBadge label="AA texto normal (4.5:1)" pass={levels!.aaNormal} />
            <LevelBadge label="AA texto grande (3:1)" pass={levels!.aaLarge} />
            <LevelBadge label="AAA texto normal (7:1)" pass={levels!.aaaNormal} />
            <LevelBadge label="AAA texto grande (4.5:1)" pass={levels!.aaaLarge} />
          </div>

          <div className="space-y-2 rounded-md border p-4" style={{ backgroundColor: rgbToHex(bgRgb), color: rgbToHex(fgRgb) }}>
            <p className="text-lg font-semibold">Vista previa de párrafo con este contraste.</p>
            <p>
              <a href="#" onClick={(e) => e.preventDefault()} style={{ color: rgbToHex(fgRgb), textDecoration: "underline" }}>
                Enlace de ejemplo
              </a>
            </p>
            <button type="button" style={{ backgroundColor: rgbToHex(fgRgb), color: rgbToHex(bgRgb) }} className="rounded px-3 py-1 text-sm">
              Botón de ejemplo
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <CopyButton text={cssVars} label="Copiar variables CSS" />
            <Button type="button" variant="outline" size="sm" onClick={handleSave}>
              Guardar en paleta de sesión
            </Button>
          </div>

          {!levels!.aaNormal ? (
            <div className="space-y-1 text-sm">
              <p className="font-medium">Sugerencias para alcanzar AA (4.5:1)</p>
              {suggestionLighter ? (
                <p className="flex items-center gap-2">
                  Más claro: <code>{rgbToHex(suggestionLighter)}</code>
                  <CopyButton text={rgbToHex(suggestionLighter)} label="Copiar" />
                </p>
              ) : (
                <p className="text-muted-foreground">No existe una variante más clara del color de texto que alcance 4.5:1 sobre este fondo.</p>
              )}
              {suggestionDarker ? (
                <p className="flex items-center gap-2">
                  Más oscuro: <code>{rgbToHex(suggestionDarker)}</code>
                  <CopyButton text={rgbToHex(suggestionDarker)} label="Copiar" />
                </p>
              ) : (
                <p className="text-muted-foreground">No existe una variante más oscura del color de texto que alcance 4.5:1 sobre este fondo.</p>
              )}
            </div>
          ) : null}
        </div>
      )}

      {savedPalette.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Paleta guardada en esta sesión</p>
          <ul className="flex flex-wrap gap-2">
            {savedPalette.map((entry, i) => (
              <li key={i} className="flex items-center gap-1 rounded border px-2 py-1 text-xs">
                <span className="inline-block size-3 rounded-full border" style={{ backgroundColor: entry.fg }} />
                <span className="inline-block size-3 rounded-full border" style={{ backgroundColor: entry.bg }} />
                {entry.fg} / {entry.bg}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">El contraste es solo una parte de la accesibilidad de una interfaz.</p>

      <ResetButton
        onReset={() => {
          setForeground("#111111");
          setBackground("#ffffff");
          setSavedPalette([]);
        }}
      />
    </div>
  );
}
