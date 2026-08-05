/**
 * Shared "render a QR code to PNG bytes so pdf-lib can embed it" helper —
 * used by both the business-card and labels PDF builders, so this exists
 * exactly once rather than being copy-pasted per tool. Follows the same
 * ad-hoc `qrcode` usage the existing QR generator component already uses
 * (there is no exported QR-rendering core to reuse, per inventory — unlike
 * barcodes, which do have one).
 */
export async function renderQrPngBytes(value: string, sizePx: number): Promise<Uint8Array | null> {
  if (!value.trim()) return null;
  try {
    const { default: QRCode } = await import("qrcode");
    const canvas = document.createElement("canvas");
    await QRCode.toCanvas(canvas, value, { width: sizePx, margin: 1 });
    const blob: Blob = await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("qr-blob-failed"))), "image/png"));
    return new Uint8Array(await blob.arrayBuffer());
  } catch {
    return null;
  }
}
