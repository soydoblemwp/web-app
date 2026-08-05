import { sanitizeFilename, buildOutputFilename, buildPaddedFilename } from "@/lib/public-tools/files/filenames";

export { sanitizeFilename, buildOutputFilename, buildPaddedFilename };

/**
 * Builds a download filename whose extension always matches the real
 * container/codec being written — never a renamed WebM presented as MP4,
 * never a renamed WAV presented as MP3 (spec section 40: "la extensión
 * debe coincidir con contenedor; MIME; codec esperado").
 */
export function buildMediaFilename(base: string, extension: string): string {
  return buildOutputFilename(base, extension);
}
