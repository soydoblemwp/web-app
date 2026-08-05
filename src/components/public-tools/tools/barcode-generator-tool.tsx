"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CopyButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { BARCODE_FORMATS, isCode39Compatible, isCode128Compatible, type BarcodeFormat } from "@/lib/public-tools/barcodes/formats";
import { validateEan13, validateEan8, validateUpcA, validateItf14 } from "@/lib/public-tools/barcodes/validation";
import { downloadTextFile } from "@/lib/public-tools/csv-export";
import { downloadBlob } from "@/lib/public-tools/files/download";

const VALIDATORS: Partial<Record<BarcodeFormat, (v: string) => { ok: boolean; error?: string; fullValue?: string }>> = {
  EAN13: validateEan13,
  EAN8: validateEan8,
  UPC: validateUpcA,
  ITF14: validateItf14,
};

export function BarcodeGeneratorTool() {
  const [value, setValue] = useState("123456789012");
  const [format, setFormat] = useState<BarcodeFormat>("EAN13");
  const [displayValue, setDisplayValue] = useState(true);
  const [width, setWidth] = useState(2);
  const [height, setHeight] = useState(100);
  const [margin, setMargin] = useState(10);
  const [lineColor, setLineColor] = useState("#000000");
  const [background, setBackground] = useState("#ffffff");
  const [svgMarkup, setSvgMarkup] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function validate(): { ok: boolean; error?: string; effectiveValue: string } {
    const validator = VALIDATORS[format];
    if (validator) {
      const result = validator(value);
      if (!result.ok) return { ok: false, error: result.error, effectiveValue: value };
      return { ok: true, effectiveValue: result.fullValue ?? value };
    }
    if (format === "CODE39" && !isCode39Compatible(value)) {
      return { ok: false, error: "Code 39 solo admite letras mayúsculas, números y - . espacio $ / + %.", effectiveValue: value };
    }
    if (format === "CODE128" && !isCode128Compatible(value)) {
      return { ok: false, error: "Code 128 solo admite caracteres ASCII imprimibles.", effectiveValue: value };
    }
    if (value.length === 0) return { ok: false, error: "El valor no puede estar vacío.", effectiveValue: value };
    return { ok: true, effectiveValue: value };
  }

  async function handleGenerate() {
    setError(null);
    const validation = validate();
    if (!validation.ok) {
      setError(validation.error ?? "Valor inválido.");
      setSvgMarkup(null);
      return;
    }
    try {
      const { renderBarcodeToSvgString } = await import("@/lib/public-tools/barcodes/generation");
      const svg = await renderBarcodeToSvgString(validation.effectiveValue, { format, displayValue, width, height, margin, lineColor, background });
      setSvgMarkup(svg);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar el código de barras con este valor y formato.");
      setSvgMarkup(null);
    }
  }

  async function handleDownloadPng() {
    const validation = validate();
    if (!validation.ok) return;
    const { renderBarcodeToPngBlob } = await import("@/lib/public-tools/barcodes/generation");
    const blob = await renderBarcodeToPngBlob(validation.effectiveValue, { format, displayValue, width, height, margin, lineColor, background });
    downloadBlob("codigo-barras.png", blob);
  }

  function handleReset() {
    setValue("123456789012");
    setSvgMarkup(null);
    setError(null);
  }

  const formatDef = BARCODE_FORMATS.find((f) => f.id === format)!;

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">La herramienta genera la representación gráfica. No asigna identificadores comerciales oficiales.</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="bc-format" className="mb-1">
            Formato
          </Label>
          <Select value={format} onValueChange={(v) => setFormat(v as BarcodeFormat)}>
            <SelectTrigger id="bc-format" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BARCODE_FORMATS.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">{formatDef.description}</p>
        </div>
        <div>
          <Label htmlFor="bc-value" className="mb-1">
            Valor
          </Label>
          <Input id="bc-value" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="bc-width" className="mb-1">
            Ancho de barra (px)
          </Label>
          <Input id="bc-width" type="number" min={1} max={10} value={width} onChange={(e) => setWidth(Number(e.target.value))} />
        </div>
        <div>
          <Label htmlFor="bc-height" className="mb-1">
            Alto (px)
          </Label>
          <Input id="bc-height" type="number" min={20} max={400} value={height} onChange={(e) => setHeight(Number(e.target.value))} />
        </div>
        <div>
          <Label htmlFor="bc-margin" className="mb-1">
            Margen (px)
          </Label>
          <Input id="bc-margin" type="number" min={0} max={50} value={margin} onChange={(e) => setMargin(Number(e.target.value))} />
        </div>
        <div className="flex items-center gap-4">
          <div>
            <Label htmlFor="bc-line-color" className="mb-1 block">
              Color de barras
            </Label>
            <input id="bc-line-color" type="color" value={lineColor} onChange={(e) => setLineColor(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="bc-bg-color" className="mb-1 block">
              Color de fondo
            </Label>
            <input id="bc-bg-color" type="color" value={background} onChange={(e) => setBackground(e.target.value)} />
          </div>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={displayValue} onCheckedChange={(c) => setDisplayValue(Boolean(c))} />
        Mostrar texto
      </label>

      <Button type="button" onClick={handleGenerate}>
        Generar
      </Button>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {svgMarkup ? (
        <div aria-live="polite" className="space-y-3 rounded-lg border p-4">
          {/* Safe: markup is produced entirely by jsbarcode's own SVG renderer from validated numeric/charset-checked input, never from raw user HTML. */}
          <div dangerouslySetInnerHTML={{ __html: svgMarkup }} />
          <div className="flex flex-wrap gap-2">
            <CopyButton text={value} label="Copiar valor" />
            <Button type="button" variant="outline" size="sm" onClick={() => downloadTextFile("codigo-barras.svg", svgMarkup, "image/svg+xml;charset=utf-8")}>
              Descargar SVG
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleDownloadPng}>
              Descargar PNG
            </Button>
          </div>
        </div>
      ) : null}

      <ResetButton onReset={handleReset} />
    </div>
  );
}
