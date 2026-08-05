import { PDFDocument, degrees } from "pdf-lib";
import { loadPdfDocument } from "./load";
import { buildFileError, type FileErrorResult } from "@/lib/public-tools/files/errors";

/** One entry in the final page order — `originalIndex` may repeat (duplicate page) or be omitted for some indices (deleted page); order in the array is the final order. */
export interface OrganizePageEntry {
  originalIndex: number;
  /** Additional rotation to apply on top of whatever rotation the original page already had, normalized to one of 0/90/180/270. */
  rotationDelta: number;
}

export interface OrganizeResult {
  ok: boolean;
  error?: FileErrorResult;
  bytes?: Uint8Array;
  pageCount?: number;
}

function normalizeRotation(angle: number): number {
  const normalized = ((angle % 360) + 360) % 360;
  return Math.round(normalized / 90) * 90;
}

/**
 * Reorders, rotates, duplicates and deletes pages in a single pass (spec
 * section 12) — never edits text/content inside a page, only the page
 * order, rotation and count. Rotation is additive over whatever rotation
 * the source page already had, so re-applying "rotar 90°" twice correctly
 * yields 180°, not a reset back to 90°.
 */
export async function organizePdf(bytes: Uint8Array, plan: OrganizePageEntry[]): Promise<OrganizeResult> {
  if (plan.length === 0) return { ok: false, error: buildFileError("limit-exceeded", "El documento no puede quedarse sin páginas.") };

  const loadResult = await loadPdfDocument(bytes);
  if (!loadResult.ok || !loadResult.document) return { ok: false, error: loadResult.error };
  const source = loadResult.document;
  const sourcePages = source.getPages();

  for (const entry of plan) {
    if (entry.originalIndex < 0 || entry.originalIndex >= sourcePages.length) {
      return { ok: false, error: buildFileError("limit-exceeded", `La página ${entry.originalIndex + 1} no existe en el documento original.`) };
    }
  }

  const output = await PDFDocument.create();
  const copiedPages = await output.copyPages(source, plan.map((entry) => entry.originalIndex));

  plan.forEach((entry, i) => {
    const page = copiedPages[i];
    const originalRotation = sourcePages[entry.originalIndex].getRotation().angle;
    page.setRotation(degrees(normalizeRotation(originalRotation + entry.rotationDelta)));
    output.addPage(page);
  });

  const outputBytes = await output.save();
  return { ok: true, bytes: outputBytes, pageCount: plan.length };
}

/** The identity plan for a freshly-loaded document — original order, no rotation change, used to seed the organizer UI's initial state. */
export function buildIdentityPlan(pageCount: number): OrganizePageEntry[] {
  return Array.from({ length: pageCount }, (_, i) => ({ originalIndex: i, rotationDelta: 0 }));
}
