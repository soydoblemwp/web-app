import { validateImageDimensions, validateImageFile } from "./validation";
import { buildFileError, type FileErrorResult } from "./errors";

export interface LoadedImage {
  image: HTMLImageElement;
  url: string;
  width: number;
  height: number;
}

export interface LoadImageResult {
  ok: boolean;
  error?: FileErrorResult;
  loaded?: LoadedImage;
}

/**
 * Shared image-loading core (spec section 17: "reutiliza... del compresor
 * existente. No copies el núcleo") — the Compresor de imágenes, Recortar
 * imágenes, Generador de favicons, Extractor de paleta and Ocultar
 * información tools all load a file through this single function instead of
 * each re-implementing their own `new Image()` + object-URL dance.
 */
export function loadImageFromFile(file: File): Promise<LoadImageResult> {
  const typeValidation = validateImageFile(file);
  if (!typeValidation.ok) return Promise.resolve({ ok: false, error: typeValidation.error });

  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const dimensionValidation = validateImageDimensions(image.naturalWidth, image.naturalHeight);
      if (!dimensionValidation.ok) {
        URL.revokeObjectURL(url);
        resolve({ ok: false, error: dimensionValidation.error });
        return;
      }
      resolve({ ok: true, loaded: { image, url, width: image.naturalWidth, height: image.naturalHeight } });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ ok: false, error: buildFileError("corrupted", "No se pudo leer esta imagen. Puede estar dañada o en un formato no compatible.") });
    };
    image.src = url;
  });
}

export type ExportFormat = "image/jpeg" | "image/png" | "image/webp";

export function drawImageToCanvas(
  source: CanvasImageSource,
  width: number,
  height: number,
  draw?: (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => void
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no-canvas-context");
  if (draw) draw(ctx, canvas);
  else ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, format: ExportFormat, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("no-blob"));
      },
      format,
      format === "image/png" ? undefined : quality
    );
  });
}

export function extensionForFormat(format: ExportFormat): string {
  return format === "image/jpeg" ? "jpg" : format === "image/png" ? "png" : "webp";
}
