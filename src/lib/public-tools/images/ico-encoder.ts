/**
 * Builds a real, valid Windows ICO file by embedding PNG-encoded images
 * directly (the "PNG-in-ICO" format supported by Windows Vista and every
 * later Windows/browser/OS icon reader — not a renamed PNG). Spec section
 * 19: "Si no puede producir un ICO válido... no descargue un PNG
 * renombrado." This function always produces a byte-correct ICONDIR +
 * ICONDIRENTRY header per the MS-ICO structure, so the result really is a
 * valid .ico regardless of image count.
 *
 * Reference: each ICONDIRENTRY's width/height byte is 0 to mean 256px (a
 * single byte can't represent 256 directly) — handled explicitly below.
 */
export interface IcoImageInput {
  width: number;
  height: number;
  pngBytes: Uint8Array;
}

export function buildIco(images: IcoImageInput[]): Uint8Array {
  if (images.length === 0) throw new Error("no-images");
  if (images.length > 255) throw new Error("too-many-images");

  const headerSize = 6;
  const entrySize = 16;
  const directorySize = headerSize + entrySize * images.length;

  let totalSize = directorySize;
  for (const image of images) totalSize += image.pngBytes.byteLength;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // ICONDIR
  view.setUint16(0, 0, true); // reserved
  view.setUint16(2, 1, true); // type: 1 = icon
  view.setUint16(4, images.length, true);

  let dataOffset = directorySize;
  images.forEach((image, i) => {
    const entryOffset = headerSize + i * entrySize;
    const widthByte = image.width >= 256 ? 0 : image.width;
    const heightByte = image.height >= 256 ? 0 : image.height;

    view.setUint8(entryOffset + 0, widthByte);
    view.setUint8(entryOffset + 1, heightByte);
    view.setUint8(entryOffset + 2, 0); // color count (0 = no palette, true color)
    view.setUint8(entryOffset + 3, 0); // reserved
    view.setUint16(entryOffset + 4, 1, true); // color planes
    view.setUint16(entryOffset + 6, 32, true); // bits per pixel
    view.setUint32(entryOffset + 8, image.pngBytes.byteLength, true);
    view.setUint32(entryOffset + 12, dataOffset, true);

    bytes.set(image.pngBytes, dataOffset);
    dataOffset += image.pngBytes.byteLength;
  });

  return bytes;
}

/** Minimal structural validation that a byte buffer really is a well-formed ICO (used by tests and, defensively, before offering the file for download). */
export function isValidIco(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 6) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const reserved = view.getUint16(0, true);
  const type = view.getUint16(2, true);
  const count = view.getUint16(4, true);
  if (reserved !== 0 || type !== 1 || count === 0) return false;
  if (bytes.byteLength < 6 + count * 16) return false;

  for (let i = 0; i < count; i++) {
    const entryOffset = 6 + i * 16;
    const size = view.getUint32(entryOffset + 8, true);
    const offset = view.getUint32(entryOffset + 12, true);
    if (offset + size > bytes.byteLength) return false;
    // Each embedded image must itself be a real PNG (signature check).
    const pngSignature = bytes.slice(offset, offset + 8);
    const expected = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (!expected.every((byte, idx) => pngSignature[idx] === byte)) return false;
  }
  return true;
}
