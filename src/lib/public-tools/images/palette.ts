import { contrastRatio } from "@/lib/public-tools/color-contrast";

export interface PaletteColor {
  r: number;
  g: number;
  b: number;
  hex: string;
  percent: number;
  contrastWithWhite: number | null;
  contrastWithBlack: number | null;
  lowContrastBoth: boolean;
}

interface ColorBox {
  pixels: [number, number, number][];
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, "0")).join("")}`;
}

function channelRange(pixels: [number, number, number][], channel: 0 | 1 | 2): number {
  let min = 255;
  let max = 0;
  for (const pixel of pixels) {
    const value = pixel[channel];
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return max - min;
}

function widestChannel(pixels: [number, number, number][]): 0 | 1 | 2 {
  const ranges: [number, 0 | 1 | 2][] = [
    [channelRange(pixels, 0), 0],
    [channelRange(pixels, 1), 1],
    [channelRange(pixels, 2), 2],
  ];
  ranges.sort((a, b) => b[0] - a[0]);
  return ranges[0][1];
}

function splitBox(box: ColorBox): ColorBox[] {
  const channel = widestChannel(box.pixels);
  // Stable sort by the widest channel — deterministic median split, never a random pivot.
  const sorted = [...box.pixels].sort((a, b) => a[channel] - b[channel]);
  const mid = Math.floor(sorted.length / 2);
  return [{ pixels: sorted.slice(0, mid) }, { pixels: sorted.slice(mid) }];
}

function averageColor(pixels: [number, number, number][]): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  for (const pixel of pixels) {
    r += pixel[0];
    g += pixel[1];
    b += pixel[2];
  }
  const n = pixels.length || 1;
  return [r / n, g / n, b / n];
}

export type PaletteSortMode = "predominance" | "luminosity";

/**
 * Deterministic median-cut color quantization (spec section 20: "usa un
 * algoritmo determinista y documentado... no selecciones píxeles al azar
 * sin semilla"). Every step (which box to split, which channel, where to
 * cut) is a pure function of the pixel data — the same image always
 * produces the exact same palette, byte for byte.
 */
export function extractPalette(imageData: ImageData, colorCount: number, sortMode: PaletteSortMode = "predominance"): PaletteColor[] {
  const data = imageData.data;
  const pixels: [number, number, number][] = [];

  // Deterministic stride sampling for very large images — never Math.random(); the stride is a pure function of pixel count, so the same image always samples the same pixels.
  const totalPixels = imageData.width * imageData.height;
  const maxSamples = 200_000;
  const stride = Math.max(1, Math.floor(totalPixels / maxSamples));

  for (let i = 0; i < totalPixels; i += stride) {
    const offset = i * 4;
    const alpha = data[offset + 3];
    if (alpha < 128) continue; // ignore mostly-transparent pixels
    pixels.push([data[offset], data[offset + 1], data[offset + 2]]);
  }

  if (pixels.length === 0) return [];

  const boxes: ColorBox[] = [{ pixels }];
  const targetCount = Math.max(1, Math.min(colorCount, 32));

  while (boxes.length < targetCount) {
    let largestIndex = 0;
    let largestSize = 0;
    boxes.forEach((box, index) => {
      if (box.pixels.length > largestSize) {
        largestSize = box.pixels.length;
        largestIndex = index;
      }
    });
    if (boxes[largestIndex].pixels.length < 2) break;
    const [a, b] = splitBox(boxes[largestIndex]);
    boxes.splice(largestIndex, 1, a, b);
  }

  const totalSampled = pixels.length;
  const colors: PaletteColor[] = boxes
    .filter((box) => box.pixels.length > 0)
    .map((box) => {
      const [r, g, b] = averageColor(box.pixels);
      const hex = toHex(r, g, b);
      const contrastWithWhite = contrastRatio(hex, "#ffffff");
      const contrastWithBlack = contrastRatio(hex, "#000000");
      // WCAG contrast against white and against black are complementary — as
      // one rises the other falls, and the best of the two can mathematically
      // never drop below ~4.58:1 (reached only for mid-gray tones around
      // #767676). A literal "both under 3" or "both under 4.5" condition is
      // therefore unreachable for any real color. The honest, achievable
      // signal is "even the better of your two text-color choices is
      // mediocre" — flagged when neither option clears 5:1.
      const bestContrast = Math.max(contrastWithWhite ?? 0, contrastWithBlack ?? 0);
      const lowContrastBoth = bestContrast < 5;
      return {
        r: Math.round(r),
        g: Math.round(g),
        b: Math.round(b),
        hex,
        percent: (box.pixels.length / totalSampled) * 100,
        contrastWithWhite,
        contrastWithBlack,
        lowContrastBoth,
      };
    });

  if (sortMode === "luminosity") {
    return colors.sort((a, b) => 0.299 * a.r + 0.587 * a.g + 0.114 * a.b - (0.299 * b.r + 0.587 * b.g + 0.114 * b.b));
  }
  return colors.sort((a, b) => b.percent - a.percent);
}

export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else h = ((rn - gn) / d + 4) * 60;

  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function paletteToCss(colors: PaletteColor[]): string {
  return [":root {", ...colors.map((c, i) => `  --color-${i + 1}: ${c.hex};`), "}"].join("\n");
}

export function paletteToJson(colors: PaletteColor[]): string {
  return JSON.stringify(
    colors.map((c) => ({ hex: c.hex, rgb: `rgb(${c.r}, ${c.g}, ${c.b})`, hsl: rgbToHsl(c.r, c.g, c.b), percent: Math.round(c.percent * 10) / 10 })),
    null,
    2
  );
}
