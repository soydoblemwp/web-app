import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { buildGradientCss, isStructurallyValidGradientCss, GRADIENT_PRESETS, type GradientOptions } from "@/lib/public-tools/design/css-gradient";
import { buildBoxShadowValue, isStructurallyValidBoxShadow, createShadowLayer, SHADOW_PRESETS } from "@/lib/public-tools/design/css-box-shadow";

// ---------------------------------------------------------------------------
// css-gradient.ts — spec sections 16, 39
// ---------------------------------------------------------------------------
describe("design/css-gradient.ts", () => {
  const twoStops = [{ color: "#ff0000", alpha: 1, position: 0 }, { color: "#0000ff", alpha: 1, position: 100 }];

  it("builds a real linear-gradient() function string with the angle and stops", () => {
    const options: GradientOptions = { type: "linear", angleDeg: 45, shape: "circle", centerX: 50, centerY: 50, stops: twoStops };
    const css = buildGradientCss(options);
    expect(css).toBe("linear-gradient(45deg, #ff0000 0%, #0000ff 100%)");
  });

  it("builds a real radial-gradient() with shape and center position", () => {
    const options: GradientOptions = { type: "radial", angleDeg: 0, shape: "circle", centerX: 30, centerY: 70, stops: twoStops };
    const css = buildGradientCss(options);
    expect(css).toBe("radial-gradient(circle at 30% 70%, #ff0000 0%, #0000ff 100%)");
  });

  it("builds a real conic-gradient() with a starting angle", () => {
    const options: GradientOptions = { type: "conic", angleDeg: 90, shape: "circle", centerX: 50, centerY: 50, stops: twoStops };
    expect(buildGradientCss(options)).toBe("conic-gradient(from 90deg at 50% 50%, #ff0000 0%, #0000ff 100%)");
  });

  it("supports all 3 repeating variants with the repeating- prefix", () => {
    for (const type of ["repeating-linear", "repeating-radial", "repeating-conic"] as const) {
      const css = buildGradientCss({ type, angleDeg: 0, shape: "circle", centerX: 50, centerY: 50, stops: twoStops });
      expect(css.startsWith(`${type}-gradient(`)).toBe(true);
    }
  });

  it("renders semi-transparent stops as rgba(), not a hex value (alpha cannot be expressed in 6-digit hex)", () => {
    const css = buildGradientCss({ type: "linear", angleDeg: 0, shape: "circle", centerX: 50, centerY: 50, stops: [{ color: "#ff0000", alpha: 0.5, position: 0 }, { color: "#0000ff", alpha: 1, position: 100 }] });
    expect(css).toContain("rgba(255, 0, 0, 0.5)");
  });

  it("isStructurallyValidGradientCss accepts every real preset and rejects garbage input", () => {
    for (const preset of GRADIENT_PRESETS) {
      expect(isStructurallyValidGradientCss(buildGradientCss(preset.options))).toBe(true);
    }
    expect(isStructurallyValidGradientCss("not a gradient at all")).toBe(false);
    expect(isStructurallyValidGradientCss("linear-gradient(")).toBe(false);
  });

  it("never produces a raster image or data: URI — output is always a CSS function string", () => {
    const css = buildGradientCss({ type: "linear", angleDeg: 0, shape: "circle", centerX: 50, centerY: 50, stops: twoStops });
    expect(css).not.toMatch(/^data:/);
    expect(css).toMatch(/^(repeating-)?(linear|radial|conic)-gradient\(/);
  });

  it("reuses the shared color parser instead of re-implementing color parsing (source-level check)", () => {
    const source = fs.readFileSync("src/lib/public-tools/design/css-gradient.ts", "utf8");
    expect(source).toMatch(/from "@\/lib\/public-tools\/color-contrast"/);
  });
});

// ---------------------------------------------------------------------------
// css-box-shadow.ts — spec sections 17, 39
// ---------------------------------------------------------------------------
describe("design/css-box-shadow.ts", () => {
  it("builds a single-layer box-shadow value with the correct token order", () => {
    const layer = { ...createShadowLayer("s1"), offsetX: 2, offsetY: 4, blur: 8, spread: 1, color: "#000000", alpha: 1 };
    expect(buildBoxShadowValue([layer])).toBe("2px 4px 8px 1px #000000");
  });

  it("prefixes inset layers with the inset keyword", () => {
    const layer = { ...createShadowLayer("s1"), inset: true };
    expect(buildBoxShadowValue([layer])).toMatch(/^inset /);
  });

  it("combines multiple enabled layers, comma-separated, and skips disabled layers entirely", () => {
    const layerA = { ...createShadowLayer("a"), enabled: true };
    const layerB = { ...createShadowLayer("b"), enabled: false };
    const layerC = { ...createShadowLayer("c"), enabled: true };
    const value = buildBoxShadowValue([layerA, layerB, layerC]);
    expect(value.split(",\n  ")).toHaveLength(2);
  });

  it("returns 'none' when every layer is disabled", () => {
    const layer = { ...createShadowLayer("s1"), enabled: false };
    expect(buildBoxShadowValue([layer])).toBe("none");
  });

  it("renders a semi-transparent color as rgba()", () => {
    const layer = { ...createShadowLayer("s1"), alpha: 0.25, color: "#123456" };
    expect(buildBoxShadowValue([layer])).toContain("rgba(18, 52, 86, 0.25)");
  });

  it("isStructurallyValidBoxShadow accepts every real preset and 'none', rejects garbage", () => {
    for (const preset of SHADOW_PRESETS) {
      const layers = preset.layers.map((l, i) => ({ ...l, id: `${i}` }));
      expect(isStructurallyValidBoxShadow(buildBoxShadowValue(layers))).toBe(true);
    }
    expect(isStructurallyValidBoxShadow("none")).toBe(true);
    expect(isStructurallyValidBoxShadow("garbage value")).toBe(false);
  });

  it("reuses the shared color parser instead of re-implementing color parsing (source-level check)", () => {
    const source = fs.readFileSync("src/lib/public-tools/design/css-box-shadow.ts", "utf8");
    expect(source).toMatch(/from "@\/lib\/public-tools\/color-contrast"/);
  });
});
