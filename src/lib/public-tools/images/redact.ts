export type RedactEffect = "blur" | "pixelate" | "solid";

export interface RedactZone {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Applies one privacy effect to one rectangular region of a canvas, in
 * place. `blur` and `pixelate` both read pixels only from within the
 * source canvas already drawn onto `ctx` — no external image processing
 * library, no facial detection model (spec section 21: "no añadas
 * detección facial automática si no existe un modelo local real").
 */
export function applyRedactEffect(
  ctx: CanvasRenderingContext2D,
  sourceCanvas: HTMLCanvasElement,
  zone: RedactZone,
  effect: RedactEffect,
  intensity: number,
  blockColor: string
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(zone.x, zone.y, zone.width, zone.height);
  ctx.clip();

  if (effect === "solid") {
    ctx.fillStyle = blockColor;
    ctx.fillRect(zone.x, zone.y, zone.width, zone.height);
  } else if (effect === "pixelate") {
    const blockSize = Math.max(2, Math.round(intensity));
    const smallWidth = Math.max(1, Math.floor(zone.width / blockSize));
    const smallHeight = Math.max(1, Math.floor(zone.height / blockSize));
    const temp = document.createElement("canvas");
    temp.width = smallWidth;
    temp.height = smallHeight;
    const tempCtx = temp.getContext("2d");
    if (tempCtx) {
      tempCtx.drawImage(sourceCanvas, zone.x, zone.y, zone.width, zone.height, 0, 0, smallWidth, smallHeight);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(temp, 0, 0, smallWidth, smallHeight, zone.x, zone.y, zone.width, zone.height);
    }
  } else if (effect === "blur") {
    const pad = Math.round(intensity);
    ctx.filter = `blur(${intensity}px)`;
    ctx.drawImage(
      sourceCanvas,
      Math.max(0, zone.x - pad),
      Math.max(0, zone.y - pad),
      zone.width + pad * 2,
      zone.height + pad * 2,
      Math.max(0, zone.x - pad),
      Math.max(0, zone.y - pad),
      zone.width + pad * 2,
      zone.height + pad * 2
    );
    ctx.filter = "none";
  }

  ctx.restore();
}

export function applyAllRedactZones(
  outputCanvas: HTMLCanvasElement,
  sourceCanvas: HTMLCanvasElement,
  zones: RedactZone[],
  effect: RedactEffect,
  intensity: number,
  blockColor: string
): void {
  const ctx = outputCanvas.getContext("2d");
  if (!ctx) throw new Error("no-canvas-context");
  ctx.drawImage(sourceCanvas, 0, 0);
  for (const zone of zones) applyRedactEffect(ctx, sourceCanvas, zone, effect, intensity, blockColor);
}
