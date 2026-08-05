/**
 * Centralized limits for every file-processing public tool (Fase 42 spec
 * section 28) — no component defines its own hidden size/count/dimension
 * ceiling. Values are chosen to stay responsive on a typical phone (avoid
 * multi-hundred-MB in-memory buffers or thousands of simultaneous canvas
 * renders) while still covering realistic real-world documents/images.
 */
export const FILE_LIMITS = {
  pdf: {
    maxFileBytes: 60 * 1024 * 1024,
    maxTotalBytes: 200 * 1024 * 1024,
    maxFilesToMerge: 30,
    maxTotalPages: 2000,
    maxPagesRenderedAtOnce: 12,
  },
  image: {
    maxFileBytes: 25 * 1024 * 1024,
    maxDimension: 8000,
    maxTotalPixels: 40_000_000,
  },
  zip: {
    maxEntries: 500,
    maxTotalBytes: 250 * 1024 * 1024,
  },
} as const;

export const ACCEPTED_PDF_MIME = "application/pdf";
export const ACCEPTED_IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
