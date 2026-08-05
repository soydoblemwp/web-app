import { parseColor, rgbToHex } from "@/lib/public-tools/color-contrast";

export interface ShadowLayer {
  id: string;
  enabled: boolean;
  inset: boolean;
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
  color: string;
  alpha: number;
}

function layerToCss(layer: ShadowLayer): string {
  const rgb = parseColor(layer.color) ?? [0, 0, 0];
  const colorPart = layer.alpha < 1 ? `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${Math.round(layer.alpha * 100) / 100})` : rgbToHex(rgb);
  const parts = [layer.inset ? "inset" : null, `${Math.round(layer.offsetX)}px`, `${Math.round(layer.offsetY)}px`, `${Math.round(Math.max(0, layer.blur))}px`, `${Math.round(layer.spread)}px`, colorPart].filter(
    (p): p is string => p !== null
  );
  return parts.join(" ");
}

/** Builds a real multi-layer `box-shadow` value — reuses the shared color parser (spec section 17 shares the section-16 mandate to reuse color/contrast utilities, not reimplement them). */
export function buildBoxShadowValue(layers: ShadowLayer[]): string {
  const enabled = layers.filter((l) => l.enabled);
  if (enabled.length === 0) return "none";
  return enabled.map(layerToCss).join(",\n  ");
}

export function buildBoxShadowDeclaration(layers: ShadowLayer[]): string {
  return `box-shadow: ${buildBoxShadowValue(layers)};`;
}

/** Structural validation: confirms every enabled layer produced a well-formed 5-or-6-token box-shadow segment (px px px px color, optionally prefixed by "inset") rather than a full CSS grammar parse. */
export function isStructurallyValidBoxShadow(css: string): boolean {
  if (css.trim() === "none") return true;
  const layers = css.split(",\n  ").map((l) => l.trim());
  return layers.every((layer) => /^(inset\s+)?-?\d+px\s+-?\d+px\s+\d+px\s+-?\d+px\s+\S+/.test(layer));
}

export function createShadowLayer(id: string): ShadowLayer {
  return { id, enabled: true, inset: false, offsetX: 0, offsetY: 4, blur: 12, spread: 0, color: "#000000", alpha: 0.25 };
}

export const SHADOW_PRESETS: { name: string; layers: Omit<ShadowLayer, "id">[] }[] = [
  { name: "Suave", layers: [{ enabled: true, inset: false, offsetX: 0, offsetY: 1, blur: 3, spread: 0, color: "#000000", alpha: 0.12 }] },
  { name: "Elevada", layers: [{ enabled: true, inset: false, offsetX: 0, offsetY: 10, blur: 25, spread: -5, color: "#000000", alpha: 0.2 }] },
  {
    name: "Doble capa",
    layers: [
      { enabled: true, inset: false, offsetX: 0, offsetY: 1, blur: 2, spread: 0, color: "#000000", alpha: 0.24 },
      { enabled: true, inset: false, offsetX: 0, offsetY: 4, spread: 0, blur: 16, color: "#000000", alpha: 0.16 },
    ],
  },
  { name: "Interior", layers: [{ enabled: true, inset: true, offsetX: 0, offsetY: 2, blur: 4, spread: 0, color: "#000000", alpha: 0.15 }] },
];
