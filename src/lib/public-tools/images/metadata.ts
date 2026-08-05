export type MetadataCategory =
  | "exif"
  | "gps"
  | "camera"
  | "date"
  | "orientation"
  | "comments"
  | "xmp"
  | "iptc"
  | "icc-profile";

export interface MetadataFinding {
  category: MetadataCategory;
  label: string;
  /** Present only for GPS — masked by default (spec section 18: "no muestres coordenadas GPS completas por defecto"). */
  detail?: string;
}

export interface MetadataDetectionResult {
  findings: MetadataFinding[];
  /** True only when this file format's structure was actually parsed byte-by-byte (JPEG) — for formats where we can only detect chunk *presence* (PNG/WebP), this stays false so the UI never overclaims precision. */
  fullyParsed: boolean;
}

const CATEGORY_LABELS: Record<MetadataCategory, string> = {
  exif: "Datos EXIF",
  gps: "Ubicación GPS",
  camera: "Cámara o dispositivo",
  date: "Fecha de captura",
  orientation: "Orientación",
  comments: "Comentarios",
  xmp: "Datos XMP",
  iptc: "Datos IPTC/Photoshop",
  "icc-profile": "Perfil de color (ICC)",
};

function readJpegSegments(bytes: Uint8Array): { marker: number; payload: Uint8Array }[] {
  const segments: { marker: number; payload: Uint8Array }[] = [];
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return segments;

  let offset = 2;
  while (offset < bytes.length - 1) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === 0xda) break; // start of scan — no more markers of interest follow in a meaningful position for our purposes

    if (offset + 4 > bytes.length) break;
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2 || offset + 2 + length > bytes.length) break;
    const payload = bytes.slice(offset + 4, offset + 2 + length);
    segments.push({ marker, payload });
    offset += 2 + length;
  }
  return segments;
}

function parseExifIfd(tiff: Uint8Array, littleEndian: boolean, ifdOffset: number): Map<number, { type: number; count: number; valueOffset: number }> {
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const entries = new Map<number, { type: number; count: number; valueOffset: number }>();
  if (ifdOffset + 2 > tiff.length) return entries;
  const entryCount = view.getUint16(ifdOffset, littleEndian);
  for (let i = 0; i < entryCount; i++) {
    const entryOffset = ifdOffset + 2 + i * 12;
    if (entryOffset + 12 > tiff.length) break;
    const tag = view.getUint16(entryOffset, littleEndian);
    const type = view.getUint16(entryOffset + 2, littleEndian);
    const count = view.getUint32(entryOffset + 4, littleEndian);
    const valueOffset = view.getUint32(entryOffset + 8, littleEndian);
    entries.set(tag, { type, count, valueOffset });
  }
  return entries;
}

function parseExifBlock(payload: Uint8Array): MetadataFinding[] {
  const findings: MetadataFinding[] = [];
  // "Exif\0\0" signature
  if (payload.length < 8 || String.fromCharCode(...payload.slice(0, 4)) !== "Exif") return findings;
  const tiff = payload.slice(6);
  if (tiff.length < 8) return findings;

  const byteOrder = String.fromCharCode(tiff[0], tiff[1]);
  if (byteOrder !== "II" && byteOrder !== "MM") return findings;
  const littleEndian = byteOrder === "II";
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const ifd0Offset = view.getUint32(4, littleEndian);

  const ifd0 = parseExifIfd(tiff, littleEndian, ifd0Offset);
  findings.push({ category: "exif", label: CATEGORY_LABELS.exif });

  if (ifd0.has(0x010f) || ifd0.has(0x0110)) findings.push({ category: "camera", label: CATEGORY_LABELS.camera });
  if (ifd0.has(0x0112)) findings.push({ category: "orientation", label: CATEGORY_LABELS.orientation });
  if (ifd0.has(0x0132)) findings.push({ category: "date", label: CATEGORY_LABELS.date });
  if (ifd0.has(0x8825)) findings.push({ category: "gps", label: CATEGORY_LABELS.gps, detail: "Se detectó información de ubicación en el archivo. Por privacidad, esta herramienta no extrae ni muestra las coordenadas — solo confirma su presencia." });

  const exifIfdPointer = ifd0.get(0x8769);
  if (exifIfdPointer) {
    const exifIfd = parseExifIfd(tiff, littleEndian, exifIfdPointer.valueOffset);
    if (exifIfd.has(0x9003) && !findings.some((f) => f.category === "date")) findings.push({ category: "date", label: CATEGORY_LABELS.date });
  }

  return findings;
}

