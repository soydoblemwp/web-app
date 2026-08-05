import type { BarcodeFormat } from "./formats";

/**
 * Client-only rendering via `jsbarcode` (MIT, focused, no external
 * requests — see registry dependency notes). Dynamically imported so it
 * never loads on `/herramientas` or any Server Component (spec section 30).
 */
export interface BarcodeRenderOptions {
  format: BarcodeFormat;
  displayValue: boolean;
  width: number; // bar module width in px
  height: number;
  margin: number;
  lineColor: string;
  background: string;
}

export async function renderBarcodeToSvgString(value: string, options: BarcodeRenderOptions): Promise<string> {
  const { default: JsBarcode } = await import("jsbarcode");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  JsBarcode(svg, value, {
    format: options.format,
    displayValue: options.displayValue,
    width: options.width,
    height: options.height,
    margin: options.margin,
    lineColor: options.lineColor,
    background: options.background,
  });
  return new XMLSerializer().serializeToString(svg);
}

export async function renderBarcodeToPngBlob(value: string, options: BarcodeRenderOptions): Promise<Blob> {
  const { default: JsBarcode } = await import("jsbarcode");
  const canvas = document.createElement("canvas");
  JsBarcode(canvas, value, {
    format: options.format,
    displayValue: options.displayValue,
    width: options.width,
    height: options.height,
    margin: options.margin,
    lineColor: options.lineColor,
    background: options.background,
  });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("No se pudo generar la imagen PNG del código de barras."));
    }, "image/png");
  });
}
