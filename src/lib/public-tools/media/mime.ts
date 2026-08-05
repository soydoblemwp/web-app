/**
 * Real magic-byte container sniffing — never trusts a file's extension or
 * browser-reported MIME type alone (spec section 13: "no muestres
 * formatos basándote únicamente en la extensión"). Only reads the first
 * ~32 bytes; never tries to fully parse the container.
 */
export type SniffedContainer = "wav" | "mp3" | "ogg" | "flac" | "mp4" | "webm-mkv" | "avi" | "unknown";

function bytesEqual(bytes: Uint8Array, offset: number, ascii: string): boolean {
  for (let i = 0; i < ascii.length; i++) {
    if (bytes[offset + i] !== ascii.charCodeAt(i)) return false;
  }
  return true;
}

export function sniffMediaContainer(bytes: Uint8Array): SniffedContainer {
  if (bytes.length < 12) return "unknown";

  if (bytesEqual(bytes, 0, "RIFF")) {
    if (bytesEqual(bytes, 8, "WAVE")) return "wav";
    if (bytesEqual(bytes, 8, "AVI ")) return "avi";
  }
  if (bytesEqual(bytes, 0, "ID3")) return "mp3";
  // MPEG frame sync: 11 set bits at the start (0xFFE0 mask), common for ID3-less MP3 files.
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return "mp3";
  if (bytesEqual(bytes, 0, "OggS")) return "ogg";
  if (bytesEqual(bytes, 0, "fLaC")) return "flac";
  if (bytesEqual(bytes, 4, "ftyp")) return "mp4";
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "webm-mkv";

  return "unknown";
}

export const CONTAINER_EXTENSIONS: Record<SniffedContainer, string[]> = {
  wav: ["wav"],
  mp3: ["mp3"],
  ogg: ["ogg", "opus"],
  flac: ["flac"],
  mp4: ["mp4", "m4a", "m4v"],
  "webm-mkv": ["webm", "mkv"],
  avi: ["avi"],
  unknown: [],
};

/** Whether a file's reported extension is at least plausible for its sniffed container — never a hard rejection on its own (some real MP4/M4A audio files legitimately share a container), only a signal surfaced to validation. */
export function extensionMatchesContainer(filename: string, container: SniffedContainer): boolean {
  const match = /\.([a-z0-9]+)$/i.exec(filename);
  if (!match) return false;
  const ext = match[1].toLowerCase();
  return CONTAINER_EXTENSIONS[container].includes(ext);
}