/**
 * Detects metadata by actually parsing file structure (JPEG segments +
 * EXIF IFDs, per spec section 18) rather than guessing. For PNG/WebP, only
 * chunk *presence* is reported (fullyParsed: false) — an honest, bounded
 * claim rather than a fabricated full parse.
 */
export function detectImageMetadata(bytes: Uint8Array, mimeType: string): MetadataDetectionResult {
  if (mimeType === "image/jpeg") {
    const segments = readJpegSegments(bytes);
    const findings: MetadataFinding[] = [];
    let sawIcc = false;
    let sawXmp = false;
    let sawIptc = false;
    let sawComment = false;

    for (const segment of segments) {
      if (segment.marker === 0xe1) {
        const asString = String.fromCharCode(...segment.payload.slice(0, 30));
        if (asString.startsWith("Exif")) findings.push(...parseExifBlock(segment.payload));
        else if (asString.includes("http://ns.adobe.com/xap")) sawXmp = true;
      } else if (segment.marker === 0xe2) {
        const asString = String.fromCharCode(...segment.payload.slice(0, 12));
        if (asString.startsWith("ICC_PROFILE")) sawIcc = true;
      } else if (segment.marker === 0xed) {
        sawIptc = true;
      } else if (segment.marker === 0xfe) {
        sawComment = true;
      }
    }
    if (sawXmp) findings.push({ category: "xmp", label: CATEGORY_LABELS.xmp });
    if (sawIcc) findings.push({ category: "icc-profile", label: CATEGORY_LABELS["icc-profile"] });
    if (sawIptc) findings.push({ category: "iptc", label: CATEGORY_LABELS.iptc });
    if (sawComment) findings.push({ category: "comments", label: CATEGORY_LABELS.comments });

    return { findings, fullyParsed: true };
  }

  if (mimeType === "image/png") {
    const findings: MetadataFinding[] = [];
    let offset = 8; // skip PNG signature
    const decoder = new TextDecoder("ascii");
    while (offset + 8 <= bytes.length) {
      const length = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, false);
      const type = decoder.decode(bytes.slice(offset + 4, offset + 8));
      if (type === "tEXt" || type === "iTXt" || type === "zTXt") findings.push({ category: "comments", label: CATEGORY_LABELS.comments });
      if (type === "eXIf") findings.push({ category: "exif", label: CATEGORY_LABELS.exif });
      if (type === "iCCP") findings.push({ category: "icc-profile", label: CATEGORY_LABELS["icc-profile"] });
      if (type === "IEND") break;
      offset += 12 + length; // length + type(4) + data(length) + crc(4)
    }
    const unique = Array.from(new Map(findings.map((f) => [f.category, f])).values());
    return { findings: unique, fullyParsed: false };
  }

  // WebP (RIFF container) — presence-only check for EXIF/XMP chunks.
  if (mimeType === "image/webp") {
    const asString = String.fromCharCode(...bytes.slice(0, Math.min(bytes.length, 4096)));
    const findings: MetadataFinding[] = [];
    if (asString.includes("EXIF")) findings.push({ category: "exif", label: CATEGORY_LABELS.exif });
    if (asString.includes("XMP")) findings.push({ category: "xmp", label: CATEGORY_LABELS.xmp });
    return { findings, fullyParsed: false };
  }

  return { findings: [], fullyParsed: false };
}
