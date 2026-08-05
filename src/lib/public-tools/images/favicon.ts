import { drawImageToCanvas, canvasToBlob } from "@/lib/public-tools/files/image-io";
import { buildIco } from "./ico-encoder";

export const FAVICON_PNG_SIZES = [16, 32, 48, 180, 192, 512] as const;
export const ICO_SIZES = [16, 32, 48] as const;

export interface FaviconOptions {
  background: "transparent" | "solid";
  backgroundColor: string;
  fit: "contain" | "cover";
  marginPercent: number;
}

export interface FaviconAsset {
  filename: string;
  bytes: Uint8Array;
  mimeType: string;
}

export interface FaviconPackageResult {
  ok: boolean;
  error?: string;
  assets?: FaviconAsset[];
  htmlSnippet?: string;
}

function drawIconAtSize(image: HTMLImageElement, size: number, options: FaviconOptions): HTMLCanvasElement {
  return drawImageToCanvas(image, size, size, (ctx, canvas) => {
    if (options.background === "solid") {
      ctx.fillStyle = options.backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    const margin = (Math.max(0, Math.min(30, options.marginPercent)) / 100) * size;
    const available = size - margin * 2;
    const sourceRatio = image.naturalWidth / image.naturalHeight;

    let drawWidth: number;
    let drawHeight: number;
    if (options.fit === "cover") {
      const scale = Math.max(available / image.naturalWidth, available / image.naturalHeight);
      drawWidth = image.naturalWidth * scale;
      drawHeight = image.naturalHeight * scale;
    } else {
      const scale = Math.min(available / image.naturalWidth, available / image.naturalHeight);
      drawWidth = image.naturalWidth * scale;
      drawHeight = image.naturalHeight * scale;
    }
    void sourceRatio;
    const x = (size - drawWidth) / 2;
    const y = (size - drawHeight) / 2;
    ctx.drawImage(image, x, y, drawWidth, drawHeight);
  });
}

function buildManifest(): string {
  return JSON.stringify(
    {
      name: "Mi sitio",
      short_name: "Mi sitio",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      theme_color: "#ffffff",
      background_color: "#ffffff",
      display: "standalone",
    },
    null,
    2
  );
}

function buildHtmlSnippet(): string {
  return [
    '<link rel="icon" href="/favicon.ico" sizes="any">',
    '<link rel="icon" href="/icon-192.png" type="image/png" sizes="192x192">',
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">',
    '<link rel="manifest" href="/site.webmanifest">',
  ].join("\n");
}

/**
 * Generates every real, verifiable favicon asset (spec section 19) — a
 * genuine PNG-in-ICO `favicon.ico` (via `buildIco`, never a renamed PNG), an
 * `apple-touch-icon.png`, PNGs for the manifest, a real `site.webmanifest`,
 * and the HTML snippet to reference them. Runs entirely on Canvas; never
 * touches a server.
 */
export async function generateFaviconPackage(image: HTMLImageElement, options: FaviconOptions): Promise<FaviconPackageResult> {
  const pngBySize = new Map<number, Uint8Array>();

  for (const size of FAVICON_PNG_SIZES) {
    const canvas = drawIconAtSize(image, size, options);
    const blob = await canvasToBlob(canvas, "image/png");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    pngBySize.set(size, bytes);
  }

  const icoBytes = buildIco(ICO_SIZES.map((size) => ({ width: size, height: size, pngBytes: pngBySize.get(size)! })));

  const assets: FaviconAsset[] = [
    { filename: "favicon.ico", bytes: icoBytes, mimeType: "image/x-icon" },
    { filename: "apple-touch-icon.png", bytes: pngBySize.get(180)!, mimeType: "image/png" },
    { filename: "icon-192.png", bytes: pngBySize.get(192)!, mimeType: "image/png" },
    { filename: "icon-512.png", bytes: pngBySize.get(512)!, mimeType: "image/png" },
    { filename: "favicon-16x16.png", bytes: pngBySize.get(16)!, mimeType: "image/png" },
    { filename: "favicon-32x32.png", bytes: pngBySize.get(32)!, mimeType: "image/png" },
    { filename: "favicon-48x48.png", bytes: pngBySize.get(48)!, mimeType: "image/png" },
    { filename: "site.webmanifest", bytes: new TextEncoder().encode(buildManifest()), mimeType: "application/manifest+json" },
    { filename: "snippet-html.txt", bytes: new TextEncoder().encode(buildHtmlSnippet()), mimeType: "text/plain" },
  ];

  return { ok: true, assets, htmlSnippet: buildHtmlSnippet() };
}
