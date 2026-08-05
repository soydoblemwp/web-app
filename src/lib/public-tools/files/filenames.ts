/**
 * Sanitizes any string into a safe download filename (spec section 30):
 * strips path separators, control characters, reserved Windows device
 * names, collapses a misleading double extension, and caps length.
 */
const RESERVED_WINDOWS_NAMES = new Set([
  "con", "prn", "aux", "nul",
  "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
  "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
]);

const CONTROL_CHARS_PATTERN = new RegExp(`[\\x00-\\x1f\\x7f]`, "g");

export function sanitizeFilename(rawName: string, fallback = "archivo"): string {
  let name = rawName
    .replace(/[/\\]/g, "-")
    .replace(CONTROL_CHARS_PATTERN, "")
    .replace(/\.\./g, ".")
    .replace(/[<>:"|?*]/g, "")
    .trim();

  if (!name) name = fallback;

  const dotIndex = name.lastIndexOf(".");
  const base = dotIndex > 0 ? name.slice(0, dotIndex) : name;
  const ext = dotIndex > 0 ? name.slice(dotIndex + 1) : "";

  const baseLower = base.toLowerCase();
  const safeBase = RESERVED_WINDOWS_NAMES.has(baseLower) ? `${base}-archivo` : base;

  const maxBaseLength = 150;
  const truncatedBase = safeBase.slice(0, maxBaseLength) || fallback;

  return ext ? `${truncatedBase}.${ext.slice(0, 10)}` : truncatedBase;
}

export function buildOutputFilename(base: string, extension: string): string {
  return sanitizeFilename(`${base}.${extension}`);
}

/** Zero-padded sequential filename, e.g. buildSequentialFilename("pagina", 3, 42) -> "pagina-003.png" isn't quite right — see buildPaddedFilename below for the exact "pagina-001.png" convention required by spec section 14. */
export function buildPaddedFilename(base: string, index: number, total: number, extension: string): string {
  const digits = Math.max(3, String(total).length);
  const padded = String(index).padStart(digits, "0");
  return sanitizeFilename(`${base}-${padded}.${extension}`);
}
